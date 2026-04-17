# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the sourcebook keyword service unit so this responsibility stays isolated, testable, and easy to evolve."""

import json
import os
import re

from augmentedquill.core.config import (
    BASE_DIR,
    load_machine_config,
)
from augmentedquill.core.prompts import (
    get_system_message,
    get_user_prompt,
    load_model_prompt_overrides,
)

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
    from augmentedquill.services.sourcebook.sourcebook_helpers import (
        sourcebook_get_entry,
        sourcebook_update_entry,
    )

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
    from augmentedquill.services.sourcebook.sourcebook_helpers import (
        sourcebook_list_entries,
    )

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
    match_mode: str = "extensive",
    split_query_fallback: bool = False,
    payload: dict | None = None,
) -> list[dict]:
    """Shared search path for chat tool and UI filter.

    Missing keywords are generated first so extensive search can leverage them.
    """
    from augmentedquill.services.sourcebook.sourcebook_helpers import (
        sourcebook_search_entries,
    )

    await sourcebook_generate_missing_keywords(payload=payload)
    return sourcebook_search_entries(
        query,
        match_mode=match_mode,
        split_query_fallback=split_query_fallback,
    )
