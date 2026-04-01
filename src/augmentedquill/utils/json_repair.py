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

from augmentedquill.core.prompts import get_system_message


def _get_typographic_quotes(language: str = "en") -> tuple[str, str, str, str]:
    """Return the opening/closing typographic quote characters for a language."""

    double_open = (
        get_system_message("typographic_quotes_open", language=language) or "“"
    )
    double_close = (
        get_system_message("typographic_quotes_close", language=language) or "”"
    )
    single_open = (
        get_system_message("typographic_single_quotes_open", language=language) or "‘"
    )
    single_close = (
        get_system_message("typographic_single_quotes_close", language=language) or "’"
    )

    # Fallback if the prompts file contains unexpected values.
    if not double_open:
        double_open = "“"
    if not double_close:
        double_close = "”"
    if not single_open:
        single_open = "‘"
    if not single_close:
        single_close = "’"

    return double_open, double_close, single_open, single_close


def apply_typographic_quotes(text: str, language: str = "en") -> str:
    """Convert straight quotes in `text` into typographic quotes for the language."""

    double_open, double_close, single_open, single_close = _get_typographic_quotes(
        language
    )

    def _smart_replace(
        text_value: str, quote_char: str, open_q: str, close_q: str
    ) -> str:
        # Preserve escaped quote sequences (e.g. \" or \\') by splitting on
        # unescaped quote characters.
        pattern = r"(?<!\\)" + re.escape(quote_char)
        parts = re.split(pattern, text_value)
        result = ""
        for i, part in enumerate(parts):
            result += part
            if i < len(parts) - 1:
                result += open_q if i % 2 == 0 else close_q
        return result

    # Convert quotes using a simple alternating rule as a best-effort repair.
    text = _smart_replace(text, '"', double_open, double_close)
    text = _smart_replace(text, "'", single_open, single_close)

    return text


# Keep backward compatibility for private-style usage
_apply_typographic_quotes = apply_typographic_quotes


def repair_json_quotes(json_str: str, language: str = "en") -> str:
    """
    Attempts to repair a JSON string where the LLM failed to escape double quotes
    or used unescaped quotes inside what should be a standard JSON string.

    It converts unescaped inner quotes into typographic quotes to ensure the
    JSON remains valid while preserving the intended punctuation.
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

        # Convert quotes inside the value using the language-specific quote styles.
        converted = apply_typographic_quotes(content, language=language)

        # Escape newlines for valid JSON
        converted = converted.replace("\n", "\\n").replace("\r", "\\r")

        return f"{prefix}{converted}{suffix}"

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


def try_parse_json_robust(json_str: str, language: str = "en") -> Any:
    """
    Tries to parse JSON, and if it fails, attempts to repair quote issues before trying again.

    The repair step uses language-specific typographic quote characters where available.
    """
    if not json_str:
        return None

    try:
        return _json.loads(json_str)
    except _json.JSONDecodeError:
        try:
            repaired = repair_json_quotes(json_str, language=language)
            return _json.loads(repaired)
        except Exception:
            # Fallback to original error if repair fails or doesn't help
            return _json.loads(json_str)
