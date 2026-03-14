# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the sourcebook helpers unit so this responsibility stays isolated, testable, and easy to evolve."""

from typing import List, Optional, Dict
from augmentedquill.services.projects.projects import get_active_project_dir
from augmentedquill.core.config import load_story_config, save_story_config

_UNSET = object()

KNOWN_SOURCEBOOK_CATEGORIES: tuple[str, ...] = (
    "Character",
    "Location",
    "Organization",
    "Item",
    "Event",
    "Lore",
    "Other",
)

_CATEGORY_NORMALIZATION_MAP = {
    category.lower(): category for category in KNOWN_SOURCEBOOK_CATEGORIES
}


def _normalize_category_value(category: str | None) -> str | None:
    """Normalize category to a known canonical value, or None when unknown."""
    if not isinstance(category, str):
        return None
    normalized = _CATEGORY_NORMALIZATION_MAP.get(category.strip().lower())
    return normalized


def _normalize_entry_data(e_data: dict) -> dict:
    """Normalize sourcebook entry payload so callers always see stable keys."""
    description = e_data.get("description", "")
    if not isinstance(description, str):
        description = str(description or "")

    category = e_data.get("category")
    category = _normalize_category_value(category)

    raw_synonyms = e_data.get("synonyms")
    synonyms: list[str] = []
    if isinstance(raw_synonyms, list):
        for synonym in raw_synonyms:
            if isinstance(synonym, str):
                cleaned = synonym.strip()
                if cleaned and cleaned not in synonyms:
                    synonyms.append(cleaned)

    raw_images = e_data.get("images")
    images: list[str] = []
    if isinstance(raw_images, list):
        for image in raw_images:
            if isinstance(image, str):
                cleaned = image.strip()
                if cleaned:
                    images.append(cleaned)

    return {
        "description": description,
        "category": category,
        "synonyms": synonyms,
        "images": images,
    }


def _get_story_data():
    """Get Story Data."""
    active = get_active_project_dir()
    if not active:
        return None, None
    story_path = active / "story.json"
    story = load_story_config(story_path) or {}
    return story, story_path


def sourcebook_list_entries() -> List[Dict]:
    """Sourcebook List Entries."""
    story, _ = _get_story_data()
    if not story:
        return []

    sb_dict = story.get("sourcebook", {})
    if not isinstance(sb_dict, dict):
        return []

    results = []
    for name in sorted(sb_dict.keys(), key=str.lower):
        e_data = sb_dict.get(name) or {}
        if not isinstance(e_data, dict):
            continue
        results.append({"id": name, "name": name, **_normalize_entry_data(e_data)})

    return results


def sourcebook_search_entries(query: str) -> List[Dict]:
    """Sourcebook Search Entries."""
    story, _ = _get_story_data()
    if not story:
        return []
    sb_dict = story.get("sourcebook", {})

    query = query.lower()
    results = []

    for name, e_data in sb_dict.items():
        if not isinstance(e_data, dict):
            continue
        e = {"id": name, "name": name, **_normalize_entry_data(e_data)}
        # Search in name
        if query in name.lower():
            results.append(e)
            continue

        # Search in synonyms
        if any(query in s.lower() for s in e.get("synonyms", [])):
            results.append(e)
            continue

        # Search in description
        if query in e.get("description", "").lower():
            results.append(e)
            continue

    return results


def sourcebook_get_entry(name_or_id: str) -> Optional[Dict]:
    """Sourcebook Get Entry."""
    if not name_or_id:
        return None

    story, _ = _get_story_data()
    if not story:
        return None
    sb_dict = story.get("sourcebook", {})

    # Case-insensitive name lookup
    target = name_or_id.lower()
    for name, e_data in sb_dict.items():
        if not isinstance(e_data, dict):
            continue
        normalized = _normalize_entry_data(e_data)
        if name.lower() == target:
            return {"id": name, "name": name, **normalized}
        if any(target == s.lower() for s in normalized.get("synonyms", [])):
            return {"id": name, "name": name, **normalized}

    return None


def sourcebook_create_entry(
    name: str,
    description: str,
    category: str = None,
    synonyms: List[str] | object = _UNSET,
) -> Dict:
    """Create a sourcebook entry for the active project."""
    if not name or not isinstance(name, str) or not name.strip():
        return {"error": "Invalid name: Name must be a non-empty string."}

    if description is None or not isinstance(description, str):
        return {"error": "Invalid description: Description must be a string."}

    if not category or not isinstance(category, str) or not category.strip():
        return {"error": "Invalid category: Category must be a non-empty string."}

    normalized_category = _normalize_category_value(category)
    if normalized_category is None:
        allowed = ", ".join(KNOWN_SOURCEBOOK_CATEGORIES)
        return {"error": f"Invalid category: Category must be one of: {allowed}."}

    if synonyms is _UNSET:
        synonyms = []
    elif synonyms is None or not isinstance(synonyms, list):
        return {"error": "Invalid synonyms: Synonyms must be a list of strings."}

    cleaned_synonyms: list[str] = []
    for synonym in synonyms:
        if not isinstance(synonym, str):
            return {"error": "Invalid synonyms: Synonyms must be a list of strings."}
        cleaned = synonym.strip()
        if cleaned and cleaned not in cleaned_synonyms:
            cleaned_synonyms.append(cleaned)

    story, story_path = _get_story_data()
    if not story:
        return {"error": "No active project"}

    sb_dict = story.get("sourcebook", {})

    if name in sb_dict:
        return {"error": f"Entry '{name}' already exists."}

    new_entry_data = {
        "description": description,
        "category": normalized_category,
        "synonyms": cleaned_synonyms,
        "images": [],
    }

    sb_dict[name] = new_entry_data
    story["sourcebook"] = sb_dict
    save_story_config(story_path, story)
    return {"id": name, "name": name, **new_entry_data}


def sourcebook_delete_entry(name_or_id: str) -> bool:
    """Sourcebook Delete Entry."""
    if not name_or_id:
        return False

    story, story_path = _get_story_data()
    if not story:
        return False
    sb_dict = story.get("sourcebook", {})

    target = name_or_id.lower()

    found_key = None
    for name in sb_dict:
        if name.lower() == target:
            found_key = name
            break

    if found_key:
        del sb_dict[found_key]
        story["sourcebook"] = sb_dict
        save_story_config(story_path, story)
        return True

    return False


def sourcebook_update_entry(
    name_or_id: str,
    name: str = None,
    description: str = None,
    category: str = None,
    synonyms: List[str] = None,
) -> Dict:
    """Sourcebook Update Entry."""
    if not name_or_id:
        return {"error": "Invalid identifier: name_or_id is required."}

    story, story_path = _get_story_data()
    if not story:
        return {"error": "No active project"}

    sb_dict = story.get("sourcebook", {})
    target = name_or_id.lower()

    found_key = None
    for k in sb_dict:
        if k.lower() == target:
            found_key = k
            break

    if found_key is None:
        return {"error": "Entry not found."}

    entry_data = sb_dict[found_key]

    # Handle rename
    new_name = name
    if new_name is not None:
        if not isinstance(new_name, str) or not new_name.strip():
            return {"error": "Invalid name: Name must be a non-empty string."}

        if new_name != found_key:
            if new_name in sb_dict:
                return {"error": f"Entry '{new_name}' already exists."}
            del sb_dict[found_key]
            found_key = new_name

    # Validation for updates
    if description is not None:
        if not isinstance(description, str):
            return {"error": "Invalid description: Description must be a string."}
        entry_data["description"] = description

    if category is not None:
        if not isinstance(category, str):
            return {"error": "Invalid category: Category must be a string."}
        normalized_category = _normalize_category_value(category)
        if normalized_category is None:
            allowed = ", ".join(KNOWN_SOURCEBOOK_CATEGORIES)
            return {"error": f"Invalid category: Category must be one of: {allowed}."}
        entry_data["category"] = normalized_category

    if synonyms is not None:
        if not isinstance(synonyms, list):
            return {"error": "Invalid synonyms: Synonyms must be a list of strings."}
        cleaned_synonyms: list[str] = []
        for synonym in synonyms:
            if not isinstance(synonym, str):
                return {
                    "error": "Invalid synonyms: Synonyms must be a list of strings."
                }
            cleaned = synonym.strip()
            if cleaned and cleaned not in cleaned_synonyms:
                cleaned_synonyms.append(cleaned)
        entry_data["synonyms"] = cleaned_synonyms

    sb_dict[found_key] = entry_data
    story["sourcebook"] = sb_dict
    save_story_config(story_path, story)

    return {"id": found_key, "name": found_key, **_normalize_entry_data(entry_data)}
