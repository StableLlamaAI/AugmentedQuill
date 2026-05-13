# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Pydantic models for scenes – the structural planning layer of a project.

A Scene represents a narrative unit that may span part of a chapter, an entire
chapter, or remain unlinked from any prose (planning-only).  Scenes can also
have Beats – sub-units of action within a scene, each optionally linked to a
specific prose range.

Prose links carry a content hash so the frontend can detect when the underlying
text file was modified outside AugmentedQuill and warn the user that the stored
offset may be stale.
"""

from __future__ import annotations

import re
import uuid
from typing import Optional

from pydantic import BaseModel, Field, model_validator

_BRACKET_TOKEN_RE = re.compile(r"\[[^\]]+\]")
_DATE_ONLY_RE = re.compile(r"^[+-]?\d{4,}-\d{2}-\d{2}$")
_DATE_TIME_MINUTE_RE = re.compile(
    r"^(?P<prefix>[+-]?\d{4,}-\d{2}-\d{2}[T ]\d{2}:\d{2})(?P<suffix>Z|[+-]\d{2}:?\d{2})?$"
)
_OFFSET_NO_COLON_RE = re.compile(r"([+-]\d{2})(\d{2})$")


def _normalize_scene_temporal_value(raw_value: str) -> str:
    """Normalize common date/time shorthand into a stable ISO-like string.

    Accepted shorthand examples:
    - ``1985-11-05`` -> ``1985-11-05T12:00:00Z``
    - ``1985-11-05T20:00`` -> ``1985-11-05T20:00:00Z``
    - ``1985-11-05 20:00`` -> ``1985-11-05T20:00:00Z``
    - ``1985-11-05T20:00:00`` -> ``1985-11-05T20:00:00Z``
    """
    value = raw_value.strip()
    if not value:
        raise ValueError("scene_time value cannot be empty")

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


class SceneProseLink(BaseModel):
    """A link between a scene (or beat) and a specific text range in the prose.

    ``scope_type`` distinguishes between:
    - ``'story'`` – the main story content file (short-story projects)
    - ``'chapter'`` – a specific chapter file (novel / series projects)

    ``start_offset`` and ``end_offset`` are UTF-8 character offsets within the
    content of the referenced file.  ``end_offset`` being ``None`` means the
    scene/beat runs to the end of the file from ``start_offset``.

    ``content_hash`` is the first 16 hex characters of the SHA-256 digest of
    the file content at the time the link was last saved.  The frontend
    compares this against the current content hash to detect external changes.
    """

    scope_type: str  # 'story' | 'chapter'
    chapter_id: Optional[str] = None
    book_id: Optional[str] = None
    start_offset: int = 0
    end_offset: Optional[int] = None
    content_hash: str = ""
    is_stale: bool = False  # computed at read time; never persisted


class SceneBeat(BaseModel):
    """A single beat within a scene – a discrete micro-action or plot step."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    prose_link: Optional[SceneProseLink] = None


class SceneChronologyTime(BaseModel):
    """Scene-local timeline point represented as a Temporal ZonedDateTime string."""

    temporal_zoned_datetime: str

    @model_validator(mode="before")
    @classmethod
    def _coerce_and_normalize_input(cls, data: object) -> object:
        """Accept shorthand scene_time payloads from tools and normalize them."""
        if isinstance(data, str):
            return {"temporal_zoned_datetime": _normalize_scene_temporal_value(data)}

        if isinstance(data, dict):
            raw = data.get("temporal_zoned_datetime")
            if raw is None and "value" in data:
                raw = data.get("value")

            if isinstance(raw, str):
                normalized = _normalize_scene_temporal_value(raw)
                merged = dict(data)
                merged["temporal_zoned_datetime"] = normalized
                merged.pop("value", None)
                return merged

        return data


class Scene(BaseModel):
    """A narrative scene used for structural story planning.

    Active characters, passive characters, location, and time are stored as
    sourcebook entry IDs so the frontend can look them up by reference.

    ``order_before`` / ``order_after`` store IDs of other scenes that must
    chronologically precede or follow this one respectively – these form the
    temporal constraint graph rendered on the pinboard.

    ``pinboard_x`` / ``pinboard_y`` store the card's free-form position on the
    pinboard canvas, in logical (unscaled) units.
    """

    id: str
    summary: str = ""
    beats: list[SceneBeat] = []
    active_characters: list[str] = []
    passive_characters: list[str] = []
    sourcebook_entry_ids: list[str] = []
    location: Optional[str] = None
    time: Optional[str] = None
    scene_time: Optional[SceneChronologyTime] = None
    color_tag: Optional[str] = None  # hex color, e.g. "#a855f7"
    prose_link: Optional[SceneProseLink] = None  # used when beats is empty
    order_before: list[str] = []  # scene IDs this scene must precede
    order_after: list[str] = []  # scene IDs this scene must follow
    pinboard_x: float = 100.0
    pinboard_y: float = 100.0
    status: str = "active"  # 'active' | 'inactive' | 'draft'


# ---------------------------------------------------------------------------
# Request / response bodies
# ---------------------------------------------------------------------------


class SceneCreateRequest(BaseModel):
    """Payload for creating a new scene."""

    summary: str = ""
    beats: list[SceneBeat] = []
    active_characters: list[str] = []
    passive_characters: list[str] = []
    sourcebook_entry_ids: list[str] = []
    location: Optional[str] = None
    time: Optional[str] = None
    scene_time: Optional[SceneChronologyTime] = None
    color_tag: Optional[str] = None
    prose_link: Optional[SceneProseLink] = None
    order_before: list[str] = []
    order_after: list[str] = []
    pinboard_x: float = 100.0
    pinboard_y: float = 100.0
    status: str = "active"


class SceneUpdateRequest(BaseModel):
    """Payload for updating an existing scene (full replacement)."""

    summary: Optional[str] = None
    beats: Optional[list[SceneBeat]] = None
    active_characters: Optional[list[str]] = None
    passive_characters: Optional[list[str]] = None
    sourcebook_entry_ids: Optional[list[str]] = None
    location: Optional[str] = None
    time: Optional[str] = None
    scene_time: Optional[SceneChronologyTime] = None
    color_tag: Optional[str] = None
    prose_link: Optional[SceneProseLink] = None
    order_before: Optional[list[str]] = None
    order_after: Optional[list[str]] = None
    pinboard_x: Optional[float] = None
    pinboard_y: Optional[float] = None
    status: Optional[str] = None


class SceneLinkProseRequest(BaseModel):
    """Payload for assigning a prose-text range to a scene.

    The offsets are UTF-8 character positions within the referenced content
    file.  Validation against existing scene links happens in the service.
    """

    scope_type: str = "story"  # 'story' | 'chapter'
    chapter_id: Optional[str] = None
    book_id: Optional[str] = None
    start_offset: int
    end_offset: int


class SceneReorderProseRequest(BaseModel):
    """Payload for reordering scenes within a linked prose scope."""

    source_scene_id: str
    target_scene_id: str
    place_before: bool = True


class SceneReorderProseResponse(BaseModel):
    """Result of a prose reorder transaction."""

    scenes: list[Scene]
    scope_type: str
    chapter_id: Optional[str] = None
    book_id: Optional[str] = None
    scope_start: int
    scope_end: int
    rebuilt_text: str


class SceneUpdateProseContentRequest(BaseModel):
    """Payload for replacing the prose text at a scene's linked offsets."""

    text: str


class ProseConflictError(Exception):
    """Raised when a new prose range would create a hole in an existing scene."""

    def __init__(self, conflicting_scene_id: str) -> None:
        super().__init__(f"Range creates a hole in scene '{conflicting_scene_id}'")
        self.conflicting_scene_id = conflicting_scene_id
