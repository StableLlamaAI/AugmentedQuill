# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the repair_json_quotes utility to fix common LLM mistakes in JSON tool arguments.

Purpose: Fix unescaped double quotes and handle typographic quotes in JSON strings.
"""

from __future__ import annotations

import json as _json
import re
from typing import Any


def repair_json_quotes(json_str: str) -> str:
    """
    Attempts to repair a JSON string where the LLM failed to escape double quotes
    or used unescaped quotes inside what should be a standard JSON string.

    It converts unescaped inner double quotes into typographic quotes (“ ”)
    to ensure the JSON remains valid while preserving the intended punctuation.
    """
    if not json_str or not isinstance(json_str, str):
        return json_str

    try:
        # If it already parses, don't touch it
        _json.loads(json_str)
        return json_str
    except _json.JSONDecodeError:
        pass

    def convert_to_typographic(match: re.Match) -> str:
        prefix = match.group(1)  # e.g., '"text": "'
        content = match.group(2)  # e.g., 'He said "Hello" to me'
        suffix = match.group(3)  # e.g., '"' or '",'

        # Convert unescaped " to typographic quotes within the content.
        # We alternate between opening and closing typographic quotes for a basic repair.
        parts = re.split(r'(?<!\\)"', content)
        new_content = ""
        for i, part in enumerate(parts):
            new_content += part
            if i < len(parts) - 1:
                # Open on even index, close on odd
                new_content += "“" if i % 2 == 0 else "”"

        # Escape newlines for valid JSON
        new_content = new_content.replace("\n", "\\n").replace("\r", "\\r")

        return f"{prefix}{new_content}{suffix}"

    # Pattern for typical tool arguments: "key": "value"
    # We use a greedy match on the content to find the LAST possible valid quote,
    # ensuring we capture the full string value if it contains unescaped quotes.
    repaired = re.sub(
        r'("[\w ]+":\s*")(.*)("(?=\s*(?:,|\})))',
        convert_to_typographic,
        json_str,
        flags=re.DOTALL,
    )

    return repaired


def try_parse_json_robust(json_str: str) -> Any:
    """
    Tries to parse JSON, and if it fails, attempts to repair quote issues before trying again.
    """
    if not json_str:
        return None

    try:
        return _json.loads(json_str)
    except _json.JSONDecodeError:
        try:
            repaired = repair_json_quotes(json_str)
            return _json.loads(repaired)
        except Exception:
            # Fallback to original error if repair fails or doesn't help
            return _json.loads(json_str)
