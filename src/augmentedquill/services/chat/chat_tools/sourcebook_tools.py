# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the sourcebook tools unit so this responsibility stays isolated, testable, and easy to evolve."""

from typing import List, Union

from pydantic import BaseModel, Field

from augmentedquill.services.chat.chat_tool_decorator import (
    CHAT_ROLE,
    EDITING_ROLE,
    chat_tool,
)
from augmentedquill.services.sourcebook.sourcebook_helpers import (
    _get_entry_relations,
    sourcebook_add_relation,
    sourcebook_create_entry,
    sourcebook_delete_entry,
    sourcebook_get_entry,
    sourcebook_list_entries,
    sourcebook_refresh_entry_keywords,
    sourcebook_remove_relation,
    sourcebook_update_entry,
    _get_story_data,
)


def _strip_internal_sourcebook_fields(entry: dict | None) -> dict | None:
    """Remove internal-only fields before returning data to tool callers."""
    if not isinstance(entry, dict):
        return entry
    sanitized = dict(entry)
    sanitized.pop("keywords", None)

    # Ensure relations are always present for tool consumers, even if the source
    # entry payload does not include them directly.
    story, _ = _get_story_data()
    if story:
        entry_id = sanitized.get("id", sanitized.get("name", ""))
        relations = _get_entry_relations(entry_id, story)
        sanitized["relations"] = relations

    if "relations" in sanitized:
        formatted_rels = []
        entry_id = sanitized.get("id", sanitized.get("name", ""))

        project_type = (story.get("project_type") or "novel") if story else "novel"

        for r in sanitized.get("relations", []):
            direction = r.get("direction", "forward")
            target = r.get("target_id", "")
            rel_type = r.get("relation", "")

            if direction == "reverse":
                rel_tuple = [target, rel_type, entry_id]
            else:
                rel_tuple = [entry_id, rel_type, target]

            f_rel = {"relation": rel_tuple}

            if project_type in ("novel", "series"):
                if r.get("start_chapter"):
                    f_rel["start_chapter"] = r.get("start_chapter")
                if r.get("end_chapter"):
                    f_rel["end_chapter"] = r.get("end_chapter")

            if project_type == "series":
                if r.get("start_book"):
                    f_rel["start_book"] = r.get("start_book")
                if r.get("end_book"):
                    f_rel["end_book"] = r.get("end_book")

            formatted_rels.append(f_rel)

        sanitized["relations"] = formatted_rels

    return sanitized


def _strip_internal_sourcebook_fields_list(entries: list[dict]) -> list[dict]:
    """Apply response sanitization to every sourcebook entry in a list."""
    return [
        item
        for item in (
            _strip_internal_sourcebook_fields(entry) for entry in (entries or [])
        )
        if isinstance(item, dict)
    ]


# Pydantic models for tool parameters


class SourcebookRelation(BaseModel):
    """Represents a relation between sourcebook entries.

    The `relation` field is a 3-element tuple:
      1) source entry id
      2) relation descriptor (how source relates to target)
      3) target entry id
    """

    relation: List[str] = Field(
        ...,
        description=(
            "A 3-element list: [source_entry_id, relation_type, target_entry_id]. "
            "Used to express how one entry relates to another."
        ),
    )
    start_chapter: str | None = Field(
        None,
        description="Optional start chapter for the relation.",
    )
    end_chapter: str | None = Field(
        None,
        description="Optional end chapter for the relation.",
    )
    start_book: str | None = Field(
        None,
        description="Optional start book for the relation.",
    )
    end_book: str | None = Field(
        None,
        description="Optional end book for the relation.",
    )


class GetSourcebookEntryParams(BaseModel):
    """Parameters for retrieving one or more sourcebook entries."""

    name_or_id: Union[str, List[str]] = Field(
        ...,
        description=(
            "The name or ID of the sourcebook entry to retrieve. "
            "Can be either a single string or a list of strings."
        ),
    )


class CreateSourcebookEntryParams(BaseModel):
    """Parameters for creating a sourcebook entry."""

    name: str = Field(..., description="The name of the sourcebook entry")
    description: str = Field(..., description="The description/content of the entry")
    category: str = Field(
        ...,
        description="Required category for the entry (for example: character, location, item, concept)",
    )
    synonyms: list[str] = Field(
        default_factory=list,
        description="Optional list of synonyms/aliases.",
    )
    images: list[str] = Field(
        default_factory=list,
        description="Optional list of image IDs to associate with this entry.",
    )


class UpdateSourcebookEntryParams(BaseModel):
    """Parameters for updating a sourcebook entry."""

    name_or_id: str = Field(..., description="The name or ID of the entry to update")
    name: str | None = Field(None, description="New name for the entry")
    description: str | None = Field(None, description="New description for the entry")
    category: str | None = Field(None, description="New category for the entry")
    synonyms: list[str] | None = Field(
        None, description="New list of synonyms for the entry"
    )
    images: list[str] | None = Field(
        None, description="New list of image IDs for the entry"
    )


class DeleteSourcebookEntryParams(BaseModel):
    """Parameters for deleting a sourcebook entry."""

    name_or_id: str = Field(..., description="The name or ID of the entry to delete")


# Tool implementations with co-located schemas


@chat_tool(
    description="Get a specific sourcebook entry by name or ID.",
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="sourcebook-read",
)
async def get_sourcebook_entry(
    params: GetSourcebookEntryParams, payload: dict, mutations: dict
):
    """Get Sourcebook Entry.

    Accepts either a single string (name/ID) or a list of strings.
    """
    ids = params.name_or_id

    if isinstance(ids, str):
        entry = sourcebook_get_entry(ids)
        if not entry:
            return {"error": "Not found"}
        return _strip_internal_sourcebook_fields(entry)

    results: list[dict] = []
    for id_ in ids:
        entry = sourcebook_get_entry(id_)
        if entry:
            results.append(_strip_internal_sourcebook_fields(entry))
    return results


@chat_tool(
    description="Create a new sourcebook entry. Always provide name, description, and category. Allowed categories: Character, Location, Organization, Item, Event, Lore, Other. Synonyms and images are optional. For better lookup, set useful synonyms and relations (e.g., related characters/locations/organizations) when creating the entry.",
    allowed_roles=(CHAT_ROLE,),
    capability="sourcebook-write",
)
async def create_sourcebook_entry(
    params: CreateSourcebookEntryParams, payload: dict, mutations: dict
):
    """Create Sourcebook Entry."""
    new_entry = sourcebook_create_entry(
        name=params.name,
        description=params.description,
        category=params.category,
        synonyms=params.synonyms,
        images=params.images,
    )
    if "error" not in new_entry:
        mutations["story_changed"] = True
        refreshed = await sourcebook_refresh_entry_keywords(new_entry["id"], payload)
        if isinstance(refreshed, dict):
            new_entry = refreshed
    return _strip_internal_sourcebook_fields(new_entry)


@chat_tool(
    description=(
        "Update an existing sourcebook entry. Provide only the fields you want to change; this is a partial replacement. "
        "At least one of name, description, category, synonyms, or images must be provided. "
        "If category is provided, it must be one of: Character, Location, Organization, Item, Event, Lore, Other. "
        "For better lookup, also update synonyms and relations (e.g., related characters/locations/organizations) when applicable."
    ),
    allowed_roles=(CHAT_ROLE,),
    capability="sourcebook-write",
)
async def update_sourcebook_entry(
    params: UpdateSourcebookEntryParams, payload: dict, mutations: dict
):
    """Update Sourcebook Entry."""
    if (
        params.name is None
        and params.description is None
        and params.category is None
        and params.synonyms is None
        and params.images is None
    ):
        return {
            "error": "No update fields provided. Provide at least one of name, description, category, synonyms, or images with replacement values to update the entry."
        }

    result = sourcebook_update_entry(
        name_or_id=params.name_or_id,
        name=params.name,
        description=params.description,
        category=params.category,
        synonyms=params.synonyms,
        images=params.images,
    )
    if "error" not in result:
        mutations["story_changed"] = True
        refreshed = await sourcebook_refresh_entry_keywords(result["id"], payload)
        if isinstance(refreshed, dict):
            result = refreshed
    return _strip_internal_sourcebook_fields(result)


@chat_tool(
    description="Delete a sourcebook entry by name or ID.",
    allowed_roles=(CHAT_ROLE,),
    capability="sourcebook-write",
)
async def delete_sourcebook_entry(
    params: DeleteSourcebookEntryParams, payload: dict, mutations: dict
):
    """Delete Sourcebook Entry."""
    deleted = sourcebook_delete_entry(params.name_or_id)
    if deleted:
        mutations["story_changed"] = True
        return {"ok": True}
    return {"error": "Not found"}


# ---------------------------------------------------------------------------
# List / browse
# ---------------------------------------------------------------------------


class ListSourcebookEntriesParams(BaseModel):
    """Parameters for listing sourcebook entries."""

    category: str | None = Field(
        None,
        description=(
            "Optional category filter. Allowed values: "
            "Character, Location, Organization, Item, Event, Lore, Other."
        ),
    )


@chat_tool(
    description=(
        "List all sourcebook entries, optionally filtered by category. "
        "Returns id, name, category, description, synonyms, images, and relations for each entry."
    ),
    allowed_roles=(CHAT_ROLE, EDITING_ROLE),
    capability="sourcebook-read",
)
async def list_sourcebook_entries(
    params: ListSourcebookEntriesParams, payload: dict, mutations: dict
):
    """List all sourcebook entries with optional category filter."""
    entries = sourcebook_list_entries()
    if params.category:
        needle = params.category.strip().lower()
        entries = [e for e in entries if (e.get("category") or "").lower() == needle]
    return _strip_internal_sourcebook_fields_list(entries)


# ---------------------------------------------------------------------------
# Atomic relation management
# ---------------------------------------------------------------------------


class AddSourcebookRelationParams(BaseModel):
    """Parameters for adding a single sourcebook relation."""

    source_id: str = Field(..., description="The name/ID of the source entry.")
    relation_type: str = Field(
        ...,
        description="A short phrase describing how the source relates to the target (e.g. 'is ally of', 'owns').",
    )
    target_id: str = Field(..., description="The name/ID of the target entry.")
    start_chapter: str | None = Field(
        None, description="Optional chapter where the relation begins."
    )
    end_chapter: str | None = Field(
        None, description="Optional chapter where the relation ends."
    )
    start_book: str | None = Field(
        None, description="Optional book where the relation begins."
    )
    end_book: str | None = Field(
        None, description="Optional book where the relation ends."
    )


class RemoveSourcebookRelationParams(BaseModel):
    """Parameters for removing a single sourcebook relation."""

    source_id: str = Field(..., description="The name/ID of the source entry.")
    relation_type: str = Field(
        ..., description="The relation descriptor used when the relation was created."
    )
    target_id: str = Field(..., description="The name/ID of the target entry.")


@chat_tool(
    description=(
        "Add a single directed relation between two sourcebook entries. "
        "Use this instead of update_sourcebook_entry when you only want to add one relation "
        "without touching the entry's other data."
    ),
    allowed_roles=(CHAT_ROLE,),
    capability="sourcebook-write",
)
async def add_sourcebook_relation(
    params: AddSourcebookRelationParams, payload: dict, mutations: dict
):
    """Add Sourcebook Relation."""
    result = sourcebook_add_relation(
        source_id=params.source_id,
        relation_type=params.relation_type,
        target_id=params.target_id,
        start_chapter=params.start_chapter,
        end_chapter=params.end_chapter,
        start_book=params.start_book,
        end_book=params.end_book,
    )
    if "error" not in result:
        mutations["story_changed"] = True
    return result


@chat_tool(
    description=(
        "Remove a single directed relation between two sourcebook entries. "
        "Provide the exact source_id, relation_type, and target_id that were used when the relation was created."
    ),
    allowed_roles=(CHAT_ROLE,),
    capability="sourcebook-write",
)
async def remove_sourcebook_relation(
    params: RemoveSourcebookRelationParams, payload: dict, mutations: dict
):
    """Remove Sourcebook Relation."""
    result = sourcebook_remove_relation(
        source_id=params.source_id,
        relation_type=params.relation_type,
        target_id=params.target_id,
    )
    if "error" not in result:
        mutations["story_changed"] = True
    return result
