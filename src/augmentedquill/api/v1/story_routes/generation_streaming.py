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
    prepare_chapter_summary_generation,
    prepare_continue_chapter_generation,
    prepare_story_summary_generation,
    prepare_write_chapter_generation,
)
from augmentedquill.services.story.story_api_stream_ops import (
    stream_collect_and_persist,
    stream_unified_chat_content,
)
from augmentedquill.services.exceptions import ServiceError
from augmentedquill.api.v1.story_routes.common import parse_json_body

router = APIRouter(tags=["Story"])


async def _create_gen_source(prepared: dict):
    """Create a generator source for streaming."""
    try:
        async for chunk in stream_unified_chat_content(
            messages=prepared["messages"],
            base_url=prepared["base_url"],
            api_key=prepared["api_key"],
            model_id=prepared["model_id"],
            timeout_s=prepared["timeout_s"],
        ):
            yield chunk
    except ServiceError as e:
        # Re-raise service errors as they are handled by the global exception handler for REST,
        # but for streaming we might need to yield an error event.
        # Security: Mask internal error details to prevent information exposure.
        yield f"data: {json.dumps({'error': f'A service error occurred during generation: {e.detail}'})}\n\n"
    except Exception as e:
        # Mask internal errors to avoid information exposure
        yield f"data: {json.dumps({'error': f'An internal error occurred during generation. {e}'})}\n\n"


def _as_streaming_response(gen_factory, media_type: str = "text/plain"):
    return StreamingResponse(gen_factory(), media_type=media_type)


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

        base_url, api_key, model_id, timeout_s, model_overrides = resolve_model_runtime(
            payload=payload,
            model_type="WRITING",
            base_dir=BASE_DIR,
        )

        # gather additional context for improved suggestions
        story_title = story.get("project_title", "")
        story_summary = story.get("story_summary", "")
        tags = story.get("tags", [])
        if isinstance(tags, list):
            story_tags = ", ".join(str(t) for t in tags)
        else:
            story_tags = str(tags)

        # pull in a bit of background from the sourcebook; use chapter title
        # and summary as queries so that only potentially relevant entries are
        # included.  dedupe by id in case both queries hit the same item.
        background = ""
        try:
            from augmentedquill.services.sourcebook.sourcebook_helpers import (
                sourcebook_search_entries,
                sourcebook_list_entries,
            )
            import re

            queries = []
            if title:
                queries.append(title)
            if summary:
                queries.append(summary)
            seen = set()
            lines = []
            for q in queries:
                for entry in sourcebook_search_entries(q):
                    eid = entry.get("id")
                    if not eid or eid in seen:
                        continue
                    seen.add(eid)
                    desc = entry.get("description", "")
                    lines.append(f"{entry.get('name', eid)}: {desc}")
            background = "\n".join(lines)

            # now also run an EDITING model pass to pick entries matching the
            # last few paragraphs of the chapter text
            text_for_relevance = current_text or ""
            paras = [p for p in re.split(r"\n\n+", text_for_relevance) if p.strip()]
            recent = "\n\n".join(paras[-3:]) if paras else ""
            all_entries = sourcebook_list_entries()
            selected_names: list[str] = []
            if all_entries and recent:

                # construct human-readable entry list and prompt using the
                # user prompt template defined in instructions.json; this keeps
                # all localized text out of Python code.
                entry_lines = []
                for e in all_entries:
                    syns = e.get("synonyms", []) or []
                    syn_text = f" ({', '.join(syns)})" if syns else ""
                    entry_lines.append(f"{e.get('name')}{syn_text}")

                selector_prompt = get_user_prompt(
                    "select_relevant_entries",
                    language=story.get("language", "en"),
                    recent_paragraphs=recent,
                    entries="\n".join(entry_lines),
                    user_prompt_overrides=model_overrides,
                )

                # note: we use the generic editing system message so the model
                # behaves consistently with other editing tasks
                edit_base, edit_key, edit_model, edit_timeout, _ = (
                    resolve_model_runtime(
                        payload=payload, model_type="EDITING", base_dir=BASE_DIR
                    )
                )
                sel_res = await llm.unified_chat_complete(
                    messages=[
                        {
                            "role": "system",
                            "content": get_system_message(
                                "editing_llm",
                                model_overrides,
                                language=story.get("language", "en"),
                            ),
                        },
                        {"role": "user", "content": selector_prompt},
                    ],
                    base_url=edit_base,
                    api_key=edit_key,
                    model_id=edit_model,
                    timeout_s=edit_timeout,
                )
                for name in re.split(r"[\n,]+", sel_res.get("content", "")):
                    name = name.strip()
                    if name:
                        selected_names.append(name)

            # append descriptions for any selected entries if not already present
            for name in selected_names:
                for entry in all_entries:
                    if entry.get("name") == name or name in (
                        entry.get("synonyms") or []
                    ):
                        eid = entry.get("id")
                        if eid and eid not in {
                            line.split(":")[0] for line in background.splitlines()
                        }:
                            desc = entry.get("description", "")
                            background += (
                                "\n" if background else ""
                            ) + f"{entry.get('name')}: {desc}"
                        break
        except Exception:
            # if any of the sourcebook logic fails, continue with whatever
            # background we've managed to collect above
            background = background

        prompt = get_user_prompt(
            "suggest_continuation",
            language=story.get("language", "en"),
            story_title=story_title,
            story_summary=story_summary,
            story_tags=story_tags,
            background=background,
            chapter_title=title or "",
            chapter_summary=summary or "",
            current_text=current_text or "",
            user_prompt_overrides=model_overrides,
        )

        # remove any sections that produced empty content to avoid blank
        # labels and collapse multiple blank lines to a single one.  this
        # keeps the model input lean and stops it from seeing meaningless
        # placeholders.
        import re

        lines = prompt.splitlines()
        filtered: list[str] = []
        for line in lines:
            # drop any line that looks like a label with nothing after colon
            if re.match(r"^[A-Za-z ]+:\s*$", line):
                continue
            filtered.append(line)
        # collapse consecutive blank lines
        cleaned: list[str] = []
        prev_blank = False
        for line in filtered:
            if not line.strip():
                if not prev_blank:
                    cleaned.append("")
                prev_blank = True
            else:
                cleaned.append(line)
                prev_blank = False
        prompt = "\n".join(cleaned)

        async def generate_suggestion():
            """Generate Suggestion."""
            try:
                startFound = False
                isNewParagraph = False
                async for chunk in llm.openai_completions_stream(
                    prompt=prompt,
                    base_url=base_url,
                    api_key=api_key,
                    model_id=model_id,
                    timeout_s=timeout_s,
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
            detail=f"An internal story suggestion error occurred: {e}",
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
            stream_collect_and_persist(lambda: _create_gen_source(prepared), _persist),
            media_type="text/event-stream",
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=f"An internal story summary error occurred: {e}",
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

        def _persist(content: str) -> None:
            prepared["path"].write_text(content, encoding="utf-8")

        return StreamingResponse(
            stream_collect_and_persist(lambda: _create_gen_source(prepared), _persist),
            media_type="text/event-stream",
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=f"An internal story write error occurred: {e}",
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

        def _persist(appended: str) -> None:
            """Persist."""
            new_content = (
                prepared["existing"]
                + (
                    "\n"
                    if prepared["existing"] and not prepared["existing"].endswith("\n")
                    else ""
                )
                + appended
            )
            prepared["path"].write_text(new_content, encoding="utf-8")

        return _as_streaming_response(
            lambda: stream_collect_and_persist(
                lambda: _create_gen_source(prepared), _persist
            )
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=f"An internal story continue error occurred: {e}",
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

        def _persist(new_summary: str) -> None:
            prepared["story"]["story_summary"] = new_summary
            save_story_config(prepared["story_path"], prepared["story"])

        return _as_streaming_response(
            lambda: stream_collect_and_persist(
                lambda: _create_gen_source(prepared), _persist
            )
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=f"An internal story-wide summary error occurred: {e}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An internal story-wide summary error occurred: {e}",
        )
