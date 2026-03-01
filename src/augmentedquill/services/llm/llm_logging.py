# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the llm logging unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

import datetime
import uuid
import os
import json
from typing import Any, Dict, List

# Global list to store LLM communication logs for the current session
llm_logs: List[Dict[str, Any]] = []


def add_llm_log(log_entry: Dict[str, Any]):
    """Add a log entry to the global list, keeping only the last 100 entries.

    If AUGQ_LLM_DUMP is set, also append the raw log to a file.
    """
    if log_entry not in llm_logs:
        llm_logs.append(log_entry)
        if len(llm_logs) > 100:
            llm_logs.pop(0)

    # Raw logging to file if enabled
    if os.getenv("AUGQ_LLM_DUMP") == "1":
        default_path = os.path.join("data", "logs", "llm_raw.log")
        log_path = os.getenv("AUGQ_LLM_DUMP_PATH") or default_path
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        try:
            # Custom formatting: collapse tool definitions to one line each for readability
            processed_entry = json.loads(json.dumps(log_entry, default=str))

            # If there are tools in the request body, collapse them
            collapsed_tools = []
            if (
                isinstance(processed_entry, dict)
                and "request" in processed_entry
                and isinstance(processed_entry["request"], dict)
                and "body" in processed_entry["request"]
                and isinstance(processed_entry["request"]["body"], dict)
                and "tools" in processed_entry["request"]["body"]
            ):

                tools = processed_entry["request"]["body"]["tools"]
                if isinstance(tools, list):
                    for tool in tools:
                        collapsed_tools.append(json.dumps(tool, default=str))
                    # Replace with the collapsed string list for the final JSON dump
                    processed_entry["request"]["body"]["tools"] = collapsed_tools

            with open(log_path, "a", encoding="utf-8") as f:
                f.write("=" * 80 + "\n")
                f.write(f"TIMESTAMP: {datetime.datetime.now().isoformat()}\n")
                f.write("-" * 80 + "\n")

                # Render JSON
                log_text = json.dumps(processed_entry, indent=2, default=str)

                # Post-process to unquote and unescape the collapsed tool strings so they appear as flat JSON lines
                if "request" in processed_entry and collapsed_tools:
                    # Look for the strings we just created that start with tool markers
                    # This is a bit hacky but keeps the output valid JSON-ish and very readable
                    for tool in collapsed_tools:
                        quoted_tool = json.dumps(tool)
                        log_text = log_text.replace(quoted_tool, tool)

                f.write(log_text + "\n")
                f.write("=" * 80 + "\n\n")
        except Exception:
            # Silently fail if log cannot be written (dev-only feature)
            pass


def create_log_entry(
    url: str, method: str, headers: Dict[str, str], body: Any, streaming: bool = False
) -> Dict[str, Any]:
    """Create a new log entry structure."""
    safe_body = body
    if isinstance(body, dict):
        safe_body = body.copy()
        for key in ["api_key", "secret", "password"]:
            if key in safe_body:
                safe_body[key] = "REDACTED"

    return {
        "id": str(uuid.uuid4()),
        "timestamp_start": datetime.datetime.now().isoformat(),
        "timestamp_end": None,
        "request": {
            "url": url,
            "method": method,
            "headers": {
                k: ("***" if k.lower() in ("authorization", "x-api-key") else v)
                for k, v in headers.items()
            },
            "body": safe_body,
        },
        "response": {
            "status_code": None,
            "streaming": streaming,
            "chunks": [] if streaming else None,
            "full_content": "" if streaming else None,
            "body": None if not streaming else None,
            "error_detail": None,
        },
    }
