# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the search API unit so this responsibility stays isolated, testable, and easy to evolve.

REST endpoints for project-wide search and replace.
"""

from fastapi import APIRouter, HTTPException

from augmentedquill.models.search import (
    ReplaceAllRequest,
    ReplaceResponse,
    ReplaceSingleRequest,
    SearchOptions,
    SearchResponse,
)
from augmentedquill.services.projects.projects import get_active_project_dir
from augmentedquill.services.search.search_service import run_search
from augmentedquill.services.search.replace_service import replace_all, replace_single

router = APIRouter(tags=["Search"])


@router.post("/search", response_model=SearchResponse)
async def search_project(opts: SearchOptions) -> SearchResponse:
    """Search across the active project.

    Supported scopes: current_chapter, all_chapters, sourcebook, metadata, all.
    Supported modes: literal (default), regex (is_regex=true), phonetic (is_phonetic=true).
    """
    active = get_active_project_dir()
    if not active:
        raise HTTPException(status_code=400, detail="No active project")

    try:
        return run_search(opts, active)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/search/replace-all", response_model=ReplaceResponse)
async def replace_all_in_project(req: ReplaceAllRequest) -> ReplaceResponse:
    """Replace every occurrence of a query throughout the active project.

    All matching text in the specified scope is substituted with *replacement*.
    After completion the frontend should refresh story/chapter state.
    """
    active = get_active_project_dir()
    if not active:
        raise HTTPException(status_code=400, detail="No active project")

    return replace_all(req, active)


@router.post("/search/replace-single", response_model=ReplaceResponse)
async def replace_single_in_project(req: ReplaceSingleRequest) -> ReplaceResponse:
    """Replace a single specifically identified match.

    The match is identified by section_type, section_id, field, and match_index
    (zero-based ordinal of the match within that field).
    """
    active = get_active_project_dir()
    if not active:
        raise HTTPException(status_code=400, detail="No active project")

    return replace_single(req, active)
