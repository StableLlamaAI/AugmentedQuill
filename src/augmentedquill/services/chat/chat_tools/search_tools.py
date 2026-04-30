# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the search tools unit so this responsibility stays isolated, testable, and easy to evolve.

LLM-callable chat tools for searching and replacing text within a project.
These tools are available to the CHAT and EDITING model roles.
"""

from pydantic import BaseModel, Field

from augmentedquill.services.chat.chat_tool_decorator import (
    CHAT_ROLE,
    EDITING_ROLE,
    chat_tool,
)


class SearchInProjectParams(BaseModel):
    """Parameters for searching text within the active project."""

    query: str = Field(..., description="Text or pattern to search for")
    scope: str = Field(
        "all",
        description=(
            "Where to search. One of: 'all', 'all_chapters', 'current_chapter', "
            "'sourcebook', 'metadata'. Default: 'all'."
        ),
    )
    case_sensitive: bool = Field(
        False, description="Whether the search is case-sensitive"
    )
    is_regex: bool = Field(False, description="Treat query as a regular expression")


@chat_tool(
    description=(
        "Search for text within the active project. Returns matches grouped by "
        "chapter content, sourcebook entries, and metadata (summaries, notes, "
        "conflicts). Use scope='current_chapter' to search only the active chapter, "
        "scope='all' to search everything. Results include context snippets around "
        "each match."
    ),
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="search",
)
async def search_in_project(
    params: SearchInProjectParams, payload: dict, mutations: dict
) -> dict:
    """Execute a text search across the project and return readable results."""
    from augmentedquill.models.search import SearchOptions, SearchScope
    from augmentedquill.services.projects.projects import get_active_project_dir
    from augmentedquill.services.search.search_service import run_search

    active = get_active_project_dir()
    if not active:
        return {"error": "No active project"}

    # Resolve scope string to enum (fall back to 'all' for invalid values)
    scope_map = {s.value: s for s in SearchScope}
    scope = scope_map.get(params.scope, SearchScope.all)

    active_chap_id: int | None = None
    if scope == SearchScope.current_chapter:
        raw_id = payload.get("active_chapter_id")
        if raw_id is not None:
            try:
                active_chap_id = int(raw_id)
            except (TypeError, ValueError):
                pass

    opts = SearchOptions(
        query=params.query,
        scope=scope,
        case_sensitive=params.case_sensitive,
        is_regex=params.is_regex,
        is_phonetic=False,  # Phonetic search not exposed as LLM tool
        active_chapter_id=active_chap_id,
    )

    try:
        response = run_search(opts, active)
    except ValueError as exc:
        return {"error": str(exc)}

    # Build an LLM-friendly flat summary (no raw character offsets)
    llm_results = []
    for section in response.results:
        for match in section.matches:
            llm_results.append(
                {
                    "section": section.section_title,
                    "field": section.field_display,
                    "match": match.match_text,
                    "context": f"…{match.context_before}[{match.match_text}]{match.context_after}…",
                }
            )

    return {
        "total_matches": response.total_matches,
        "results": llm_results,
    }


class ReplaceInProjectParams(BaseModel):
    """Parameters for replacing text within the active project."""

    query: str = Field(..., description="Text or pattern to search for and replace")
    replacement: str = Field(
        ..., description="Text to substitute in place of each match"
    )
    scope: str = Field(
        "all",
        description=(
            "Where to replace. One of: 'all', 'all_chapters', 'current_chapter', "
            "'sourcebook', 'metadata'. Default: 'all'."
        ),
    )
    case_sensitive: bool = Field(
        False, description="Whether the match is case-sensitive"
    )
    is_regex: bool = Field(False, description="Treat query as a regular expression")


@chat_tool(
    description=(
        "Replace text throughout the active project. Replaces every occurrence of "
        "'query' with 'replacement' within the specified scope. Returns how many "
        "replacements were made and which sections were changed. Use "
        "scope='all_chapters' to rename a character in all prose, or scope='all' "
        "to also update their sourcebook entry and metadata fields."
    ),
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="replace",
)
async def replace_in_project(
    params: ReplaceInProjectParams, payload: dict, mutations: dict
) -> dict:
    """Replace text throughout the project and report the changes."""
    from augmentedquill.models.search import ReplaceAllRequest, SearchScope
    from augmentedquill.services.projects.projects import get_active_project_dir
    from augmentedquill.services.search.replace_service import replace_all

    active = get_active_project_dir()
    if not active:
        return {"error": "No active project"}

    scope_map = {s.value: s for s in SearchScope}
    scope = scope_map.get(params.scope, SearchScope.all)

    active_chap_id: int | None = None
    if scope == SearchScope.current_chapter:
        raw_id = payload.get("active_chapter_id")
        if raw_id is not None:
            try:
                active_chap_id = int(raw_id)
            except (TypeError, ValueError):
                pass

    req = ReplaceAllRequest(
        query=params.query,
        replacement=params.replacement,
        scope=scope,
        case_sensitive=params.case_sensitive,
        is_regex=params.is_regex,
        is_phonetic=False,
        active_chapter_id=active_chap_id,
    )

    result = replace_all(req, active)

    if result.replacements_made > 0:
        mutations["story_changed"] = True
    if result.changed_sections_meta:
        mutations["change_locations"] = [
            loc.dict() for loc in result.changed_sections_meta
        ]

    return {
        "replacements_made": result.replacements_made,
        "changed_sections": result.changed_sections,
        "change_locations": [loc.dict() for loc in result.changed_sections_meta],
    }
