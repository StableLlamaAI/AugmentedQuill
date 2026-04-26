# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Pydantic models for sourcebook API requests and responses.

Moving the models here (rather than defining them in the route module) ensures
they appear in the auto-generated OpenAPI schema so the frontend can derive
TypeScript types automatically.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class SourcebookRelation(BaseModel):
    """Represents the SourcebookRelation type."""

    target_id: str
    relation: str
    direction: Optional[str] = "forward"
    start_chapter: Optional[str] = None
    start_book: Optional[str] = None
    end_chapter: Optional[str] = None
    end_book: Optional[str] = None


class SourcebookEntry(BaseModel):
    """Represents the SourcebookEntry type."""

    id: str
    name: str
    synonyms: List[str] = []
    category: Optional[str] = None
    description: str
    images: List[str] = []
    keywords: List[str] = []
    relations: List[SourcebookRelation] = []


class SourcebookEntryCreate(BaseModel):
    """Represents the SourcebookEntryCreate type."""

    name: str
    synonyms: List[str] = []
    category: Optional[str] = None
    description: str
    images: List[str] = []
    relations: List[SourcebookRelation] = []


class SourcebookEntryUpdate(BaseModel):
    """Represents the SourcebookEntryUpdate type."""

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
    """Represents the SourcebookKeywordsResponse type."""

    keywords: List[str]
