# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the search service unit so this responsibility stays isolated, testable, and easy to evolve.

Implements full-text literal/regex and phonetic (soundex) search across all
content areas of a project: chapter prose, chapter metadata, story-level
metadata, and the sourcebook.
"""

from __future__ import annotations

import re
from pathlib import Path

from augmentedquill.models.search import (
    SearchMatch,
    SearchOptions,
    SearchResponse,
    SearchResultSection,
    SearchScope,
)

_CONTEXT_CHARS = 80


def _build_pattern(query: str, case_sensitive: bool, is_regex: bool) -> re.Pattern:
    """Compile the search regex from the query and options."""
    flags = 0 if case_sensitive else re.IGNORECASE
    pattern_str = query if is_regex else re.escape(query)
    return re.compile(pattern_str, flags)


def _extract_matches(text: str, pattern: re.Pattern) -> list[SearchMatch]:
    """Return all SearchMatch objects for a compiled regex applied to text."""
    matches = []
    for m in pattern.finditer(text):
        start, end = m.start(), m.end()
        ctx_start = max(0, start - _CONTEXT_CHARS)
        ctx_end = min(len(text), end + _CONTEXT_CHARS)
        matches.append(
            SearchMatch(
                start=start,
                end=end,
                match_text=m.group(),
                context_before=text[ctx_start:start],
                context_after=text[end:ctx_end],
            )
        )
    return matches


def _phonetic_matches(text: str, query: str) -> list[SearchMatch]:
    """Return SearchMatch objects for all words in *text* that sound like *query*.

    Only the first query token is used as the target soundex code; this covers
    single-word phonetic lookups (typical use: character names).
    """
    try:
        import jellyfish
    except ImportError:
        return []

    query_words = re.findall(r"\b\w+\b", query)
    if not query_words:
        return []

    target_code = jellyfish.soundex(query_words[0])
    matches = []
    for m in re.finditer(r"\b\w+\b", text):
        word = m.group()
        if jellyfish.soundex(word) == target_code:
            start, end = m.start(), m.end()
            ctx_start = max(0, start - _CONTEXT_CHARS)
            ctx_end = min(len(text), end + _CONTEXT_CHARS)
            matches.append(
                SearchMatch(
                    start=start,
                    end=end,
                    match_text=word,
                    context_before=text[ctx_start:start],
                    context_after=text[end:ctx_end],
                )
            )
    return matches


def _search_text(
    text: str,
    query: str,
    case_sensitive: bool,
    is_regex: bool,
    is_phonetic: bool,
) -> list[SearchMatch]:
    """Dispatch to the appropriate matching strategy and return matches."""
    if not query or not text:
        return []
    try:
        if is_phonetic:
            return _phonetic_matches(text, query)
        pattern = _build_pattern(query, case_sensitive, is_regex)
        return _extract_matches(text, pattern)
    except re.error:
        return []


# ─── Chapter helpers ─────────────────────────────────────────────────────────


def _read_chapter_content(chap_id: int) -> str:
    """Return content for a single chapter (empty string on failure)."""
    try:
        from augmentedquill.services.chapters.chapter_helpers import (
            _chapter_by_id_or_404,
        )

        _, path, _ = _chapter_by_id_or_404(chap_id)
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _get_all_chapter_ids() -> list[int]:
    """Return all available chapter IDs for the active project."""
    try:
        from augmentedquill.services.chapters.chapter_helpers import _scan_chapter_files

        return [int(vid) for vid, _ in _scan_chapter_files()]
    except Exception:
        return []


def _get_chapter_metadata_entries(active: Path) -> list[dict]:
    """Return a flat list of chapter metadata dicts from story.json."""
    try:
        from augmentedquill.core.config import load_story_config

        story = load_story_config(active / "story.json") or {}
        p_type = story.get("project_type", "novel")
        if p_type == "series":
            chapters = []
            for book in story.get("books", []):
                for ch in book.get("chapters", []):
                    chapters.append(ch)
            return chapters
        return story.get("chapters", [])
    except Exception:
        return []


# ─── Section builders ────────────────────────────────────────────────────────


def _search_chapter_content(
    active: Path,
    chapter_ids: list[int],
    query: str,
    case_sensitive: bool,
    is_regex: bool,
    is_phonetic: bool,
) -> list[SearchResultSection]:
    sections = []
    for chap_id in chapter_ids:
        content = _read_chapter_content(chap_id)
        matches = _search_text(content, query, case_sensitive, is_regex, is_phonetic)
        if matches:
            sections.append(
                SearchResultSection(
                    section_type="chapter_content",
                    section_id=str(chap_id),
                    section_title=f"Chapter {chap_id}",
                    field="content",
                    field_display="Content",
                    matches=matches,
                )
            )
    return sections


def _search_chapter_metadata(
    active: Path,
    chapter_ids: list[int],
    query: str,
    case_sensitive: bool,
    is_regex: bool,
    is_phonetic: bool,
) -> list[SearchResultSection]:
    sections = []
    metadata_entries = _get_chapter_metadata_entries(active)

    for idx, entry in enumerate(metadata_entries):
        # Derive a chapter ID from position (1-based) when the entry has no
        # explicit numeric id matching our virtual ids.
        chap_id = chapter_ids[idx] if idx < len(chapter_ids) else idx + 1
        title_label = entry.get("title") or f"Chapter {chap_id}"

        fields = [
            ("summary", "Summary"),
            ("notes", "Notes"),
            ("private_notes", "Private Notes"),
        ]
        for field_key, field_label in fields:
            value = entry.get(field_key) or ""
            if not value:
                continue
            matches = _search_text(value, query, case_sensitive, is_regex, is_phonetic)
            if matches:
                sections.append(
                    SearchResultSection(
                        section_type="chapter_metadata",
                        section_id=str(chap_id),
                        section_title=title_label,
                        field=field_key,
                        field_display=field_label,
                        matches=matches,
                    )
                )

        # Conflicts are stored as a list of dicts
        for cidx, conflict in enumerate(entry.get("conflicts") or []):
            for sub_field, sub_label in [
                ("description", f"Conflict {cidx + 1} description"),
                ("resolution", f"Conflict {cidx + 1} resolution"),
            ]:
                value = conflict.get(sub_field) or ""
                if not value:
                    continue
                matches = _search_text(
                    value, query, case_sensitive, is_regex, is_phonetic
                )
                if matches:
                    sections.append(
                        SearchResultSection(
                            section_type="chapter_metadata",
                            section_id=str(chap_id),
                            section_title=title_label,
                            field=f"conflicts[{cidx}].{sub_field}",
                            field_display=sub_label,
                            matches=matches,
                        )
                    )
    return sections


def _search_story_metadata(
    active: Path,
    query: str,
    case_sensitive: bool,
    is_regex: bool,
    is_phonetic: bool,
) -> list[SearchResultSection]:
    sections = []
    try:
        from augmentedquill.core.config import load_story_config

        story = load_story_config(active / "story.json") or {}
    except Exception:
        return []

    project_title = story.get("project_title") or "Story"

    fields = [
        ("story_summary", "Story Summary"),
        ("notes", "Story Notes"),
        ("private_notes", "Story Private Notes"),
    ]
    for field_key, field_label in fields:
        value = story.get(field_key) or ""
        if not value:
            continue
        matches = _search_text(value, query, case_sensitive, is_regex, is_phonetic)
        if matches:
            sections.append(
                SearchResultSection(
                    section_type="story_metadata",
                    section_id="story",
                    section_title=project_title,
                    field=field_key,
                    field_display=field_label,
                    matches=matches,
                )
            )

    for cidx, conflict in enumerate(story.get("conflicts") or []):
        for sub_field, sub_label in [
            ("description", f"Story Conflict {cidx + 1} description"),
            ("resolution", f"Story Conflict {cidx + 1} resolution"),
        ]:
            value = conflict.get(sub_field) or ""
            if not value:
                continue
            matches = _search_text(value, query, case_sensitive, is_regex, is_phonetic)
            if matches:
                sections.append(
                    SearchResultSection(
                        section_type="story_metadata",
                        section_id="story",
                        section_title=project_title,
                        field=f"conflicts[{cidx}].{sub_field}",
                        field_display=sub_label,
                        matches=matches,
                    )
                )

    # Series: also search book-level metadata
    for book in story.get("books", []):
        book_id = book.get("id") or ""
        book_title = book.get("title") or book_id
        for field_key, field_label in [("summary", "Summary"), ("notes", "Notes")]:
            value = book.get(field_key) or ""
            if not value:
                continue
            matches = _search_text(value, query, case_sensitive, is_regex, is_phonetic)
            if matches:
                sections.append(
                    SearchResultSection(
                        section_type="story_metadata",
                        section_id=f"book:{book_id}",
                        section_title=f"Book: {book_title}",
                        field=field_key,
                        field_display=field_label,
                        matches=matches,
                    )
                )

    return sections


def _search_sourcebook(
    active: Path,
    query: str,
    case_sensitive: bool,
    is_regex: bool,
    is_phonetic: bool,
) -> list[SearchResultSection]:
    sections = []
    try:
        from augmentedquill.services.sourcebook.sourcebook_helpers import (
            sourcebook_list_entries,
        )

        entries = sourcebook_list_entries(active) or []
    except Exception:
        return []

    for entry in entries:
        entry_id = entry.get("id") or entry.get("name") or ""
        entry_name = entry.get("name") or entry_id

        for field_key, field_label in [
            ("description", "Description"),
            ("name", "Name"),
        ]:
            value = entry.get(field_key) or ""
            if not value:
                continue
            matches = _search_text(value, query, case_sensitive, is_regex, is_phonetic)
            if matches:
                sections.append(
                    SearchResultSection(
                        section_type="sourcebook",
                        section_id=entry_id,
                        section_title=entry_name,
                        field=field_key,
                        field_display=field_label,
                        matches=matches,
                    )
                )

        # Also search synonyms joined as one string
        synonyms = entry.get("synonyms") or []
        if synonyms:
            synonyms_text = ", ".join(synonyms)
            matches = _search_text(
                synonyms_text, query, case_sensitive, is_regex, is_phonetic
            )
            if matches:
                sections.append(
                    SearchResultSection(
                        section_type="sourcebook",
                        section_id=entry_id,
                        section_title=entry_name,
                        field="synonyms",
                        field_display="Synonyms",
                        matches=matches,
                    )
                )

    return sections


# ─── Public API ──────────────────────────────────────────────────────────────


def run_search(opts: SearchOptions, active: Path) -> SearchResponse:
    """Execute a search and return all matching sections.

    Args:
        opts:   Validated SearchOptions model.
        active: Path to the active project directory.
    """
    q = opts.query
    cs = opts.case_sensitive
    rx = opts.is_regex
    ph = opts.is_phonetic

    # Refuse to search if query is blank
    if not q.strip():
        return SearchResponse(results=[], total_matches=0)

    # Validate regex early so the caller gets a clean error
    if rx and not ph:
        try:
            re.compile(q if cs else q, 0 if cs else re.IGNORECASE)
        except re.error as exc:
            raise ValueError(f"Invalid regular expression: {exc}") from exc

    scope = opts.scope
    sections: list[SearchResultSection] = []

    include_chapters = scope in (
        SearchScope.current_chapter,
        SearchScope.all_chapters,
        SearchScope.all,
    )
    include_metadata = scope in (SearchScope.metadata, SearchScope.all)
    include_sourcebook = scope in (SearchScope.sourcebook, SearchScope.all)

    if include_chapters:
        if scope == SearchScope.current_chapter:
            chapter_ids = (
                [opts.active_chapter_id] if opts.active_chapter_id is not None else []
            )
        else:
            chapter_ids = _get_all_chapter_ids()

        sections.extend(_search_chapter_content(active, chapter_ids, q, cs, rx, ph))

    if include_metadata:
        all_ids = _get_all_chapter_ids()
        sections.extend(_search_chapter_metadata(active, all_ids, q, cs, rx, ph))
        sections.extend(_search_story_metadata(active, q, cs, rx, ph))

    if include_sourcebook:
        sections.extend(_search_sourcebook(active, q, cs, rx, ph))

    total = sum(len(s.matches) for s in sections)
    return SearchResponse(results=sections, total_matches=total)
