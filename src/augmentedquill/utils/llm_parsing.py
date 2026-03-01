# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the llm parsing unit so this responsibility stays isolated, testable, and easy to evolve.

Utilities for parsing assistant messages, extracting tool calls, and handling generated Markdown.
"""

from __future__ import annotations

import json as _json
import re
from typing import Any


def parse_tool_calls_from_content(content: str) -> list[dict] | None:
    """Parse tool calls from assistant content if not provided in structured format.

    Handles various formats like:
    - <tool_call>get_project_overview</tool_call>
    - <tool_call><function=get_project_overview></function></tool_call>
    - [TOOL_CALL]get_project_overview[/TOOL_CALL]
    - Tool: get_project_overview
    """

    calls = []

    # 1. Look for <tool_call> tags
    pattern1 = r"<tool_call>(.*?)</tool_call>"
    matches1 = re.finditer(pattern1, content, re.IGNORECASE | re.DOTALL)

    for m in matches1:
        content_inner = m.group(1).strip()

        # Try JSON format: {"name": "...", "arguments": ...}
        if content_inner.startswith("{"):
            try:
                json_obj = _json.loads(content_inner)
                if isinstance(json_obj, dict) and "name" in json_obj:
                    name = json_obj["name"]
                    args_obj = json_obj.get("arguments", {})

                    call_id = f"call_{name}"
                    if any(c["id"] == call_id for c in calls):
                        call_id = f"{call_id}_{len(calls)}"

                    calls.append(
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": _json.dumps(args_obj),
                            },
                            "original_text": m.group(0),
                        }
                    )
                    continue
            except Exception:
                pass

        # Try XML-like format: <function=NAME>ARGS</function>
        xml_match = re.search(
            r"<function=(\w+)>(.*?)</function>",
            content_inner,
            re.IGNORECASE | re.DOTALL,
        )
        if xml_match:
            name = xml_match.group(1)
            args_str = xml_match.group(2).strip() or "{}"
            try:
                args_obj = _json.loads(args_str)
            except Exception:
                args_obj = {}

            call_id = f"call_{name}"
            # Ensure unique ID if multiple calls to same tool
            if any(c["id"] == call_id for c in calls):
                call_id = f"{call_id}_{len(calls)}"

            calls.append(
                {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": name, "arguments": _json.dumps(args_obj)},
                    "original_text": m.group(0),
                }
            )
            continue

        # Try NAME(ARGS) format
        func_match = re.match(r"(\w+)(?:\((.*)\))?", content_inner, re.DOTALL)
        if func_match:
            name = func_match.group(1)
            args_str = func_match.group(2) or "{}"
            try:
                args_obj = _json.loads(args_str)
            except Exception:
                args_obj = {}

            call_id = f"call_{name}"
            if any(c["id"] == call_id for c in calls):
                call_id = f"{call_id}_{len(calls)}"

            calls.append(
                {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": name, "arguments": _json.dumps(args_obj)},
                    "original_text": m.group(0),
                }
            )

    # 2. Look for [TOOL_CALL] tags
    pattern2 = r"\[TOOL_CALL\]\s*(.*?)\s*\[/TOOL_CALL\]"
    matches2 = re.finditer(pattern2, content, re.IGNORECASE | re.DOTALL)

    for m in matches2:
        content_inner = m.group(1).strip()
        func_match = re.match(r"(\w+)(?:\s*\((.*?)\))?", content_inner, re.DOTALL)
        if func_match:
            name = func_match.group(1)
            args_str = func_match.group(2).strip() if func_match.group(2) else "{}"
            try:
                args_obj = _json.loads(args_str)
            except Exception:
                args_obj = {}

            call_id = f"call_{name}"
            if any(c["id"] == call_id for c in calls):
                call_id = f"{call_id}_{len(calls)}"

            calls.append(
                {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": name, "arguments": _json.dumps(args_obj)},
                    "original_text": m.group(0),
                }
            )

    # 3. Look for "Tool:" prefix (must be at start of line or after whitespace)
    pattern3 = r"(?:^|(?<=\s))Tool:\s+(\w+)(?:\(([^)]*)\))?"
    matches3 = re.finditer(pattern3, content, re.IGNORECASE)

    for m in matches3:
        name = m.group(1)
        args_str = m.group(2).strip() if m.group(2) else "{}"
        try:
            args_obj = _json.loads(args_str) if args_str != "{}" else {}
        except Exception:
            args_obj = {}

        call_id = f"call_{name}"
        if any(c["id"] == call_id for c in calls):
            call_id = f"{call_id}_{len(calls)}"

        calls.append(
            {
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": _json.dumps(args_obj)},
                "original_text": m.group(0),
            }
        )

    # 4. Look for <|channel|>commentary to=functions.NAME ... <|message|>JSON
    pattern4 = r"(?:<\|start\|>assistant)?<\|channel\|>commentary to=functions\.(\w+).*?<\|message\|>(.*?)(?=<\||$)"
    matches4 = re.finditer(pattern4, content, re.IGNORECASE | re.DOTALL)

    for m in matches4:
        name = m.group(1)
        args_str = m.group(2).strip() or "{}"
        try:
            args_obj = _json.loads(args_str)
        except Exception:
            args_obj = {}

        call_id = f"call_{name}"
        if any(c["id"] == call_id for c in calls):
            call_id = f"{call_id}_{len(calls)}"

        calls.append(
            {
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": _json.dumps(args_obj)},
                "original_text": m.group(0),
            }
        )

    return calls if calls else None


def strip_thinking_tags(content: str) -> str:
    """Strip thinking/analysis tags from content, returning only the final message."""
    if not content:
        return content

    # Handle <|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>
    if "<|channel|>analysis<|message|>" in content:
        # Try to find the final channel
        final_match = re.search(
            r"<\|channel\|>final<\|message\|>(.*)", content, re.DOTALL
        )
        if final_match:
            return final_match.group(1).strip()
        # Fall back to stripping analysis sections when the stream terminates
        # before a final channel block is emitted.
        content = re.sub(
            r"<\|channel\|>analysis<\|message\|>.*?<\|end\|>",
            "",
            content,
            flags=re.DOTALL,
        )
        content = re.sub(
            r"<\|start\|>assistant<\|channel\|>final<\|message\|>", "", content
        )
        return content.strip()

    # Handle <thought>...</thought> or <thinking>...</thinking>
    content = re.sub(r"<(thought|thinking)>.*?</\1>", "", content, flags=re.DOTALL)

    return content.strip()


def strip_tool_call_tags(content: str) -> str:
    """Strip inline tool-call markup from assistant content."""
    if not content:
        return content
    content = re.sub(r"<tool_call>.*?</tool_call>", "", content, flags=re.DOTALL)
    content = re.sub(
        r"\[TOOL_CALL\]\s*.*?\s*\[/TOOL_CALL\]",
        "",
        content,
        flags=re.DOTALL,
    )
    return content.strip()


def extract_thinking_from_content(content: str) -> str:
    """Extract first thinking/thought block content from assistant text."""
    if not content:
        return ""

    match = re.search(
        r"<(thought|thinking)>(.*?)</\1>",
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        return ""
    return (match.group(2) or "").strip()


def parse_complete_assistant_output(
    content: str,
    structured_tool_calls: list[dict] | None = None,
) -> dict[str, Any]:
    """Parse complete assistant output into normalized content/tool_calls/thinking."""
    tool_calls = list(structured_tool_calls or [])
    parsed_calls = parse_tool_calls_from_content(content or "") or []
    if parsed_calls:
        tool_calls.extend(parsed_calls)

    thinking = extract_thinking_from_content(content or "")
    cleaned_content = strip_tool_call_tags(strip_thinking_tags(content or ""))
    return {
        "content": cleaned_content,
        "tool_calls": tool_calls,
        "thinking": thinking,
    }


def normalize_tool_channel_name(name: str) -> str:
    """Normalize channel-derived function names to registered tool names."""
    cleaned = (name or "").strip()
    if cleaned.startswith("functions."):
        cleaned = cleaned.split("functions.", 1)[1]
    return cleaned


def parse_stream_channel_fragments(
    fragments: list[dict[str, str]],
    sent_tool_call_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Convert ChannelFilter fragments to normalized stream events."""
    events: list[dict[str, Any]] = []
    seen_ids = sent_tool_call_ids if sent_tool_call_ids is not None else set()

    for fragment in fragments:
        channel = fragment.get("channel", "")
        piece = fragment.get("content", "")
        if not piece and channel != "tool_def":
            continue

        if channel in {"thinking", "thought"}:
            if piece:
                events.append({"thinking": piece})
            continue

        if channel.startswith("commentary to="):
            func_name = normalize_tool_channel_name(
                channel.split("commentary to=", 1)[1].strip()
            )
            if not func_name:
                continue
            call_id = f"call_{func_name}"
            if call_id in seen_ids:
                continue
            seen_ids.add(call_id)
            events.append(
                {
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {"name": func_name, "arguments": piece},
                        }
                    ]
                }
            )
            continue

        if channel.startswith("call:"):
            func_name = normalize_tool_channel_name(channel[5:])
            if not func_name:
                continue
            call_id = f"call_{func_name}"
            if call_id in seen_ids:
                continue
            seen_ids.add(call_id)
            events.append(
                {
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {"name": func_name, "arguments": piece},
                        }
                    ]
                }
            )
            continue

        if channel == "tool_def":
            continue

        piece_lower = piece.lower()
        has_tool_syntax = (
            "<tool_call" in piece_lower
            or "[tool_call" in piece_lower
            or piece_lower.strip().startswith("tool:")
        )
        if has_tool_syntax:
            parsed_calls = parse_tool_calls_from_content(piece) or []
            if parsed_calls:
                new_calls = [c for c in parsed_calls if c.get("id") not in seen_ids]
                if new_calls:
                    for call in new_calls:
                        call_id = call.get("id")
                        if isinstance(call_id, str):
                            seen_ids.add(call_id)
                    events.append({"tool_calls": new_calls})
                continue

        events.append({"content": piece})

    return events
