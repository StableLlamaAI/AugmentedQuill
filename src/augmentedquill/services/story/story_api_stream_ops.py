# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the story api stream ops unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable

from augmentedquill.services.llm import llm


async def stream_unified_chat_content(
    *,
    messages: list,
    base_url: str,
    api_key: str | None,
    model_id: str,
    timeout_s: int,
    model_name: str | None = None,
    model_type: str | None = None,
    tools: list[dict] | None = None,
) -> AsyncIterator[dict]:
    """Stream Unified Chat Content as event dictionaries (content, thinking, tool_calls)."""
    async for chunk_dict in llm.unified_chat_stream(
        caller_id="story_api_stream.stream_unified_chat_content",
        messages=messages,
        base_url=base_url,
        api_key=api_key,
        model_id=model_id,
        timeout_s=timeout_s,
        model_name=model_name,
        model_type=model_type,
        tools=tools,
    ):
        yield chunk_dict


async def stream_collect_and_persist(
    stream_factory: Callable[[], AsyncIterator[dict]],
    persist_on_complete: Callable[[str], None],
    chunk_transformer: Callable[[str], str] | None = None,
) -> AsyncIterator[str]:
    """Stream Collect And Persist.

    This helper consumes an upstream stream of dicts and yields only the
    `content` fragments as plain strings. That makes it compatible with
    Starlette StreamingResponse which expects byte/str chunks.
    """
    buf: list[str] = []
    try:
        async for chunk_dict in stream_factory():
            content = chunk_dict.get("content", "")
            if content:
                # Store transformed (raw) chunk for persistence
                raw_chunk = chunk_transformer(content) if chunk_transformer else content
                buf.append(raw_chunk)
            yield content
    except asyncio.CancelledError:
        return

    try:
        persist_on_complete("".join(buf))
    except Exception:
        pass
