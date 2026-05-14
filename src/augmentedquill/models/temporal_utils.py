# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Shared temporal value normalization utilities.

Used by scene and sourcebook models to normalize ISO-like date/time strings
from user or LLM input into a consistent representation.
"""

from __future__ import annotations

import re

_BRACKET_TOKEN_RE = re.compile(r"\[[^\]]+\]")
_DATE_ONLY_RE = re.compile(r"^[+-]?\d{4,}-\d{2}-\d{2}$")
_DATE_TIME_MINUTE_RE = re.compile(
    r"^(?P<prefix>[+-]?\d{4,}-\d{2}-\d{2}[T ]\d{2}:\d{2})(?P<suffix>Z|[+-]\d{2}:?\d{2})?$"
)
_OFFSET_NO_COLON_RE = re.compile(r"([+-]\d{2})(\d{2})$")


def normalize_temporal_value(raw_value: str) -> str:
    """Normalize common date/time shorthand into a stable ISO-like string.

    Accepted shorthand examples:

    - ``1985-11-05``              → ``1985-11-05T12:00:00Z``
    - ``1985-11-05T20:00``        → ``1985-11-05T20:00:00Z``
    - ``1985-11-05 20:00``        → ``1985-11-05T20:00:00Z``
    - ``1985-11-05T20:00:00``     → ``1985-11-05T20:00:00Z``
    - ``1985-11-05T20:00:00+01:00`` → unchanged (already valid)
    """
    value = raw_value.strip()
    if not value:
        raise ValueError("temporal value cannot be empty")

    if _DATE_ONLY_RE.fullmatch(value):
        return f"{value}T12:00:00Z"

    normalized = value.replace(" ", "T", 1)
    minute_match = _DATE_TIME_MINUTE_RE.fullmatch(normalized)
    if minute_match:
        prefix = minute_match.group("prefix")
        suffix = minute_match.group("suffix") or "Z"
        normalized = f"{prefix}:00{suffix}"

    if normalized.endswith("z"):
        normalized = f"{normalized[:-1]}Z"

    if _OFFSET_NO_COLON_RE.search(normalized):
        normalized = _OFFSET_NO_COLON_RE.sub(r"\1:\2", normalized)

    base_no_brackets = _BRACKET_TOKEN_RE.sub("", normalized)
    has_offset_or_z = bool(re.search(r"(Z|[+-]\d{2}:\d{2})$", base_no_brackets))
    if "T" in base_no_brackets and not has_offset_or_z:
        normalized = f"{normalized}Z"

    return normalized
