# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the sourcebook helpers unit so this responsibility stays isolated, testable, and easy to evolve."""

from typing import List, Optional, Dict, Literal
import json
import re
import os
from augmentedquill.services.projects.projects import get_active_project_dir
from augmentedquill.core.config import (
    load_story_config,
    save_story_config,
    load_machine_config,
    BASE_DIR,
)
from augmentedquill.core.prompts import (
    get_system_message,
    get_user_prompt,
    load_model_prompt_overrides,
)

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

SOURCEBOOK_SEARCH_MODE = Literal["direct", "extensive"]

_KEYWORD_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "can",
    "could",
    "be",
    "been",
    "being",
    "both",
    "but",
    "by",
    "do",
    "does",
    "did",
    "had",
    "has",
    "have",
    "he",
    "her",
    "hers",
    "him",
    "his",
    "i",
    "if",
    "for",
    "from",
    "in",
    "is",
    "it",
    "its",
    "just",
    "me",
    "more",
    "most",
    "my",
    "no",
    "not",
    "our",
    "ours",
    "of",
    "only",
    "out",
    "own",
    "same",
    "she",
    "should",
    "so",
    "some",
    "than",
    "on",
    "their",
    "theirs",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "too",
    "or",
    "that",
    "the",
    "to",
    "very",
    "was",
    "we",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "will",
    "would",
    "were",
    "with",
    "you",
    "your",
    "yours",
}


def _estimate_sentence_count(text: str) -> int:
    """Estimate sentence count to bound generated keyword volume."""
    if not isinstance(text, str) or not text.strip():
        return 1
    parts = re.split(r"[.!?\n]+", text)
    meaningful = [p for p in parts if re.search(r"[A-Za-z0-9]", p or "")]
    return max(1, len(meaningful))


def _keyword_budget(description: str) -> int:
    """Compute max keyword count (roughly one to two per sentence, with safety cap)."""
    sentence_count = _estimate_sentence_count(description)
    return max(6, min(80, sentence_count * 2))


def _normalize_keyword_value(value: str) -> str:
    """Normalize a keyword to a stable lowercase representation."""
    normalized = re.sub(r"\s+", " ", (value or "").strip().lower())
    normalized = normalized.strip(".,;:!?()[]{}\"'`")
    return normalized


def _normalize_keywords(raw_keywords: list[str] | None) -> list[str]:
    """Normalize, dedupe, and filter keyword candidates."""
    if not isinstance(raw_keywords, list):
        return []

    seen: set[str] = set()
    cleaned: list[str] = []
    for keyword in raw_keywords:
        if not isinstance(keyword, str):
            continue
        value = _normalize_keyword_value(keyword)
        if not value:
            continue
        if len(value) < 3:
            continue
        if len(value.split()) > 5:
            continue
        if " " not in value and value in _KEYWORD_STOPWORDS:
            continue
        if value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    return cleaned


def _rank_and_limit_keywords(
    keywords: list[str],
    *,
    name: str,
    description: str,
    synonyms: list[str],
) -> list[str]:
    """Score keyword relevance and trim to an appropriate size budget."""
    normalized = _normalize_keywords(keywords)
    if not normalized:
        return []

    limit = _keyword_budget(description)
    lowered_name = (name or "").lower()
    lowered_synonyms = [s.lower() for s in (synonyms or []) if isinstance(s, str)]
    lowered_description = (description or "").lower()

    def _score(keyword: str) -> int:
        score = 0
        if keyword == lowered_name:
            score += 200
        elif keyword in lowered_name:
            score += 90

        if keyword in lowered_synonyms:
            score += 140
        elif any(keyword in s for s in lowered_synonyms):
            score += 70

        occurrences = lowered_description.count(keyword)
        score += min(occurrences, 5) * 8

        if " " in keyword:
            score += 10
        score += min(len(keyword), 24) // 4
        return score

    ordered = sorted(enumerate(normalized), key=lambda x: (-_score(x[1]), x[0]))
    return [kw for _, kw in ordered[:limit]]


def _fallback_keywords(name: str, description: str, synonyms: list[str]) -> list[str]:
    """Build deterministic fallback keywords when LLM keyword extraction is unavailable."""
    text = "\n".join([name or "", description or "", " ".join(synonyms or [])]).lower()
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9'_-]*", text)

    unigram_freq: dict[str, int] = {}
    for token in tokens:
        if len(token) < 3 or token in _KEYWORD_STOPWORDS:
            continue
        unigram_freq[token] = unigram_freq.get(token, 0) + 1

    bigram_freq: dict[str, int] = {}
    for idx in range(len(tokens) - 1):
        a = tokens[idx]
        b = tokens[idx + 1]
        if (
            len(a) < 3
            or len(b) < 3
            or a in _KEYWORD_STOPWORDS
            or b in _KEYWORD_STOPWORDS
        ):
            continue
        phrase = f"{a} {b}"
        bigram_freq[phrase] = bigram_freq.get(phrase, 0) + 1

    candidates: list[str] = []
    if name:
        candidates.append(name)
    candidates.extend(synonyms or [])

    for phrase, freq in sorted(bigram_freq.items(), key=lambda x: x[1], reverse=True):
        if freq >= 2:
            candidates.append(phrase)

    for token, _ in sorted(unigram_freq.items(), key=lambda x: x[1], reverse=True):
        candidates.append(token)

    return _rank_and_limit_keywords(
        candidates,
        name=name,
        description=description,
        synonyms=synonyms,
    )


def _parse_keywords_from_llm_content(content: str) -> list[str]:
    """Parse keyword list from LLM output with a strict JSON-first strategy."""
    raw = (content or "").strip()
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return []
        try:
            data = json.loads(match.group(0))
        except Exception:
            return []

    if not isinstance(data, dict):
        return []
    keywords = data.get("keywords")
    if not isinstance(keywords, list):
        return []
    return _normalize_keywords(keywords)


def _get_entry_relations(entry_id: str, story: dict) -> list[dict]:
    global_rels = story.get("sourcebook_relations") or []
    out = []
    for r in global_rels:
        if r.get("source_id") == entry_id:
            rel = dict(r)
            rel["target_id"] = rel.pop("target_id", "")
            rel.pop("source_id", None)
            rel["direction"] = "forward"
            out.append(rel)
        elif r.get("target_id") == entry_id:
            rel = dict(r)
            rel["target_id"] = rel.pop("source_id", "")
            rel.pop("source_id", None)
            rel["direction"] = "reverse"
            out.append(rel)
    return out


def _update_global_relations(
    entry_id: str, new_relations: list[dict] | None, story: dict
):
    if new_relations is None:
        return

    global_rels = story.get("sourcebook_relations") or []
    # Remove all relations involving entry_id
    filtered_rels = [
        r
        for r in global_rels
        if r.get("source_id") != entry_id and r.get("target_id") != entry_id
    ]

    # Add new relations
    for r in new_relations:
        d = r.get("direction", "forward")
        new_r = {
            "relation": r.get("relation", ""),
            "start_chapter": r.get("start_chapter"),
            "end_chapter": r.get("end_chapter"),
            "start_book": r.get("start_book"),
            "end_book": r.get("end_book"),
        }
        if d == "reverse":
            new_r["source_id"] = r.get("target_id", "")
            new_r["target_id"] = entry_id
        else:
            new_r["source_id"] = entry_id
            new_r["target_id"] = r.get("target_id", "")

        filtered_rels.append({k: v for k, v in new_r.items() if v is not None})

    story["sourcebook_relations"] = filtered_rels


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

    keywords = _normalize_keywords(e_data.get("keywords") or [])
    keywords = keywords[: _keyword_budget(description)]

    return {
        "description": description,
        "category": category,
        "synonyms": synonyms,
        "images": images,
        "keywords": keywords,
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
        norm = _normalize_entry_data(e_data)
        norm["id"] = name
        norm["name"] = name
        norm["relations"] = _get_entry_relations(name, story)
        results.append(norm)

    return results


def _matches_extensive_query(entry: dict, normalized_query: str) -> bool:
    """Return whether entry matches extensive query against name/synonyms/keywords."""
    if normalized_query in entry["name"].lower():
        return True
    if any(normalized_query in s.lower() for s in entry.get("synonyms", [])):
        return True
    if any(normalized_query in k.lower() for k in entry.get("keywords", [])):
        return True
    return False


def _split_query_tokens(query: str) -> list[str]:
    """Split query into meaningful tokens for fallback matching."""
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9'_-]*", query.lower())
    return _normalize_keywords(tokens)


def sourcebook_search_entries(
    query: str,
    match_mode: SOURCEBOOK_SEARCH_MODE = "extensive",
    split_query_fallback: bool = False,
) -> List[Dict]:
    """Search sourcebook entries with direct/extensive matching and optional split fallback."""
    story, _ = _get_story_data()
    if not story:
        return []

    normalized_query = _normalize_keyword_value(query)
    if not normalized_query:
        return sourcebook_list_entries()

    sb_dict = story.get("sourcebook", {})
    all_entries: list[dict] = []

    for name, e_data in sb_dict.items():
        if not isinstance(e_data, dict):
            continue
        all_entries.append({"id": name, "name": name, **_normalize_entry_data(e_data)})

    if match_mode == "direct":
        for entry in all_entries:
            if entry["name"].lower() == normalized_query:
                return [entry]
            if any(s.lower() == normalized_query for s in entry.get("synonyms", [])):
                return [entry]
        return []

    results = [
        entry
        for entry in all_entries
        if _matches_extensive_query(entry, normalized_query)
    ]
    if results or not split_query_fallback:
        return results

    fallback_tokens = _split_query_tokens(normalized_query)
    if not fallback_tokens:
        return []

    seen_ids: set[str] = set()
    fallback_results: list[dict] = []
    for token in fallback_tokens:
        token_matches = [
            entry for entry in all_entries if _matches_extensive_query(entry, token)
        ]
        for entry in token_matches:
            entry_id = str(entry.get("id"))
            if entry_id in seen_ids:
                continue
            seen_ids.add(entry_id)
            fallback_results.append(entry)
    return fallback_results


async def sourcebook_generate_keywords_with_editing_model(
    *,
    name: str,
    description: str,
    synonyms: list[str],
    payload: dict | None = None,
) -> list[str]:
    """Use WRITING model to extract keyword list from sourcebook description/facts."""
    from augmentedquill.services.llm import llm

    base_url, api_key, model_id, timeout_s, model_name = llm.resolve_openai_credentials(
        payload or {}, model_type="WRITING"
    )

    # Keep tests deterministic and avoid external network dependency.
    if os.getenv("PYTEST_CURRENT_TEST"):
        return []

    # Skip remote call when model target is not configured.
    if not model_id or not base_url:
        return []

    # Keyword extraction often runs on long sourcebook descriptions and local models,
    # so we allow a relaxed timeout window instead of a tight cap.
    configured_timeout = int(timeout_s or 60)
    effective_timeout = max(90, min(configured_timeout, 300))
    machine_config = load_machine_config(BASE_DIR / "config" / "machine.json") or {}
    model_overrides = load_model_prompt_overrides(machine_config, model_name)
    system_prompt = get_system_message(
        "sourcebook_keyword_extractor",
        model_overrides,
        language="en",
    )
    prompt_text = get_user_prompt(
        "sourcebook_keyword_extraction",
        language="en",
        entry_name=name,
        entry_synonyms=", ".join(synonyms or []),
        description_facts=description,
    )

    if not prompt_text:
        return []

    response = await llm.unified_chat_complete(
        caller_id="sourcebook.keyword_generation",
        model_type="WRITING",
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {"role": "user", "content": prompt_text},
        ],
        base_url=base_url,
        api_key=api_key,
        model_id=model_id,
        timeout_s=effective_timeout,
        model_name=model_name,
        max_tokens=256,
        temperature=0.2,
    )
    return _rank_and_limit_keywords(
        _parse_keywords_from_llm_content(response.get("content", "")),
        name=name,
        description=description,
        synonyms=synonyms,
    )


async def sourcebook_refresh_entry_keywords(
    name_or_id: str, payload: dict | None = None
) -> dict | None:
    """Regenerate and persist keywords for an existing entry with best-effort LLM extraction."""
    entry = sourcebook_get_entry(name_or_id)
    if not entry:
        return None

    keywords: list[str] = []
    try:
        keywords = await sourcebook_generate_keywords_with_editing_model(
            name=entry.get("name", ""),
            description=entry.get("description", ""),
            synonyms=entry.get("synonyms", []),
            payload=payload,
        )
    except Exception:
        keywords = []

    updated = sourcebook_update_entry(name_or_id=entry["id"], keywords=keywords)
    if "error" in updated:
        return None
    return updated


async def sourcebook_generate_missing_keywords(payload: dict | None = None) -> None:
    """Generate keywords for entries that currently have no keywords.

    This function is intentionally best-effort; failures are ignored so search remains responsive.
    """
    for entry in sourcebook_list_entries():
        existing = entry.get("keywords")
        if isinstance(existing, list) and len(existing) > 0:
            continue
        try:
            await sourcebook_refresh_entry_keywords(entry["id"], payload=payload)
        except Exception:
            continue


async def sourcebook_search_entries_with_keyword_refresh(
    query: str,
    match_mode: SOURCEBOOK_SEARCH_MODE = "extensive",
    split_query_fallback: bool = False,
    payload: dict | None = None,
) -> List[Dict]:
    """Shared search path for chat tool and UI filter.

    Missing keywords are generated first so extensive search can leverage them.
    """
    await sourcebook_generate_missing_keywords(payload=payload)
    return sourcebook_search_entries(
        query,
        match_mode=match_mode,
        split_query_fallback=split_query_fallback,
    )


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
        if name.lower() == target or any(
            target == s.lower() for s in normalized.get("synonyms", [])
        ):
            entry = {"id": name, "name": name, **normalized}
            entry["relations"] = _get_entry_relations(name, story)
            return entry

    return None


def sourcebook_create_entry(
    name: str,
    description: str,
    category: str = None,
    synonyms: List[str] | object = _UNSET,
    images: List[str] | object = _UNSET,
    keywords: List[str] | object = _UNSET,
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

    if images is _UNSET:
        images = []
    elif images is None or not isinstance(images, list):
        return {"error": "Invalid images: Images must be a list of strings."}

    cleaned_images: list[str] = []
    for image in images:
        if not isinstance(image, str):
            return {"error": "Invalid images: Images must be a list of strings."}
        cleaned_image = image.strip()
        if cleaned_image and cleaned_image not in cleaned_images:
            cleaned_images.append(cleaned_image)

    if keywords is _UNSET:
        cleaned_keywords = []
    elif keywords is None or not isinstance(keywords, list):
        return {"error": "Invalid keywords: Keywords must be a list of strings."}
    else:
        cleaned_keywords = _rank_and_limit_keywords(
            keywords,
            name=name,
            description=description,
            synonyms=cleaned_synonyms,
        )

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
        "images": cleaned_images,
        "keywords": cleaned_keywords,
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
    images: List[str] = None,
    keywords: List[str] = None,
    relations: List[Dict] = None,
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

    original_name = found_key

    # Handle rename
    new_name = name
    if new_name is not None:
        if not isinstance(new_name, str) or not new_name.strip():
            return {"error": "Invalid name: Name must be a non-empty string."}

        if new_name != found_key:
            if new_name in sb_dict:
                return {"error": f"Entry '{new_name}' already exists."}

            # fix external relations pointing to this entry
            global_rels = story.get("sourcebook_relations") or []
            for r in global_rels:
                if r.get("source_id") == found_key:
                    r["source_id"] = new_name
                if r.get("target_id") == found_key:
                    r["target_id"] = new_name

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

    if images is not None:
        if not isinstance(images, list):
            return {"error": "Invalid images: Images must be a list of strings."}
        cleaned_images: list[str] = []
        for image in images:
            if not isinstance(image, str):
                return {"error": "Invalid images: Images must be a list of strings."}
            cleaned_image = image.strip()
            if cleaned_image and cleaned_image not in cleaned_images:
                cleaned_images.append(cleaned_image)
        entry_data["images"] = cleaned_images

    if relations is not None:
        if not isinstance(relations, list):
            return {"error": "Invalid relations: Relations must be a list of dicts."}
        cleaned_relations: list[dict] = []
        for relation in relations:
            if not isinstance(relation, dict):
                return {
                    "error": "Invalid relations: Relations must be a list of dicts."
                }
            cleaned_relations.append(relation)

        _update_global_relations(found_key, cleaned_relations, story)

    if keywords is not None:
        if not isinstance(keywords, list):
            return {"error": "Invalid keywords: Keywords must be a list of strings."}
        effective_name = found_key if found_key else original_name
        effective_description = str(entry_data.get("description") or "")
        effective_synonyms = entry_data.get("synonyms")
        if not isinstance(effective_synonyms, list):
            effective_synonyms = []
        entry_data["keywords"] = _rank_and_limit_keywords(
            keywords,
            name=effective_name,
            description=effective_description,
            synonyms=effective_synonyms,
        )

    # Keep keywords updated even before async EDITING-model refresh.
    fields_affecting_keywords_changed = (
        name is not None or description is not None or synonyms is not None
    )
    if keywords is None and fields_affecting_keywords_changed:
        entry_data["keywords"] = []

    sb_dict[found_key] = entry_data
    story["sourcebook"] = sb_dict
    save_story_config(story_path, story)

    return {"id": found_key, "name": found_key, **_normalize_entry_data(entry_data)}
