# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the sourcebook unit so this responsibility stays isolated, testable, and easy to evolve.

API endpoints for managing the sourcebook (knowledge base) associated with a project.
"""

from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from augmentedquill.services.projects.projects import get_active_project_dir
from augmentedquill.services.sourcebook.sourcebook_helpers import (
    sourcebook_create_entry,
    sourcebook_delete_entry,
    sourcebook_generate_keywords_with_editing_model,
    sourcebook_list_entries,
    sourcebook_refresh_entry_keywords,
    sourcebook_search_entries_with_keyword_refresh,
    sourcebook_update_entry,
)

router = APIRouter(tags=["Sourcebook"])


class SourcebookRelation(BaseModel):
    target_id: str
    relation: str
    direction: Optional[str] = "forward"
    start_chapter: Optional[str] = None
    start_book: Optional[str] = None
    end_chapter: Optional[str] = None
    end_book: Optional[str] = None


class SourcebookEntry(BaseModel):

    id: str
    name: str
    synonyms: List[str] = []
    category: Optional[str] = None
    description: str
    images: List[str] = []
    keywords: List[str] = []
    relations: List[SourcebookRelation] = []


class SourcebookEntryCreate(BaseModel):
    name: str
    synonyms: List[str] = []
    category: Optional[str] = None
    description: str
    images: List[str] = []
    relations: List[SourcebookRelation] = []


class SourcebookEntryUpdate(BaseModel):
    name: Optional[str] = None
    synonyms: Optional[List[str]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    images: Optional[List[str]] = None
    relations: Optional[List[SourcebookRelation]] = None


class SourcebookKeywordsRequest(BaseModel):
    """Request payload for generating keywords from an entry description."""

    name: Optional[str] = None
    description: Optional[str] = None
    synonyms: Optional[List[str]] = None


class SourcebookKeywordsResponse(BaseModel):
    keywords: List[str]


@router.post("/sourcebook/keywords")
async def generate_sourcebook_keywords(
    request: SourcebookKeywordsRequest,
) -> SourcebookKeywordsResponse:
    """Generate keywords from an entry description without persisting the entry."""
    name = (request.name or "").strip()
    description = (request.description or "").strip()
    synonyms = request.synonyms or []

    if not name or not description:
        raise HTTPException(
            status_code=400,
            detail="Both name and description are required to generate keywords.",
        )

    keywords = await sourcebook_generate_keywords_with_editing_model(
        name=name, description=description, synonyms=synonyms, payload={}
    )
    return SourcebookKeywordsResponse(keywords=keywords)


@router.get("/sourcebook")
async def get_sourcebook(
    query: Optional[str] = None,
    match_mode: Literal["direct", "extensive"] = "extensive",
    split_query_fallback: bool = False,
) -> List[SourcebookEntry]:
    active = get_active_project_dir()
    if not active:
        return []
    if query:
        return [
            SourcebookEntry(**entry)
            for entry in await sourcebook_search_entries_with_keyword_refresh(
                query,
                match_mode=match_mode,
                split_query_fallback=split_query_fallback,
                payload={},
            )
        ]
    return [SourcebookEntry(**entry) for entry in sourcebook_list_entries()]


@router.post("/sourcebook")
async def create_sourcebook_entry(entry: SourcebookEntryCreate) -> SourcebookEntry:
    """Create Sourcebook Entry."""
    active = get_active_project_dir()
    if not active:
        raise HTTPException(status_code=400, detail="No active project")

    created = sourcebook_create_entry(
        name=entry.name,
        description=entry.description,
        category=entry.category,
        synonyms=entry.synonyms,
        relations=[r.model_dump() for r in entry.relations],
        images=entry.images,
    )
    if "error" in created:
        raise HTTPException(status_code=400, detail=created["error"])

    refreshed = await sourcebook_refresh_entry_keywords(created["id"], payload={})
    if isinstance(refreshed, dict):
        created = refreshed
    return SourcebookEntry(**created)


@router.put("/sourcebook/{entry_name}")
async def update_sourcebook_entry(
    entry_name: str, updates: SourcebookEntryUpdate
) -> SourcebookEntry:
    """Update Sourcebook Entry."""
    active = get_active_project_dir()
    if not active:
        raise HTTPException(status_code=400, detail="No active project")

    result = sourcebook_update_entry(
        name_or_id=entry_name,
        name=updates.name,
        description=updates.description,
        category=updates.category,
        synonyms=updates.synonyms,
        relations=(
            [r.model_dump() for r in updates.relations]
            if updates.relations is not None
            else None
        ),
        images=updates.images,
    )
    if "error" in result:
        detail = str(result["error"])
        status = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status, detail=detail)
    refreshed = await sourcebook_refresh_entry_keywords(result["id"], payload={})
    if isinstance(refreshed, dict):
        result = refreshed
    return SourcebookEntry(**result)


@router.delete("/sourcebook/{entry_name}")
async def delete_sourcebook_entry(entry_name: str):
    """Delete Sourcebook Entry."""
    active = get_active_project_dir()
    if not active:
        raise HTTPException(status_code=400, detail="No active project")

    if not sourcebook_delete_entry(entry_name):
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"ok": True}
