# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the chat unit so this responsibility stays isolated, testable, and easy to evolve.

API endpoints for chat sessions and conversational interactions with the LLM writing partner.
"""

import datetime
import re
import augmentedquill.services.llm.llm as llm
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pathlib import Path
from uuid import uuid4

from augmentedquill.core.config import (
    load_machine_config,
    load_story_config,
    DEFAULT_STORY_CONFIG_PATH,
)
from augmentedquill.api.v1.http_responses import error_json, ok_json
from augmentedquill.services.projects.projects import get_active_project_dir
from augmentedquill.services.llm.llm import add_llm_log, create_log_entry
from augmentedquill.services.chat.chat_tool_decorator import (
    execute_registered_tool,
    get_registered_tool_schemas,
)
from augmentedquill.services.chat.chat_api_helpers import (
    inject_project_images,
    normalize_chat_messages,
)
from augmentedquill.services.chat.chat_api_stream_ops import (
    resolve_stream_model_context,
    ensure_system_message_if_missing,
    resolve_story_llm_prefs,
    inject_chat_user_context,
)
from augmentedquill.services.projects.project_snapshots import (
    capture_project_snapshot,
    restore_project_snapshot,
)
from augmentedquill.services.chat.chat_api_session_ops import (
    list_active_chats,
    load_active_chat,
    save_active_chat,
    delete_active_chat,
    delete_all_active_chats,
)
import augmentedquill.services.chat.chat_api_proxy_ops as _chat_api_proxy_ops
import json as _json
from typing import Any, Dict
from augmentedquill.models.chat import ChatInitialStateResponse
from augmentedquill.utils.json_repair import try_parse_json_robust
from augmentedquill.api.v1.request_body import parse_json_object_body
from augmentedquill.utils.path_utils import safe_child_path

router = APIRouter(tags=["Chat"])

proxy_openai_models = _chat_api_proxy_ops.proxy_openai_models
httpx = _chat_api_proxy_ops.httpx


_CHAT_TOOL_BATCH_DIR = ".aq_history/chat_tool_batches"
_BATCH_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _safe_child_path(base_dir: Path, *parts: str) -> Path:
    try:
        return safe_child_path(base_dir, *parts)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path component")


def _validated_batch_id(batch_id: str) -> str:
    if not _BATCH_ID_PATTERN.fullmatch(batch_id or ""):
        raise HTTPException(status_code=400, detail="Invalid batch id")
    return batch_id


def _snapshot_storage_dir(project_dir: Path, batch_id: str) -> Path:
    safe_batch_id = _validated_batch_id(batch_id)
    return _safe_child_path(project_dir, _CHAT_TOOL_BATCH_DIR, safe_batch_id)


def _store_chat_tool_batch_snapshot(
    project_dir: Path,
    batch_id: str,
    before_snapshot: Dict[str, str],
    after_snapshot: Dict[str, str],
    tool_names: list[str],
):
    """Persist before/after snapshots for reversible tool-call batches."""
    target_dir = _snapshot_storage_dir(project_dir, batch_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    metadata = {
        "batch_id": batch_id,
        "created_at": datetime.datetime.now().isoformat(),
        "tool_names": tool_names,
        "before": before_snapshot,
        "after": after_snapshot,
    }
    (target_dir / "batch.json").write_text(_json.dumps(metadata), encoding="utf-8")


def _load_chat_tool_batch_snapshot(project_dir: Path, batch_id: str) -> Dict[str, Any]:
    batch_file = _snapshot_storage_dir(project_dir, batch_id) / "batch.json"
    if not batch_file.exists():
        raise HTTPException(
            status_code=404, detail=f"Unknown chat tool batch: {batch_id}"
        )
    return _json.loads(batch_file.read_text(encoding="utf-8"))


def _build_chat_tool_batch_label(tool_names: list[str]) -> str:
    if not tool_names:
        return "AI tool batch"
    if len(tool_names) == 1:
        return f"AI tool: {tool_names[0]}"
    if len(tool_names) == 2:
        return f"AI tools: {tool_names[0]}, {tool_names[1]}"
    return f"AI tools: {tool_names[0]} (+{len(tool_names) - 1})"


@router.get("/chat", response_model=ChatInitialStateResponse)
async def api_get_chat() -> ChatInitialStateResponse:
    """Return initial state for chat view: models and current selection."""
    machine = load_machine_config() or {}
    openai_cfg = (machine.get("openai") or {}) if isinstance(machine, dict) else {}
    models_list = openai_cfg.get("models") if isinstance(openai_cfg, dict) else []

    model_names = []
    if isinstance(models_list, list):
        model_names = [
            m.get("name") for m in models_list if isinstance(m, dict) and m.get("name")
        ]

    selected = openai_cfg.get("selected", "") if isinstance(openai_cfg, dict) else ""
    # Coerce to a valid selection
    if model_names:
        if not selected:
            selected = model_names[0]
        elif selected not in model_names:
            selected = model_names[0]

    return {
        "models": model_names,
        "current_model": selected,
        "messages": [],  # History is client-managed; this is a placeholder.
    }


@router.post("/chat/tools")
async def api_chat_tools(request: Request) -> JSONResponse:
    """Execute OpenAI-style tool calls and return tool messages.

    The endpoint does not call the upstream LLM; it only executes provided tool_calls
    from the last assistant message and returns corresponding {role:"tool"} messages.

    Body JSON:
      {
        "model_name": str | null,
        "messages": [
          {"role":"user|assistant|system|tool", "content": str, "tool_calls"?: [{"id":str, "type":"function", "function": {"name": str, "arguments": str}}], "tool_call_id"?: str, "name"?: str}
        ],
        "active_chapter_id"?: int
      }
    """
    payload = await parse_json_object_body(request)

    messages = payload.get("messages") or []
    model_type = str((payload or {}).get("model_type") or "CHAT").upper()
    if not isinstance(messages, list):
        return error_json("messages must be an array", status_code=400)

    last = messages[-1] if messages else None
    tool_calls: list = []
    if isinstance(last, dict):
        t = last.get("tool_calls")
        if isinstance(t, list):
            tool_calls = t

    appended: list[dict] = []
    mutations = {"story_changed": False}
    tool_names: list[str] = []
    active_project_dir = get_active_project_dir()
    before_snapshot: Dict[str, str] | None = None
    batch_id: str | None = None

    if active_project_dir and tool_calls:
        before_snapshot = capture_project_snapshot(active_project_dir)
        batch_id = f"batch-{uuid4().hex}"

    # Determine project language for typographic quote handling in tool arguments.
    project_language = "en"
    active = get_active_project_dir()
    if active:
        story_cfg = load_story_config(active / "story.json") or {}
        project_language = str(story_cfg.get("language", "en") or "en")

    for call in tool_calls:
        if not isinstance(call, dict):
            continue
        call_id = str(call.get("id") or "")
        func = call.get("function") or {}
        name = (func.get("name") if isinstance(func, dict) else None) or ""
        args_raw = (func.get("arguments") if isinstance(func, dict) else None) or "{}"
        try:
            args_obj = (
                try_parse_json_robust(args_raw, language=project_language)
                if isinstance(args_raw, str)
                else (args_raw or {})
            )
        except (ValueError, TypeError):
            args_obj = {}
        if not name or not call_id:
            continue
        tool_names.append(name)
        msg = await execute_registered_tool(
            name,
            args_obj,
            call_id,
            payload,
            mutations,
            tool_role=model_type,
        )
        appended.append(msg)

    if (
        active_project_dir
        and batch_id
        and before_snapshot is not None
        and mutations.get("story_changed")
    ):
        after_snapshot = capture_project_snapshot(active_project_dir)
        _store_chat_tool_batch_snapshot(
            active_project_dir,
            batch_id,
            before_snapshot,
            after_snapshot,
            tool_names,
        )
        mutations["tool_batch"] = {
            "batch_id": batch_id,
            "tool_names": tool_names,
            "operation_count": len(tool_names),
            "label": _build_chat_tool_batch_label(tool_names),
        }

    # Log tool execution if there were any
    if appended:
        log_entry = create_log_entry(
            "/api/v1/chat/tools", "POST", {}, {"tool_calls": tool_calls}
        )
        log_entry["response"]["status_code"] = 200
        log_entry["response"]["body"] = {"appended_messages": appended}
        log_entry["timestamp_end"] = datetime.datetime.now().isoformat()
        add_llm_log(log_entry)

    return ok_json(appended_messages=appended, mutations=mutations)


@router.post("/chat/tools/undo/{batch_id}")
async def api_chat_tools_undo(batch_id: str) -> JSONResponse:
    """Undo a previously executed chat-tool batch by restoring snapshot content."""
    project_dir = get_active_project_dir()
    if not project_dir:
        return error_json("No active project selected", status_code=400)

    batch = _load_chat_tool_batch_snapshot(project_dir, batch_id)
    before_snapshot = batch.get("before")
    if not isinstance(before_snapshot, dict):
        return error_json("Invalid chat tool batch snapshot", status_code=500)

    restore_project_snapshot(project_dir, before_snapshot)
    return ok_json(ok=True, batch_id=batch_id)


@router.post("/chat/tools/redo/{batch_id}")
async def api_chat_tools_redo(batch_id: str) -> JSONResponse:
    """Redo a previously undone chat-tool batch by restoring post-batch snapshot."""
    project_dir = get_active_project_dir()
    if not project_dir:
        return error_json("No active project selected", status_code=400)

    batch = _load_chat_tool_batch_snapshot(project_dir, batch_id)
    after_snapshot = batch.get("after")
    if not isinstance(after_snapshot, dict):
        return error_json("Invalid chat tool batch snapshot", status_code=500)

    restore_project_snapshot(project_dir, after_snapshot)
    return ok_json(ok=True, batch_id=batch_id)


@router.post("/chat/stream")
async def api_chat_stream(request: Request) -> StreamingResponse:
    """Stream chat with the configured OpenAI-compatible model.

    Body JSON:
      {
        "model_name": "name-of-configured-entry" | null,
        "model_type": "CHAT" | "WRITING" | "EDITING" | null,
        "messages": [{"role": "system|user|assistant", "content": str}, ...],
        // optional overrides (otherwise pulled from runtime user machine config)
        "base_url": str,
        "api_key": str,
        "model": str,
        "timeout_s": int
      }

    Returns: Streaming text response with the assistant's message.
    """
    payload = await parse_json_object_body(request)

    req_messages = normalize_chat_messages((payload or {}).get("messages"))
    if not req_messages:
        raise HTTPException(status_code=400, detail="messages array is required")

    # Load config to determine model capabilities and overrides
    machine = load_machine_config() or {}
    stream_ctx = resolve_stream_model_context(payload, machine)
    model_type = stream_ctx["model_type"]
    selected_name = stream_ctx["selected_name"]
    base_url = stream_ctx["base_url"]
    api_key = stream_ctx["api_key"]
    model_id = stream_ctx["model_id"]
    timeout_s = stream_ctx["timeout_s"]
    is_multimodal = stream_ctx["is_multimodal"]
    supports_function_calling = stream_ctx["supports_function_calling"]
    chosen = stream_ctx["chosen"]

    # Inject images if referenced in the last user message and supported
    if is_multimodal:
        await inject_project_images(req_messages)

    # Prepend system message if not present
    ensure_system_message_if_missing(
        req_messages,
        model_type=model_type,
        machine=machine,
        selected_name=selected_name,
    )

    # If it's a chat, inject current chapter context into the latest user message
    if model_type == "CHAT":
        try:
            story = (
                load_story_config(
                    (get_active_project_dir() or Path(".")) / "story.json"
                )
                or {}
            )
            project_lang = str(story.get("language", "en") or "en")
        except (OSError, ValueError, TypeError):
            project_lang = "en"
        inject_chat_user_context(req_messages, payload, language=project_lang)

    if not base_url or not model_id:
        raise HTTPException(
            status_code=400, detail="Missing base_url or model in configuration"
        )

    temperature, max_tokens = resolve_story_llm_prefs(
        config_dir=DEFAULT_STORY_CONFIG_PATH.parent,
        active_project_dir=get_active_project_dir(),
    )

    def _to_float(value):
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def _to_int(value):
        try:
            if value is None or value == "":
                return None
            return int(value)
        except (TypeError, ValueError):
            return None

    model_temperature = _to_float((chosen or {}).get("temperature"))
    if model_temperature is None:
        model_temperature = temperature

    model_max_tokens = _to_int((chosen or {}).get("max_tokens"))
    if model_max_tokens is None:
        model_max_tokens = max_tokens

    extra_body: Dict[str, Any] = {}
    for key in (
        "top_p",
        "presence_penalty",
        "frequency_penalty",
        "seed",
        "top_k",
        "min_p",
    ):
        value = (chosen or {}).get(key)
        if value is not None:
            extra_body[key] = value

    stop = (chosen or {}).get("stop")
    if isinstance(stop, list) and stop:
        extra_body["stop"] = [str(entry) for entry in stop]

    raw_extra_body = (chosen or {}).get("extra_body")
    if isinstance(raw_extra_body, str) and raw_extra_body.strip():
        try:
            parsed_extra = _json.loads(raw_extra_body)
            if isinstance(parsed_extra, dict):
                extra_body.update(parsed_extra)
        except (_json.JSONDecodeError, TypeError):
            # Invalid JSON is ignored by design so users can save drafts safely.
            pass

    # Pass through OpenAI tool-calling fields if provided
    tool_choice = None
    story_tools = get_registered_tool_schemas(model_type=model_type)
    if supports_function_calling:
        tool_choice = (payload or {}).get("tool_choice")
        # If the client explicitly requests "none", do not send tools.
        # This prevents some models from hallucinating tool usage even when told not to.
        if tool_choice == "none":
            pass
    if model_type == "WRITING":
        story_tools = None
        tool_choice = None
        supports_function_calling = False

    async def _gen():
        """Gen."""
        try:
            async for chunk in llm.unified_chat_stream(
                caller_id="api.chat.stream",
                model_type=model_type,
                messages=req_messages,
                base_url=base_url,
                api_key=api_key,
                model_id=model_id,
                timeout_s=timeout_s,
                model_name=selected_name,
                supports_function_calling=supports_function_calling,
                tools=story_tools,
                tool_choice=tool_choice if tool_choice != "none" else None,
                temperature=model_temperature,
                max_tokens=model_max_tokens,
                extra_body=extra_body,
                skip_validation=True,  # Trust configured models
            ):
                # Transform to client expected format
                if "content" in chunk:
                    yield f"data: {_json.dumps({'content': chunk['content']})}\n\n"
                if "thinking" in chunk:
                    yield f"data: {_json.dumps({'thinking': chunk['thinking']})}\n\n"
                if "tool_calls" in chunk:
                    yield f"data: {_json.dumps({'tool_calls': chunk['tool_calls']})}\n\n"
        except Exception as e:
            # Mask internal errors to prevent information exposure, but log for debugability
            import logging

            logging.error(f"Chat stream error: {e}", exc_info=True)
            yield f"data: {_json.dumps({'error': f'An internal chat stream error occurred: {e}'})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream")


@router.get("/chats")
async def api_list_chats():
    return list_active_chats()


@router.get("/chats/{chat_id}")
async def api_load_chat(chat_id: str):
    return load_active_chat(chat_id)


@router.post("/chats/{chat_id}")
async def api_save_chat(chat_id: str, request: Request):
    """Api Save Chat."""
    data = await parse_json_object_body(request)
    save_active_chat(chat_id, data)
    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def api_delete_chat(chat_id: str):
    delete_active_chat(chat_id)
    return {"ok": True}


@router.delete("/chats")
async def api_delete_all_chats():
    delete_all_active_chats()
    return {"ok": True}


@router.post("/openai/models")
async def proxy_list_models(request: Request) -> JSONResponse:
    """Fetch `${base_url}/models` using provided credentials.

    Body JSON:
      {"base_url": str, "api_key": str | None, "timeout_s": int | None}

    Returns the JSON payload from the upstream (expected to include a `data` array).
    """
    payload = await parse_json_object_body(request)
    return await proxy_openai_models(payload)
