# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the generation streaming unit so this responsibility stays isolated, testable, and easy to evolve."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import json
import re

from augmentedquill.core.config import BASE_DIR, save_story_config
from augmentedquill.core.prompts import get_user_prompt, get_system_message
from augmentedquill.services.llm import llm
from augmentedquill.services.story.story_api_prompt_ops import (
    resolve_model_runtime,
)
from augmentedquill.services.story.story_api_state_ops import (
    ensure_chapter_slot,
    get_active_story_or_raise,
    get_chapter_locator,
    get_normalized_chapters,
    read_text_or_raise,
)
from augmentedquill.services.story.story_generation_common import (
    gather_writing_context,
    prepare_ai_action_generation,
    prepare_chapter_summary_generation,
    prepare_continue_chapter_generation,
    prepare_story_summary_generation,
    prepare_write_chapter_generation,
    sanitize_prompt,
)
from augmentedquill.services.story.story_api_stream_ops import (
    stream_collect_and_persist,
    stream_unified_chat_content,
)
from augmentedquill.services.exceptions import ServiceError
from augmentedquill.api.v1.story_routes.common import parse_json_body

router = APIRouter(tags=["Story"])


async def _create_gen_source_pure(prepared: dict):
    """Create a generator source for streaming."""
    async for chunk in stream_unified_chat_content(
        messages=prepared["messages"],
        base_url=prepared["base_url"],
        api_key=prepared["api_key"],
        model_id=prepared["model_id"],
        timeout_s=prepared["timeout_s"],
        model_name=prepared.get("model_name"),
        model_type=prepared.get("model_type"),
    ):
        yield chunk


async def _create_gen_source(prepared: dict):
    """Create a generator source for streaming wrapped in SSE data events."""
    try:
        async for chunk in _create_gen_source_pure(prepared):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
    except ServiceError as e:
        # Re-raise service errors as they are handled by the global exception handler for REST,
        # but for streaming we might need to yield an error event.
        # Security: Mask internal error details to prevent information exposure.
        yield f"data: {json.dumps({'error': f'A service error occurred during generation: {e.detail}'})}\n\n"
    except Exception as e:
        # Include the underlying reason so users can troubleshoot provider issues.
        yield f"data: {json.dumps({'error': f'An internal error occurred during generation. {e}'})}\n\n"


def _as_streaming_response(gen_factory, media_type: str = "text/event-stream"):
    return StreamingResponse(gen_factory(), media_type=media_type)


@router.post("/story/sourcebook/relevance")
async def api_story_sourcebook_relevance(request: Request):
    """Ask the WRITING model which sourcebook entries are relevant.

    This is a lightweight helper used by the frontend to keep checkboxes
    in sync.  It is deliberately separate from the prose suggestion call so
    that we can run it in the background on every text change.
    """
    try:
        payload = await parse_json_body(request)
        chap_id = (payload or {}).get("chap_id")
        if not isinstance(chap_id, int):
            raise ServiceError("chap_id is required", status_code=400)

        _, path, pos = get_chapter_locator(chap_id)
        current_text = (payload or {}).get("current_text")
        if not isinstance(current_text, str):
            current_text = read_text_or_raise(path)

        # gather story and entries
        _, _, story = get_active_story_or_raise()
        all_entries = []
        try:
            from augmentedquill.services.sourcebook.sourcebook_helpers import (
                sourcebook_list_entries,
            )

            all_entries = sourcebook_list_entries()
        except Exception:
            # if sourcebook is unavailable, just return empty list
            return {"relevant": []}

        # prepare prompt using same template as before; model_type WRITING
        # build newline-separated list: name plus synonyms in parentheses
        entry_lines = []
        for e in all_entries:
            parts = [e.get("name", "")]
            syns = e.get("synonyms") or []
            if syns:
                parts.append(f"({', '.join(syns)})")
            entry_lines.append(" ".join(parts))
        text_for_relevance = current_text or ""
        paras = [p for p in re.split(r"\n\n+", text_for_relevance) if p.strip()]
        recent = "\n\n".join(paras[-3:]) if paras else ""

        prompt = get_user_prompt(
            "select_relevant_entries",
            language=story.get("language", "en"),
            recent_paragraphs=recent,
            entries="\n".join(entry_lines),
            user_prompt_overrides={},
        )

        (
            base_url,
            api_key,
            model_id,
            timeout_s,
            model_name,
            model_overrides,
            _model_type,
        ) = resolve_model_runtime(
            payload=payload,
            model_type="WRITING",
            base_dir=BASE_DIR,
        )
        # guarantee at least 120 seconds for background relevance requests to
        # reduce spurious ReadTimeouts when using slow reasoning models.
        if timeout_s is None or timeout_s < 120:
            timeout_s = 120

        # ask the model synchronously and return the list of names.  If the
        # request fails (timeout, network error, etc.) we treat it as a
        # non‑fatal problem because relevance is a best‑effort feature.  Anything
        # that isn't immediately useful should just yield an empty result so the
        # frontend can continue working without an error dialog.
        try:
            res = await llm.unified_chat_complete(
                caller_id="api.story.sourcebook_relevance",
                model_type="WRITING",
                messages=[
                    {
                        "role": "system",
                        "content": get_system_message(
                            "entry_selector",
                            model_overrides,
                            language=story.get("language", "en"),
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                base_url=base_url,
                api_key=api_key,
                model_id=model_id,
                timeout_s=timeout_s,
                model_name=model_name,
            )
            raw = res.get("content", "")
            # split on newlines/commas and trim
            relevant_names = [
                name.strip() for name in re.split(r"[\n,]+", raw) if name.strip()
            ]

            relevant_ids = []
            for name in relevant_names:
                for e in all_entries:
                    if e.get("name") == name or name in (e.get("synonyms") or []):
                        eid = e.get("id")
                        if eid:
                            relevant_ids.append(eid)
                        break

            return {"relevant": relevant_ids}
        except Exception as e:
            # log the failure for debugging then return an empty list; the
            # front end already ignores errors, but returning a 200 with no
            # entries keeps the UI quiet and avoids repeated exception noise.
            # We don't have a request/response to log here; just record the
            # fact that the background relevance check failed so developers can
            # see it when inspecting the logs.
            from augmentedquill.services import llm as _llm_module

            _llm_module.llm_logging.add_llm_log(
                {
                    "relevance_error": str(e),
                }
            )
            return {"relevant": []}
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An internal story relevance error occurred: {e}"
        )


@router.post("/story/suggest")
async def api_story_suggest(request: Request) -> StreamingResponse:
    """Api Story Suggest."""
    try:
        payload = await parse_json_body(request)

        chap_id = (payload or {}).get("chap_id")
        if not isinstance(chap_id, int):
            raise ServiceError("chap_id is required", status_code=400)

        _, path, pos = get_chapter_locator(chap_id)
        current_text = (payload or {}).get("current_text")
        if not isinstance(current_text, str):
            current_text = read_text_or_raise(path)

        _, _, story = get_active_story_or_raise()
        chapters_data = get_normalized_chapters(story)
        ensure_chapter_slot(chapters_data, pos)
        summary = chapters_data[pos].get("summary", "")
        title = chapters_data[pos].get("title") or path.name

        (
            base_url,
            api_key,
            model_id,
            timeout_s,
            model_name,
            model_overrides,
            _model_type,
        ) = resolve_model_runtime(
            payload=payload,
            model_type="WRITING",
            base_dir=BASE_DIR,
        )

        context = gather_writing_context(
            story=story,
            chapters_data=chapters_data,
            pos=pos,
            title=title or "",
            summary=summary or "",
            payload=payload,
        )

        prompt = get_user_prompt(
            "suggest_continuation",
            language=story.get("language", "en"),
            project_type_label=context["project_type_label"],
            story_title=context["story_title"],
            story_summary=context["story_summary"],
            story_tags=context["story_tags"],
            background=context["background"],
            chapter_title=title or "",
            chapter_summary=summary or "",
            chapter_conflicts=context["chapter_conflicts"],
            current_text=current_text or "",
            user_prompt_overrides=model_overrides,
        )

        # remove any sections that produced empty content to avoid blank
        # labels and collapse multiple blank lines to a single one.  this
        # keeps the model input lean and stops it from seeing meaningless
        # placeholders.
        prompt = sanitize_prompt(prompt)

        async def generate_suggestion():
            """Generate Suggestion."""
            try:
                startFound = False
                isNewParagraph = False
                async for chunk in llm.openai_completions_stream(
                    caller_id="api.story.suggest",
                    prompt=prompt,
                    base_url=base_url,
                    api_key=api_key,
                    model_id=model_id,
                    timeout_s=timeout_s,
                    model_name=model_name,
                ):
                    while chunk.lstrip(" \t").startswith("\n") and not startFound:
                        chunk = chunk.lstrip(" \t")[1:]
                        if not isNewParagraph:
                            yield "\n"
                        isNewParagraph = True
                    if chunk == "":
                        continue
                    startFound = True
                    lines = chunk.splitlines()
                    yield lines[0]
                    if len(lines) > 1:
                        break
            except Exception:
                # Mask internal errors
                yield "\n[Error occurred during suggestion]"

        return StreamingResponse(generate_suggestion(), media_type="text/plain")

    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An internal story suggestion error occurred: {e}"
        )


@router.post("/story/summary/stream")
async def api_story_summary_stream(request: Request):
    """Api Story Summary Stream."""
    try:
        payload = await parse_json_body(request)
        prepared = prepare_chapter_summary_generation(
            payload,
            payload.get("chap_id"),
            payload.get("mode") or "",
        )

        def _persist(new_summary: str) -> None:
            prepared["chapters_data"][prepared["pos"]]["summary"] = new_summary
            prepared["story"]["chapters"] = prepared["chapters_data"]
            save_story_config(prepared["story_path"], prepared["story"])

        return StreamingResponse(
            stream_collect_and_persist(
                lambda: _create_gen_source_pure(prepared),
                persist_on_complete=_persist,
            ),
            media_type="text/event-stream",
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An internal story summary error occurred: {e}"
        )


@router.post("/story/write/stream")
async def api_story_write_stream(request: Request):
    """Api Story Write Stream."""
    try:
        payload = await parse_json_body(request)
        prepared = prepare_write_chapter_generation(payload, payload.get("chap_id"))

        return StreamingResponse(
            stream_collect_and_persist(
                lambda: _create_gen_source_pure(prepared),
                persist_on_complete=lambda content: prepared["path"].write_text(
                    content, encoding="utf-8"
                ),
            ),
            media_type="text/event-stream",
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An internal story write error occurred: {e}"
        )


@router.post("/story/continue/stream")
async def api_story_continue_stream(request: Request):
    """Api Story Continue Stream."""
    try:
        payload = await parse_json_body(request)
        prepared = prepare_continue_chapter_generation(payload, payload.get("chap_id"))

        return _as_streaming_response(
            lambda: stream_collect_and_persist(
                lambda: _create_gen_source_pure(prepared),
                persist_on_complete=lambda content: prepared["path"].write_text(
                    (read_text_or_raise(prepared["path"]) + content), encoding="utf-8"
                ),
            )
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"An internal story continue error occurred: {e}"
        )


@router.post("/story/story-summary/stream")
async def api_story_story_summary_stream(request: Request):
    """Api Story Story Summary Stream."""
    try:
        payload = await parse_json_body(request)
        prepared = prepare_story_summary_generation(payload, payload.get("mode") or "")

        return _as_streaming_response(lambda: _create_gen_source(prepared))
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=e.detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An internal story-wide summary error occurred: {e}",
        )


@router.post("/story/action/stream")
async def api_story_action_stream(request: Request):
    """Stream generic AI Actions (Extend/Rewrite/Summary update)."""
    try:
        payload = await parse_json_body(request)
        prepared = prepare_ai_action_generation(payload)

        return _as_streaming_response(lambda: _create_gen_source(prepared))
    except ServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
