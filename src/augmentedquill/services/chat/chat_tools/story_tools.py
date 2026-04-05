# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the story tools unit so this responsibility stays isolated, testable, and easy to evolve."""

import json as _json
import os

from pydantic import BaseModel, Field

from augmentedquill.core.config import load_story_config
from augmentedquill.services.chat.chat_session_helpers import load_chat, save_chat
from augmentedquill.services.chat.chat_tool_decorator import (
    CHAT_ROLE,
    EDITING_ROLE,
    chat_tool,
)
from augmentedquill.services.projects.projects import (
    get_active_project_dir,
    read_book_content as _read_book_content,
    read_story_content as _read_story_content,
    update_book_metadata as _update_book_metadata,
    update_story_metadata as _update_story_metadata,
    write_book_content as _write_book_content,
    write_story_content as _write_story_content,
    read_scratchpad as _read_scratchpad,
    write_scratchpad as _write_scratchpad,
    read_editing_scratchpad as _read_editing_scratchpad,
    write_editing_scratchpad as _write_editing_scratchpad,
)

# Pydantic models for tool parameters


class GetStoryMetadataParams(BaseModel):
    """Parameters for get_story_metadata (no parameters needed)."""

    pass


class UpdateStoryMetadataParams(BaseModel):
    """Parameters for updating story metadata."""

    title: str | None = Field(None, description="The new story title")
    summary: str | None = Field(None, description="The new story summary")
    notes: str | None = Field(None, description="General notes for the story")
    tags: list[str] | None = Field(None, description="List of tags for the story")
    conflicts: list[dict] | None = Field(
        None,
        description="List of active story conflicts with description and optional resolution.",
    )


class ReadStoryContentParams(BaseModel):
    """Parameters for read_story_content."""

    start: int = Field(
        0,
        description="Starting character index (0-based).",
    )
    max_chars: int = Field(
        8000,
        description="Maximum number of characters to return (max 8000).",
    )


class WriteStoryContentParams(BaseModel):
    """Parameters for writing story content."""

    content: str = Field(..., description="The new content for the story")


class GetBookMetadataParams(BaseModel):
    """Parameters for getting book metadata."""

    book_id: str = Field(..., description="The UUID of the book")


class UpdateBookMetadataParams(BaseModel):
    """Parameters for updating book metadata."""

    book_id: str = Field(..., description="The UUID of the book to update")
    title: str | None = Field(None, description="The new book title")
    summary: str | None = Field(None, description="The new book summary")
    notes: str | None = Field(None, description="General notes for the book")


class ReadBookContentParams(BaseModel):
    """Parameters for reading book content."""

    book_id: str = Field(..., description="The UUID of the book")
    start: int = Field(
        0,
        description="Starting character index (0-based).",
    )
    max_chars: int = Field(
        8000,
        description="Maximum number of characters to return (max 8000).",
    )


class WriteBookContentParams(BaseModel):
    """Parameters for writing book content."""

    book_id: str = Field(..., description="The UUID of the book")
    content: str = Field(..., description="The new content for the book")


class GetStorySummaryParams(BaseModel):
    """Parameters for get_story_summary (no parameters needed)."""

    pass


class GetStoryTagsParams(BaseModel):
    """Parameters for get_story_tags (no parameters needed)."""

    pass


class SetStoryTagsParams(BaseModel):
    """Parameters for setting story tags."""

    tags: list[str] = Field(..., description="Array of tag strings")


class SyncStorySummaryParams(BaseModel):
    """Parameters for auto-generating story summary."""

    mode: str = Field(
        "",
        description="Generation mode: 'discard' (new from scratch) or 'update' (refine existing). Empty string defaults to 'update'.",
    )


class WriteStorySummaryParams(BaseModel):
    """Parameters for directly setting story summary."""

    summary: str = Field(..., description="The new story summary text")


class ReadScratchpadParams(BaseModel):
    """Parameters for reading the scratchpad."""

    chat_id: str | None = Field(
        None,
        description="Chat ID to read scratchpad for (per-chat). If absent, falls back to project-wide scratchpad.",
    )


class WriteScratchpadParams(BaseModel):
    """Parameters for writing content to the scratchpad."""

    content: str = Field(
        ...,
        description="The full new content for the scratchpad. This replaces current content.",
    )
    chat_id: str | None = Field(
        None,
        description="Chat ID to write scratchpad for (per-chat). If absent, falls back to project-wide scratchpad.",
    )


class ReadEditingScratchpadParams(BaseModel):
    """Parameters for reading the EDITING scratchpad (no parameters needed)."""

    pass


class WriteEditingScratchpadParams(BaseModel):
    """Parameters for writing to the EDITING scratchpad."""

    content: str = Field(
        ...,
        description="The full new content for the EDITING scratchpad. This replaces current content.",
    )


# Tool implementations with co-located schemas


@chat_tool(
    description="Get the overall story title, summary, notes, conflicts, tags, and project type.",
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="metadata-read",
)
async def get_story_metadata(
    params: GetStoryMetadataParams, payload: dict, mutations: dict
):
    """Get Story Metadata."""
    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None) or {}
    return {
        "title": story.get("project_title", ""),
        "summary": story.get("story_summary", ""),
        "notes": story.get("notes", ""),
        "tags": story.get("tags", []),
        "conflicts": story.get("conflicts", []),
        "project_type": story.get("project_type", "novel"),
    }


@chat_tool(
    description="Update story-level metadata such as title, summary, notes, or tags. Provide only the fields you want to change.",
    allowed_roles=(CHAT_ROLE,),
    capability="metadata-write",
)
async def update_story_metadata(
    params: UpdateStoryMetadataParams, payload: dict, mutations: dict
):
    """Update Story Metadata."""
    _update_story_metadata(
        title=params.title,
        summary=params.summary,
        notes=params.notes,
        tags=params.tags,
        conflicts=params.conflicts,
    )
    mutations["story_changed"] = True
    return {"ok": True}


@chat_tool(
    description="Read the story-level introduction or content file.",
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="metadata-read",
)
async def read_story_content(
    params: ReadStoryContentParams, payload: dict, mutations: dict
):
    content = _read_story_content() or ""
    start = max(0, params.start)
    max_chars = max(1, min(8000, params.max_chars))
    end = min(len(content), start + max_chars)
    return {
        "content": content[start:end],
        "start": start,
        "end": end,
        "total": len(content),
    }


@chat_tool(
    description=(
        "Overwrite the ENTIRE story-level content file. WARNING: replaces all existing text. "
        "Use this only when the current task explicitly targets the story-level content file."
    ),
    allowed_roles=(EDITING_ROLE,),
    capability="prose-write",
)
async def write_story_content(
    params: WriteStoryContentParams, payload: dict, mutations: dict
):
    _write_story_content(params.content)
    mutations["story_changed"] = True
    return {"ok": True}


@chat_tool(
    description="Get the title, summary, and notes of a specific book (only for series projects).",
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="metadata-read",
    project_types=("series",),
)
async def get_book_metadata(
    params: GetBookMetadataParams, payload: dict, mutations: dict
):
    """Get Book Metadata."""
    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None) or {}
    books = story.get("books", [])

    # Security: Ensure book_id has no path traversal components
    book_id = os.path.basename(params.book_id) if params.book_id else ""

    target = next((b for b in books if b.get("id") == book_id), None)
    if not target:
        return {"error": f"Book ID {book_id} not found"}
    return {
        "title": target.get("title", ""),
        "summary": target.get("summary", ""),
        "notes": target.get("notes", ""),
    }


@chat_tool(
    description="Update the title, summary, or notes of a specific book. Provide only the fields you want to change.",
    allowed_roles=(CHAT_ROLE,),
    capability="metadata-write",
    project_types=("series",),
)
async def update_book_metadata(
    params: UpdateBookMetadataParams, payload: dict, mutations: dict
):
    """Update Book Metadata."""
    _update_book_metadata(
        params.book_id, title=params.title, summary=params.summary, notes=params.notes
    )
    mutations["story_changed"] = True
    return {"ok": True}


@chat_tool(
    description="Read the content file for a specific book.",
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="metadata-read",
    project_types=("series",),
)
async def read_book_content(
    params: ReadBookContentParams, payload: dict, mutations: dict
):
    content = _read_book_content(params.book_id) or ""
    start = max(0, params.start)
    max_chars = max(1, min(8000, params.max_chars))
    end = min(len(content), start + max_chars)
    return {
        "content": content[start:end],
        "start": start,
        "end": end,
        "total": len(content),
    }


@chat_tool(
    description=(
        "Overwrite the ENTIRE content file for a specific book. "
        "WARNING: replaces all existing text — only use for short books or complete rewrites. "
        "For targeted edits prefer replace_text_in_chapter."
    ),
    allowed_roles=(EDITING_ROLE,),
    capability="prose-write",
    project_types=("series",),
)
async def write_book_content(
    params: WriteBookContentParams, payload: dict, mutations: dict
):
    _write_book_content(params.book_id, params.content)
    mutations["story_changed"] = True
    return {"ok": True}


def _normalize_chat_id(chat_id: str | None) -> str | None:
    if not chat_id or not isinstance(chat_id, str):
        return None
    normalized = os.path.basename(chat_id.strip())
    return normalized if normalized else None


def _read_scratchpad_from_chat(chat_id: str | None) -> str:
    safe_id = _normalize_chat_id(chat_id)
    if not safe_id:
        return ""

    chat_data = load_chat(get_active_project_dir(), safe_id)
    if not chat_data:
        return ""

    return str(chat_data.get("scratchpad", ""))


def _write_scratchpad_to_chat(chat_id: str | None, content: str) -> None:
    safe_id = _normalize_chat_id(chat_id)
    if not safe_id:
        raise ValueError("Invalid chat_id")

    project_dir = get_active_project_dir()
    if not project_dir:
        raise ValueError("No active project")

    chat_data = load_chat(project_dir, safe_id) or {
        "id": safe_id,
        "name": f"Chat {safe_id}",
        "messages": [],
        "systemPrompt": "",
        "allowWebSearch": False,
    }
    chat_data["scratchpad"] = content
    save_chat(project_dir, safe_id, chat_data)


@chat_tool(
    description=(
        "Read your per-chat internal scratchpad/TODO list. "
        "Scratchpad is temporary and chat-specific; it should be used for ephemeral planning only. "
        "Persist important information in story notes or sourcebook entries."
    ),
    allowed_roles=(CHAT_ROLE,),
    capability="metadata-read",
)
async def read_scratchpad(params: ReadScratchpadParams, payload: dict, mutations: dict):
    """Read Scratchpad."""
    chat_id = params.chat_id or (payload or {}).get("chat_id")
    if chat_id:
        return {"content": _read_scratchpad_from_chat(chat_id)}
    return {"content": _read_scratchpad()}


@chat_tool(
    description=(
        "Write your per-chat internal scratchpad/TODO list. "
        "Scratchpad is temporary and chat-specific; updates are not shared across chats. "
        "Persist important information in story notes or sourcebook entries."
    ),
    allowed_roles=(CHAT_ROLE,),
    capability="metadata-write",
)
async def write_scratchpad(
    params: WriteScratchpadParams, payload: dict, mutations: dict
):
    """Write Scratchpad."""
    chat_id = params.chat_id or (payload or {}).get("chat_id")
    if chat_id:
        _write_scratchpad_to_chat(chat_id, params.content)
    else:
        _write_scratchpad(params.content)
    return {"ok": True}


async def get_story_summary_tool(
    params: GetStorySummaryParams, payload: dict, mutations: dict
):
    """Deprecated: use get_story_metadata instead."""
    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None) or {}
    summary = story.get("story_summary", "")
    return {"story_summary": summary}


async def get_story_tags(params: GetStoryTagsParams, payload: dict, mutations: dict):
    """Deprecated: use get_story_metadata instead."""
    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None) or {}
    tags = story.get("tags", [])
    return {"tags": tags}


async def set_story_tags(params: SetStoryTagsParams, payload: dict, mutations: dict):
    """Deprecated: use update_story_metadata instead."""
    active = get_active_project_dir()
    if not active:
        return {"error": "No active project"}

    story_path = active / "story.json"
    story = load_story_config(story_path) or {}
    story["tags"] = params.tags

    with open(story_path, "w", encoding="utf-8") as f:
        _json.dump(story, f, indent=2, ensure_ascii=False)

    mutations["story_changed"] = True
    return {"tags": params.tags, "message": "Story tags updated successfully"}


@chat_tool(
    description=(
        "Auto-generate a story summary from the current project prose context using AI. "
        "Use mode='discard' to write from scratch or mode='update' (default) to refine the existing one."
    ),
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="metadata-write",
)
async def sync_story_summary(
    params: SyncStorySummaryParams, payload: dict, mutations: dict
):
    """Sync Story Summary."""
    from augmentedquill.services.story.story_generation_ops import (
        generate_story_summary,
    )

    data = await generate_story_summary(mode=params.mode)
    mutations["story_changed"] = True
    return data


async def write_story_summary(
    params: WriteStorySummaryParams, payload: dict, mutations: dict
):
    """Deprecated: use update_story_metadata with summary= instead."""
    active = get_active_project_dir()
    if not active:
        return {"error": "No active project"}

    story_path = active / "story.json"
    story = load_story_config(story_path) or {}
    story["story_summary"] = params.summary.strip()

    with open(story_path, "w", encoding="utf-8") as f:
        _json.dump(story, f, indent=2, ensure_ascii=False)

    mutations["story_changed"] = True
    return {"summary": params.summary, "message": "Story summary updated successfully"}


# ---------------------------------------------------------------------------
# EDITING scratchpad (separate from the CHAT scratchpad)
# ---------------------------------------------------------------------------


@chat_tool(
    description=(
        "Read the per-chat EDITING scratchpad. "
        "Editing scratchpad is temporary and chat-specific; important decisions belong in notes or sourcebook."
    ),
    allowed_roles=(EDITING_ROLE,),
    capability="metadata-read",
)
async def read_editing_scratchpad(
    params: ReadEditingScratchpadParams, payload: dict, mutations: dict
):
    """Read Editing Scratchpad."""
    chat_id = (payload or {}).get("chat_id")
    if chat_id:
        safe_id = _normalize_chat_id(chat_id)
        if safe_id:
            chat_data = load_chat(get_active_project_dir(), safe_id)
            return {
                "content": (
                    str(chat_data.get("editing_scratchpad", "")) if chat_data else ""
                )
            }
    return {"content": _read_editing_scratchpad()}


@chat_tool(
    description=(
        "Write the per-chat EDITING scratchpad. "
        "Editing scratchpad is temporary and chat-specific; important decisions belong in notes or sourcebook."
    ),
    allowed_roles=(EDITING_ROLE,),
    capability="metadata-write",
)
async def write_editing_scratchpad(
    params: WriteEditingScratchpadParams, payload: dict, mutations: dict
):
    """Write Editing Scratchpad."""
    chat_id = (payload or {}).get("chat_id")
    if chat_id:
        safe_id = _normalize_chat_id(chat_id)
        if safe_id:
            project_dir = get_active_project_dir()
            if not project_dir:
                raise ValueError("No active project")
            chat_data = load_chat(project_dir, safe_id) or {
                "id": safe_id,
                "name": f"Chat {safe_id}",
                "messages": [],
                "systemPrompt": "",
                "allowWebSearch": False,
            }
            chat_data["editing_scratchpad"] = params.content
            save_chat(project_dir, safe_id, chat_data)
            return {"ok": True}
    _write_editing_scratchpad(params.content)
    return {"ok": True}
