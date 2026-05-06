# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Scene service – CRUD operations for scenes stored inside story.json.

Scenes are persisted in the project's ``story.json`` under the ``scenes`` key
as a dict keyed by scene ID.  This is the same storage convention used by the
sourcebook so normalisation / serialisation is handled consistently.

The ``content_hash`` on each prose link is compared against the current file
hash when the frontend reads scenes; staleness detection is therefore
client-driven but based on data computed here.
"""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any

from augmentedquill.core.config import load_story_config, save_story_config
from augmentedquill.models.scene import (
    ProseConflictError,
    SceneCreateRequest,
    SceneLinkProseRequest,
    SceneProseLink,
    SceneUpdateRequest,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_file_hash(path: Path) -> str:
    """Return first 16 hex chars of SHA-256 of file content, or '' if missing."""
    if not path.exists():
        return ""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest[:16]


def _scene_content_path(project_dir: Path, link: dict[str, Any]) -> Path | None:
    """Resolve the prose file path for a given prose-link dict.

    Handles all three project shapes:
    - short-story: ``content.md`` at project root
    - novel: ``chapters/<chapter_id>.md`` (or as stored in chapters list)
    - series: ``books/<book_id>/<chapter_id>.md``
    """
    scope = link.get("scope_type", "")
    if scope == "story":
        # Short-story content file
        for name in ("content.md", "draft.md"):
            candidate = project_dir / name
            if candidate.exists():
                return candidate
        return project_dir / "content.md"

    if scope == "chapter":
        chapter_id = link.get("chapter_id") or ""
        book_id = link.get("book_id") or ""
        if not chapter_id:
            return None
        # Series: books/<book_id>/<chapter_id>
        if book_id:
            p = project_dir / "books" / book_id / chapter_id
            if not p.suffix:
                p = p.with_suffix(".md")
            return p
        # Novel: chapters/<chapter_id> or <chapter_id> directly
        for base in (project_dir / "chapters", project_dir):
            p = base / chapter_id
            if not p.suffix:
                p = p.with_suffix(".md")
            if p.exists():
                return p
        # Fall back to chapters subdirectory regardless
        p = project_dir / "chapters" / chapter_id
        if not p.suffix:
            p = p.with_suffix(".md")
        return p

    return None


def _normalise_scene(raw: dict[str, Any]) -> dict[str, Any]:
    """Ensure default fields exist on a raw scene dict read from disk."""
    raw.setdefault("summary", "")
    raw.setdefault("beats", [])
    raw.setdefault("active_characters", [])
    raw.setdefault("passive_characters", [])
    raw.setdefault("order_before", [])
    raw.setdefault("order_after", [])
    raw.setdefault("pinboard_x", 100.0)
    raw.setdefault("pinboard_y", 100.0)
    raw.setdefault("status", "active")
    return raw


def _attach_stale_flags(
    scenes: list[dict[str, Any]], project_dir: Path
) -> list[dict[str, Any]]:
    """Compute and attach ``is_stale`` to each prose link based on file hash.

    Staleness means the stored ``content_hash`` no longer matches the current
    on-disk hash, i.e. the file was modified outside AugmentedQuill.
    """
    for scene in scenes:
        _check_link_staleness(scene.get("prose_link"), project_dir)
        for beat in scene.get("beats", []):
            _check_link_staleness(beat.get("prose_link"), project_dir)
    return scenes


def _check_link_staleness(link: dict[str, Any] | None, project_dir: Path) -> None:
    """Mutate *link* in-place to add ``is_stale`` field."""
    if not link:
        return
    stored_hash = link.get("content_hash", "")
    if not stored_hash:
        link["is_stale"] = False
        return
    content_path = _scene_content_path(project_dir, link)
    current_hash = _compute_file_hash(content_path) if content_path else ""
    link["is_stale"] = stored_hash != current_hash


# ---------------------------------------------------------------------------
# Public service API
# ---------------------------------------------------------------------------


def list_scenes(project_dir: Path) -> list[dict[str, Any]]:
    """Return all scenes for a project, sorted by pinboard_y then pinboard_x."""
    story = load_story_config(project_dir / "story.json") or {}
    raw_scenes = story.get("scenes", {})
    if isinstance(raw_scenes, dict):
        scenes = [
            _normalise_scene({"id": scene_id, **data})
            for scene_id, data in raw_scenes.items()
        ]
    elif isinstance(raw_scenes, list):
        scenes = [_normalise_scene(s) for s in raw_scenes]
    else:
        scenes = []
    _attach_stale_flags(scenes, project_dir)
    return sorted(
        scenes, key=lambda s: (s.get("pinboard_y", 0), s.get("pinboard_x", 0))
    )


def get_scene(project_dir: Path, scene_id: str) -> dict[str, Any] | None:
    """Return a single scene dict, or None if not found."""
    story = load_story_config(project_dir / "story.json") or {}
    raw_scenes = story.get("scenes", {})
    if isinstance(raw_scenes, dict):
        raw = raw_scenes.get(scene_id)
        if raw is None:
            return None
        scene = _normalise_scene({"id": scene_id, **raw})
    elif isinstance(raw_scenes, list):
        matches = [s for s in raw_scenes if s.get("id") == scene_id]
        if not matches:
            return None
        scene = _normalise_scene(matches[0])
    else:
        return None
    _attach_stale_flags([scene], project_dir)
    return scene


def create_scene(project_dir: Path, payload: SceneCreateRequest) -> dict[str, Any]:
    """Create and persist a new scene; returns the saved scene dict."""
    scene_id = str(uuid.uuid4())
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    if "scenes" not in story or not isinstance(story["scenes"], dict):
        story["scenes"] = {}
    data = payload.model_dump(exclude_none=False)
    data.pop("id", None)  # id is derived, not stored in dict value
    story["scenes"][scene_id] = data
    save_story_config(story_path, story)
    scene = _normalise_scene({"id": scene_id, **payload.model_dump(exclude_none=False)})
    _attach_stale_flags([scene], project_dir)
    return scene


def update_scene(
    project_dir: Path, scene_id: str, payload: SceneUpdateRequest
) -> dict[str, Any] | None:
    """Apply a partial update to a scene; returns the updated scene or None."""
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict: dict[str, Any] = {}

    # Normalise storage format to dict
    raw = story.get("scenes", {})
    if isinstance(raw, dict):
        scenes_dict = raw
    elif isinstance(raw, list):
        scenes_dict = {
            s.get("id", ""): {k: v for k, v in s.items() if k != "id"} for s in raw
        }

    if scene_id not in scenes_dict:
        return None

    existing = scenes_dict[scene_id]
    updates = payload.model_dump(exclude_none=True)
    existing.update(updates)
    scenes_dict[scene_id] = existing
    story["scenes"] = scenes_dict
    save_story_config(story_path, story)
    result = _normalise_scene({"id": scene_id, **existing})
    _attach_stale_flags([result], project_dir)
    return result


def delete_scene(project_dir: Path, scene_id: str) -> bool:
    """Delete a scene by ID.  Returns True if deleted, False if not found."""
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_raw = story.get("scenes", {})
    deleted = False

    if isinstance(scenes_raw, dict):
        if scene_id in scenes_raw:
            del scenes_raw[scene_id]
            deleted = True
            for sid, data in scenes_raw.items():
                data["order_before"] = [
                    s for s in data.get("order_before", []) if s != scene_id
                ]
                data["order_after"] = [
                    s for s in data.get("order_after", []) if s != scene_id
                ]
            story["scenes"] = scenes_raw
    elif isinstance(scenes_raw, list):
        original_len = len(scenes_raw)
        scenes_raw = [s for s in scenes_raw if s.get("id") != scene_id]
        deleted = len(scenes_raw) < original_len
        for scene in scenes_raw:
            scene["order_before"] = [
                s for s in scene.get("order_before", []) if s != scene_id
            ]
            scene["order_after"] = [
                s for s in scene.get("order_after", []) if s != scene_id
            ]
        story["scenes"] = scenes_raw

    if deleted:
        save_story_config(story_path, story)
    return deleted


def update_prose_link_hash(
    project_dir: Path,
    scene_id: str,
    beat_id: str | None,
    link: SceneProseLink,
) -> SceneProseLink:
    """Recompute the content hash for a prose link and persist it."""
    content_path = _scene_content_path(project_dir, link.model_dump())
    current_hash = _compute_file_hash(content_path) if content_path else ""
    updated = link.model_copy(update={"content_hash": current_hash})

    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_raw = story.get("scenes", {})
    if not isinstance(scenes_raw, dict):
        return updated
    scene_data = scenes_raw.get(scene_id)
    if scene_data is None:
        return updated
    if beat_id:
        for beat in scene_data.get("beats", []):
            if beat.get("id") == beat_id:
                beat["prose_link"] = updated.model_dump()
                break
    else:
        scene_data["prose_link"] = updated.model_dump()
    save_story_config(story_path, story)
    return updated


def _load_scenes_dict(story: dict[str, Any]) -> dict[str, Any]:
    """Return the scenes as a plain dict keyed by scene-ID (normalises list storage)."""
    raw = story.get("scenes", {})
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        return {s.get("id", ""): {k: v for k, v in s.items() if k != "id"} for s in raw}
    return {}


def link_prose(
    project_dir: Path,
    target_scene_id: str,
    request: SceneLinkProseRequest,
) -> list[dict[str, Any]]:
    """Assign a prose range to *target_scene_id*, adjusting any overlapping scenes.

    Overlap rules (for every existing scene S with a prose link in the same scope):

    - No overlap                      → no change
    - New range fully contains S      → S gets unlinked
    - New range cuts the start of S   → S start trimmed to N_end
    - New range cuts the end of S     → S end trimmed to N_start
    - New range is interior to S      → ProseConflictError (would create a hole)

    Returns the list of all modified scene dicts (including target).
    Raises ProseConflictError if the operation would create a hole.
    Raises ValueError for invalid offsets.
    """
    n_start = request.start_offset
    n_end = request.end_offset

    if n_start >= n_end:
        raise ValueError("start_offset must be less than end_offset")

    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)

    modified_ids: list[str] = []

    for scene_id, scene_data in scenes_dict.items():
        if scene_id == target_scene_id:
            continue
        link = scene_data.get("prose_link")
        if not link:
            continue
        if link.get("scope_type") != request.scope_type:
            continue
        if link.get("chapter_id") != request.chapter_id:
            continue
        if link.get("book_id") != request.book_id:
            continue

        s_start: int = link.get("start_offset", 0)
        s_end_raw = link.get("end_offset")
        s_end: float = float("inf") if s_end_raw is None else s_end_raw

        # No overlap
        if n_end <= s_start or n_start >= s_end:
            continue

        if n_start <= s_start and n_end >= s_end:
            # New fully contains existing → unlink existing
            scenes_dict[scene_id] = {**scene_data, "prose_link": None}
            modified_ids.append(scene_id)
        elif n_start > s_start and n_end < s_end:
            # Interior → hole → forbidden
            raise ProseConflictError(scene_id)
        elif n_start <= s_start:
            # Cuts the start of S → trim S to [n_end, s_end]
            scenes_dict[scene_id] = {
                **scene_data,
                "prose_link": {**link, "start_offset": n_end},
            }
            modified_ids.append(scene_id)
        else:
            # n_end >= s_end already handled above; here n_start > s_start and n_end < s_end not possible
            # Remaining case: cuts the end of S → trim S to [s_start, n_start]
            scenes_dict[scene_id] = {
                **scene_data,
                "prose_link": {**link, "end_offset": n_start},
            }
            modified_ids.append(scene_id)

    # Build the new prose link for the target scene
    link_dict: dict[str, Any] = {
        "scope_type": request.scope_type,
        "chapter_id": request.chapter_id,
        "book_id": request.book_id,
        "start_offset": n_start,
        "end_offset": n_end,
        "content_hash": "",
        "is_stale": False,
    }
    content_path = _scene_content_path(project_dir, link_dict)
    link_dict["content_hash"] = _compute_file_hash(content_path) if content_path else ""

    target_data = scenes_dict.get(target_scene_id, {})
    scenes_dict[target_scene_id] = {**target_data, "prose_link": link_dict}
    modified_ids.append(target_scene_id)

    story["scenes"] = scenes_dict
    save_story_config(story_path, story)

    result: list[dict[str, Any]] = []
    for sid in modified_ids:
        s = _normalise_scene({"id": sid, **scenes_dict[sid]})
        _attach_stale_flags([s], project_dir)
        result.append(s)
    return result


def update_prose_content(
    project_dir: Path,
    scene_id: str,
    new_text: str,
) -> dict[str, Any] | None:
    """Replace the prose at a scene's linked offsets with *new_text*.

    Writes the updated content back to disk, then updates the scene's
    ``end_offset`` to ``start_offset + len(new_text)`` and refreshes the hash.

    Returns the updated scene dict, or None if the scene does not exist.
    Raises ValueError if the scene has no prose link or the file path cannot
    be resolved.
    """
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)

    if scene_id not in scenes_dict:
        return None

    scene_data = scenes_dict[scene_id]
    link = scene_data.get("prose_link")
    if not link:
        raise ValueError(f"Scene '{scene_id}' has no prose link")

    content_path = _scene_content_path(project_dir, link)
    if not content_path:
        raise ValueError(f"Cannot resolve content path for scene '{scene_id}'")

    start: int = link.get("start_offset", 0)
    end_raw = link.get("end_offset")

    existing_content = (
        content_path.read_text(encoding="utf-8") if content_path.exists() else ""
    )

    if end_raw is None:
        new_content = existing_content[:start] + new_text
    else:
        new_content = existing_content[:start] + new_text + existing_content[end_raw:]

    content_path.write_text(new_content, encoding="utf-8")

    new_end = start + len(new_text)
    new_hash = _compute_file_hash(content_path)
    updated_link = {
        **link,
        "end_offset": new_end,
        "content_hash": new_hash,
        "is_stale": False,
    }

    scenes_dict[scene_id] = {**scene_data, "prose_link": updated_link}
    story["scenes"] = scenes_dict
    save_story_config(story_path, story)

    result = _normalise_scene({"id": scene_id, **scenes_dict[scene_id]})
    _attach_stale_flags([result], project_dir)
    return result
