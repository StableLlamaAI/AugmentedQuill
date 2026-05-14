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
import os
import tempfile
from pathlib import Path
from typing import Any

from augmentedquill.core.config import load_story_config, save_story_config
from augmentedquill.models.scene import (
    ProseConflictError,
    SceneCreateRequest,
    SceneId,
    SceneLinkProseRequest,
    SceneProseLink,
    SceneReorderProseRequest,
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
        chapter_id = str(link.get("chapter_id") or "").strip()
        book_id = str(link.get("book_id") or "").strip()
        if not chapter_id:
            return None

        story = load_story_config(project_dir / "story.json") or {}

        def _safe_int(text: str) -> int | None:
            try:
                return int(text)
            except ValueError:
                return None

        def _chapter_filename_from_story() -> str | None:
            numeric_id = _safe_int(chapter_id)

            def _filename_or_inferred(
                chapter: dict[str, Any], local_index: int
            ) -> str | None:
                filename = chapter.get("filename")
                if isinstance(filename, str) and filename.strip():
                    return filename.strip()
                # Older project files may omit chapter filenames in metadata.
                # Chapter files are persisted as zero-padded ordinals.
                return f"{local_index + 1:04d}.txt"

            if book_id:
                books = story.get("books")
                if not isinstance(books, list):
                    return None

                matched_book: dict[str, Any] | None = None
                for book in books:
                    if not isinstance(book, dict):
                        continue
                    bid = str(book.get("id") or book.get("folder") or "").strip()
                    if bid == book_id:
                        matched_book = book
                        break
                if matched_book is None:
                    return None

                chapters = matched_book.get("chapters")
                if not isinstance(chapters, list):
                    return None

                for chapter_index, chapter in enumerate(chapters):
                    if not isinstance(chapter, dict):
                        continue
                    cid = str(chapter.get("id") or "").strip()
                    if cid and cid == chapter_id:
                        return _filename_or_inferred(chapter, chapter_index)

                if numeric_id is not None:
                    local_index = numeric_id - 1
                    if 0 <= local_index < len(chapters):
                        chapter = chapters[local_index]
                        if isinstance(chapter, dict):
                            return _filename_or_inferred(chapter, local_index)

                if numeric_id is not None:
                    global_index = 0
                    for book in books:
                        if not isinstance(book, dict):
                            continue
                        bid = str(book.get("id") or book.get("folder") or "").strip()
                        bchapters = book.get("chapters")
                        if not isinstance(bchapters, list):
                            continue
                        for chapter_index, chapter in enumerate(bchapters):
                            global_index += 1
                            if global_index != numeric_id:
                                continue
                            if bid != book_id:
                                return None
                            if isinstance(chapter, dict):
                                return _filename_or_inferred(chapter, chapter_index)
                    return None

                return None

            chapters = story.get("chapters")
            if not isinstance(chapters, list):
                return None

            for chapter_index, chapter in enumerate(chapters):
                if not isinstance(chapter, dict):
                    continue
                cid = str(chapter.get("id") or "").strip()
                if cid and cid == chapter_id:
                    return _filename_or_inferred(chapter, chapter_index)

            numeric_id = _safe_int(chapter_id)
            if numeric_id is not None:
                index = numeric_id - 1
                if 0 <= index < len(chapters):
                    chapter = chapters[index]
                    if isinstance(chapter, dict):
                        return _filename_or_inferred(chapter, index)
            return None

        chapter_filename = _chapter_filename_from_story()
        chapter_numeric = _safe_int(chapter_id)
        inferred_from_id = (
            f"{chapter_numeric:04d}.txt" if chapter_numeric is not None else None
        )

        candidates: list[Path] = []
        if book_id:
            if chapter_filename:
                candidates.append(
                    project_dir / "books" / book_id / "chapters" / chapter_filename
                )
            if inferred_from_id:
                candidates.append(
                    project_dir / "books" / book_id / "chapters" / inferred_from_id
                )
            candidates.append(project_dir / "books" / book_id / "chapters" / chapter_id)
            candidates.append(project_dir / "books" / book_id / chapter_id)
        else:
            if chapter_filename:
                candidates.append(project_dir / "chapters" / chapter_filename)
            if inferred_from_id:
                candidates.append(project_dir / "chapters" / inferred_from_id)
            candidates.append(project_dir / "chapters" / chapter_id)
            candidates.append(project_dir / chapter_id)

        expanded: list[Path] = []
        for candidate in candidates:
            expanded.append(candidate)
            if not candidate.suffix:
                expanded.append(candidate.with_suffix(".md"))
                expanded.append(candidate.with_suffix(".txt"))

        for candidate in expanded:
            if candidate.exists():
                return candidate

        if book_id:
            chapter_dir = project_dir / "books" / book_id / "chapters"
            if chapter_dir.exists():
                chapter_files = sorted(
                    path for path in chapter_dir.iterdir() if path.is_file()
                )
                if chapter_files:
                    if chapter_numeric is not None:
                        local_index = chapter_numeric - 1
                        if 0 <= local_index < len(chapter_files):
                            return chapter_files[local_index]
                    if len(chapter_files) == 1:
                        return chapter_files[0]

        return expanded[0] if expanded else None

    return None


def _same_prose_scope(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Return True when two prose-link dicts point at the same scope."""
    return (
        a.get("scope_type") == b.get("scope_type")
        and (a.get("chapter_id") or None) == (b.get("chapter_id") or None)
        and (a.get("book_id") or None) == (b.get("book_id") or None)
    )


def _write_text_atomic(path: Path, content: str) -> None:
    """Write text atomically so a failed save never leaves partial content."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    replaced = False
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as tmp_file:
            tmp_file.write(content)
            temp_path = Path(tmp_file.name)
        os.replace(temp_path, path)
        replaced = True
    finally:
        if temp_path is not None and temp_path.exists() and not replaced:
            temp_path.unlink(missing_ok=True)


def _coerce_scene_id(raw_id: object) -> SceneId | None:
    """Return a numeric scene ID when the stored representation is valid."""
    if isinstance(raw_id, int) and raw_id > 0:
        return raw_id
    if isinstance(raw_id, str) and raw_id.isdigit():
        parsed = int(raw_id)
        return parsed if parsed > 0 else None
    return None


def _coerce_scene_id_list(raw_ids: object) -> list[SceneId]:
    """Normalise scene reference lists to numeric scene IDs."""
    if not isinstance(raw_ids, list):
        return []
    result: list[SceneId] = []
    for raw_id in raw_ids:
        scene_id = _coerce_scene_id(raw_id)
        if scene_id is not None:
            result.append(scene_id)
    return result


def _next_scene_id(scenes_dict: dict[SceneId, Any]) -> SceneId:
    """Allocate the next per-project numeric scene ID."""
    return max(scenes_dict.keys(), default=0) + 1


def _normalise_scene(raw: dict[str, Any]) -> dict[str, Any]:
    """Ensure default fields exist on a raw scene dict read from disk."""
    scene_id = _coerce_scene_id(raw.get("id"))
    if scene_id is None:
        raise ValueError("Scene IDs must be positive integers")
    raw["id"] = scene_id

    summary = raw.get("summary")
    if not isinstance(summary, str):
        raw["summary"] = ""

    for key in (
        "beats",
        "active_characters",
        "passive_characters",
        "sourcebook_entry_ids",
    ):
        value = raw.get(key)
        if not isinstance(value, list):
            raw[key] = []

    raw["order_before"] = _coerce_scene_id_list(raw.get("order_before"))
    raw["order_after"] = _coerce_scene_id_list(raw.get("order_after"))

    raw.setdefault("scene_time", None)
    raw.setdefault("tag_personal_datetimes", [])
    # Drop legacy fields if present
    raw.pop("personal_datetimes", None)
    raw.pop("time_travel_events", None)

    pinboard_x = raw.get("pinboard_x")
    if not isinstance(pinboard_x, (int, float)):
        raw["pinboard_x"] = 100.0

    pinboard_y = raw.get("pinboard_y")
    if not isinstance(pinboard_y, (int, float)):
        raw["pinboard_y"] = 100.0

    status = raw.get("status")
    if not isinstance(status, str) or not status.strip():
        raw["status"] = "active"

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
    scenes_dict = _load_scenes_dict(story)
    scenes = [
        _normalise_scene({"id": scene_id, **data})
        for scene_id, data in scenes_dict.items()
    ]
    _attach_stale_flags(scenes, project_dir)
    return sorted(
        scenes, key=lambda s: (s.get("pinboard_y", 0), s.get("pinboard_x", 0))
    )


def get_scene(project_dir: Path, scene_id: SceneId) -> dict[str, Any] | None:
    """Return a single scene dict, or None if not found."""
    story = load_story_config(project_dir / "story.json") or {}
    scenes_dict = _load_scenes_dict(story)
    raw = scenes_dict.get(scene_id)
    if raw is None:
        return None
    scene = _normalise_scene({"id": scene_id, **raw})
    _attach_stale_flags([scene], project_dir)
    return scene


def create_scene(project_dir: Path, payload: SceneCreateRequest) -> dict[str, Any]:
    """Create and persist a new scene; returns the saved scene dict."""
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)
    scene_id = _next_scene_id(scenes_dict)
    data = payload.model_dump(exclude_none=False)
    data.pop("id", None)  # id is derived, not stored in dict value
    scenes_dict[scene_id] = data
    story["scenes"] = scenes_dict
    save_story_config(story_path, story)
    scene = _normalise_scene({"id": scene_id, **data})
    _attach_stale_flags([scene], project_dir)
    return scene


def update_scene(
    project_dir: Path, scene_id: SceneId, payload: SceneUpdateRequest
) -> dict[str, Any] | None:
    """Apply a partial update to a scene; returns the updated scene or None."""
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)

    if scene_id not in scenes_dict:
        return None

    existing = scenes_dict[scene_id]
    updates = payload.model_dump(exclude_unset=True)
    existing.update(updates)
    scenes_dict[scene_id] = existing
    story["scenes"] = scenes_dict
    save_story_config(story_path, story)
    result = _normalise_scene({"id": scene_id, **existing})
    _attach_stale_flags([result], project_dir)
    return result


def delete_scene(project_dir: Path, scene_id: SceneId) -> bool:
    """Delete a scene by ID.  Returns True if deleted, False if not found."""
    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)

    if scene_id not in scenes_dict:
        return False

    del scenes_dict[scene_id]
    for data in scenes_dict.values():
        data["order_before"] = [
            s for s in _coerce_scene_id_list(data.get("order_before")) if s != scene_id
        ]
        data["order_after"] = [
            s for s in _coerce_scene_id_list(data.get("order_after")) if s != scene_id
        ]

    story["scenes"] = scenes_dict
    save_story_config(story_path, story)
    return True


def update_prose_link_hash(
    project_dir: Path,
    scene_id: SceneId,
    beat_id: str | None,
    link: SceneProseLink,
) -> SceneProseLink:
    """Recompute the content hash for a prose link and persist it."""
    content_path = _scene_content_path(project_dir, link.model_dump())
    current_hash = _compute_file_hash(content_path) if content_path else ""
    updated = link.model_copy(update={"content_hash": current_hash})

    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)
    scene_data = scenes_dict.get(scene_id)
    if scene_data is None:
        return updated
    if beat_id:
        for beat in scene_data.get("beats", []):
            if beat.get("id") == beat_id:
                beat["prose_link"] = updated.model_dump()
                break
    else:
        scene_data["prose_link"] = updated.model_dump()
    story["scenes"] = scenes_dict
    save_story_config(story_path, story)
    return updated


def _load_scenes_dict(story: dict[str, Any]) -> dict[SceneId, Any]:
    """Return the scenes as a plain dict keyed by numeric scene ID."""
    raw = story.get("scenes", {})
    if isinstance(raw, dict):
        scenes: dict[SceneId, Any] = {}
        for raw_id, scene_data in raw.items():
            scene_id = _coerce_scene_id(raw_id)
            if scene_id is None or not isinstance(scene_data, dict):
                continue
            scenes[scene_id] = {k: v for k, v in scene_data.items() if k != "id"}
        return scenes
    if isinstance(raw, list):
        scenes = {}
        for scene_data in raw:
            if not isinstance(scene_data, dict):
                continue
            scene_id = _coerce_scene_id(scene_data.get("id"))
            if scene_id is None:
                continue
            scenes[scene_id] = {k: v for k, v in scene_data.items() if k != "id"}
        return scenes
    return {}


def link_prose(
    project_dir: Path,
    target_scene_id: SceneId,
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

    modified_ids: list[SceneId] = []

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
    scene_id: SceneId,
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

    _write_text_atomic(content_path, new_content)

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


def reorder_scene_prose(
    project_dir: Path,
    request: SceneReorderProseRequest,
) -> dict[str, Any]:
    """Reorder scenes within a prose scope and rewrite the linked text block.

    The operation is intentionally transactional from the caller's perspective:
    all offsets in the affected scope are recomputed, the prose file is rewritten
    once, and then the scene links are persisted together.
    """
    if request.source_scene_id == request.target_scene_id:
        raise ValueError("Source and target scenes must differ")

    story_path = project_dir / "story.json"
    story = load_story_config(story_path) or {}
    scenes_dict = _load_scenes_dict(story)

    source_data = scenes_dict.get(request.source_scene_id)
    target_data = scenes_dict.get(request.target_scene_id)
    if source_data is None:
        raise LookupError(f"Scene '{request.source_scene_id}' not found")
    if target_data is None:
        raise LookupError(f"Scene '{request.target_scene_id}' not found")

    source_link = source_data.get("prose_link")
    target_link = target_data.get("prose_link")
    if not source_link or not target_link:
        raise ValueError("Both scenes must have prose links")
    same_scope = _same_prose_scope(source_link, target_link)

    def _collect_linked_in_scope(scope_link: dict[str, Any]) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        for sid, sdata in scenes_dict.items():
            link = sdata.get("prose_link")
            if not link or link.get("end_offset") is None:
                continue
            if not _same_prose_scope(link, scope_link):
                continue
            entries.append(
                {
                    "scene_id": sid,
                    "scene_data": sdata,
                    "link": link,
                    "start": link.get("start_offset", 0),
                    "end": link.get("end_offset"),
                }
            )
        entries.sort(key=lambda entry: entry["start"])
        return entries

    linked_in_scope = _collect_linked_in_scope(source_link)

    linked_in_scope.sort(key=lambda entry: entry["start"])
    source_index = next(
        (
            index
            for index, entry in enumerate(linked_in_scope)
            if entry["scene_id"] == request.source_scene_id
        ),
        -1,
    )
    target_index = (
        next(
            (
                index
                for index, entry in enumerate(linked_in_scope)
                if entry["scene_id"] == request.target_scene_id
            ),
            -1,
        )
        if same_scope
        else -1
    )
    if source_index < 0:
        raise ValueError(
            f"Scene '{request.source_scene_id}' is not linked in the selected scope"
        )
    if same_scope:
        if target_index < 0:
            raise ValueError(
                f"Scene '{request.target_scene_id}' is not linked in the selected scope"
            )

        insert_index = target_index + (0 if request.place_before else 1)
        if source_index < insert_index:
            insert_index -= 1
        if insert_index == source_index:
            return {
                "scenes": [],
                "scope_type": source_link.get("scope_type", "story"),
                "chapter_id": source_link.get("chapter_id"),
                "book_id": source_link.get("book_id"),
                "scope_start": 0,
                "scope_end": 0,
                "rebuilt_text": "",
            }

        reordered = list(linked_in_scope)
        moved = reordered.pop(source_index)
        reordered.insert(insert_index, moved)

        content_path = _scene_content_path(project_dir, source_link)
        if content_path is None:
            raise ValueError("Cannot resolve content path for the selected scope")
        original_content = (
            content_path.read_text(encoding="utf-8") if content_path.exists() else ""
        )
        if not content_path.exists():
            raise ValueError("Cannot resolve content path for the selected scope")

        scene_text_by_id: dict[SceneId, str] = {}
        for entry in linked_in_scope:
            scene_text_by_id[entry["scene_id"]] = original_content[
                entry["start"] : entry["end"]
            ]

        gaps_between: list[str] = []
        for index in range(len(linked_in_scope) - 1):
            left = linked_in_scope[index]
            right = linked_in_scope[index + 1]
            gaps_between.append(original_content[left["end"] : right["start"]])

        scope_start = linked_in_scope[0]["start"]
        scope_end = linked_in_scope[-1]["end"]
        rebuilt_text_parts: list[str] = []
        next_links: dict[SceneId, dict[str, Any]] = {}
        cursor = scope_start

        for index, entry in enumerate(reordered):
            if index > 0:
                gap = gaps_between[index - 1] if index - 1 < len(gaps_between) else ""
                rebuilt_text_parts.append(gap)
                cursor += len(gap)

            scene_text = scene_text_by_id[entry["scene_id"]]
            start = cursor
            end = start + len(scene_text)
            rebuilt_text_parts.append(scene_text)
            cursor = end
            next_links[entry["scene_id"]] = {
                **entry["link"],
                "start_offset": start,
                "end_offset": end,
            }

        rebuilt_scope_text = "".join(rebuilt_text_parts)
        rebuilt_content = (
            original_content[:scope_start]
            + rebuilt_scope_text
            + original_content[scope_end:]
        )

        _write_text_atomic(content_path, rebuilt_content)

        updated_hash = _compute_file_hash(content_path)
        modified_ids: list[SceneId] = []
        original_scene_data: dict[SceneId, dict[str, Any]] = {}
        try:
            for entry in reordered:
                scene_id = entry["scene_id"]
                original_scene_data[scene_id] = scenes_dict[scene_id]
                next_link = {
                    **next_links[scene_id],
                    "content_hash": updated_hash,
                    "is_stale": False,
                }
                scenes_dict[scene_id] = {
                    **scenes_dict[scene_id],
                    "prose_link": next_link,
                }
                modified_ids.append(scene_id)

            story["scenes"] = scenes_dict
            save_story_config(story_path, story)
        except Exception:
            _write_text_atomic(content_path, original_content)
            for scene_id, scene_data in original_scene_data.items():
                scenes_dict[scene_id] = scene_data
            story["scenes"] = scenes_dict
            raise

        result: list[dict[str, Any]] = []
        for scene_id in modified_ids:
            scene = _normalise_scene({"id": scene_id, **scenes_dict[scene_id]})
            _attach_stale_flags([scene], project_dir)
            result.append(scene)
        return {
            "scenes": result,
            "scope_type": source_link.get("scope_type", "story"),
            "chapter_id": source_link.get("chapter_id"),
            "book_id": source_link.get("book_id"),
            "scope_start": scope_start,
            "scope_end": scope_end,
            "rebuilt_text": rebuilt_scope_text,
        }

    if target_data.get("prose_link", {}).get("end_offset") is None:
        raise ValueError(
            f"Scene '{request.target_scene_id}' is not linked in the selected scope"
        )

    source_path = _scene_content_path(project_dir, source_link)
    target_path = _scene_content_path(project_dir, target_link)
    if source_path is None or not source_path.exists():
        raise ValueError("Cannot resolve content path for source scope")
    if target_path is None or not target_path.exists():
        raise ValueError("Cannot resolve content path for target scope")

    source_content = source_path.read_text(encoding="utf-8")
    target_content = target_path.read_text(encoding="utf-8")

    source_start = int(source_link.get("start_offset", 0))
    source_end = int(source_link.get("end_offset") or source_start)
    moved_text = source_content[source_start:source_end]
    moved_len = len(moved_text)

    source_scope_entries = _collect_linked_in_scope(source_link)
    target_scope_entries = _collect_linked_in_scope(target_link)
    source_scope_ids = {entry["scene_id"] for entry in source_scope_entries}
    target_scope_ids = {entry["scene_id"] for entry in target_scope_entries}

    target_entry = next(
        (
            entry
            for entry in target_scope_entries
            if entry["scene_id"] == request.target_scene_id
        ),
        None,
    )
    if target_entry is None:
        raise ValueError(
            f"Scene '{request.target_scene_id}' is not linked in the selected scope"
        )

    insert_at = target_entry["start"] if request.place_before else target_entry["end"]

    rebuilt_source_content = source_content[:source_start] + source_content[source_end:]
    rebuilt_target_content = (
        target_content[:insert_at] + moved_text + target_content[insert_at:]
    )

    _write_text_atomic(source_path, rebuilt_source_content)
    wrote_target = False
    try:
        _write_text_atomic(target_path, rebuilt_target_content)
        wrote_target = True

        source_hash = _compute_file_hash(source_path)
        target_hash = _compute_file_hash(target_path)

        updated_ids: set[SceneId] = set()
        original_scene_data: dict[SceneId, dict[str, Any]] = {}

        for entry in source_scope_entries:
            scene_id = entry["scene_id"]
            if scene_id == request.source_scene_id:
                continue
            original_scene_data.setdefault(scene_id, scenes_dict[scene_id])
            start = entry["start"]
            end = entry["end"]
            if start >= source_end:
                start -= moved_len
                end -= moved_len
            next_link = {
                **entry["link"],
                "start_offset": start,
                "end_offset": end,
                "content_hash": source_hash,
                "is_stale": False,
            }
            scenes_dict[scene_id] = {**scenes_dict[scene_id], "prose_link": next_link}
            updated_ids.add(scene_id)

        for entry in target_scope_entries:
            scene_id = entry["scene_id"]
            if scene_id == request.source_scene_id:
                continue
            original_scene_data.setdefault(scene_id, scenes_dict[scene_id])
            start = entry["start"]
            end = entry["end"]
            if start >= insert_at:
                start += moved_len
                end += moved_len
            next_link = {
                **entry["link"],
                "start_offset": start,
                "end_offset": end,
                "content_hash": target_hash,
                "is_stale": False,
            }
            scenes_dict[scene_id] = {**scenes_dict[scene_id], "prose_link": next_link}
            updated_ids.add(scene_id)

        original_scene_data.setdefault(
            request.source_scene_id, scenes_dict[request.source_scene_id]
        )
        moved_link = {
            **source_link,
            "scope_type": target_link.get("scope_type", "story"),
            "chapter_id": target_link.get("chapter_id"),
            "book_id": target_link.get("book_id"),
            "start_offset": insert_at,
            "end_offset": insert_at + moved_len,
            "content_hash": target_hash,
            "is_stale": False,
        }
        scenes_dict[request.source_scene_id] = {
            **scenes_dict[request.source_scene_id],
            "prose_link": moved_link,
        }
        updated_ids.add(request.source_scene_id)

        story["scenes"] = scenes_dict
        save_story_config(story_path, story)
    except Exception:
        if wrote_target:
            _write_text_atomic(target_path, target_content)
        _write_text_atomic(source_path, source_content)
        story["scenes"] = scenes_dict
        raise

    result: list[dict[str, Any]] = []
    ordered_ids = [
        sid
        for sid in scenes_dict.keys()
        if sid in source_scope_ids
        or sid in target_scope_ids
        or sid == request.source_scene_id
    ]
    for scene_id in ordered_ids:
        if scene_id not in scenes_dict:
            continue
        scene = _normalise_scene({"id": scene_id, **scenes_dict[scene_id]})
        _attach_stale_flags([scene], project_dir)
        result.append(scene)

    return {
        "scenes": result,
        "scope_type": target_link.get("scope_type", "story"),
        "chapter_id": target_link.get("chapter_id"),
        "book_id": target_link.get("book_id"),
        "scope_start": 0,
        "scope_end": len(target_content),
        "rebuilt_text": rebuilt_target_content,
    }
