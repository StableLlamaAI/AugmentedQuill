# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the story api prompt ops unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

from pathlib import Path

from augmentedquill.services.llm import llm
from augmentedquill.core.config import load_machine_config
from augmentedquill.core.prompts import (
    get_system_message,
    get_user_prompt,
    load_model_prompt_overrides,
)


def resolve_model_runtime(payload: dict, model_type: str, base_dir: Path):
    """Resolve runtime model credentials and prompt overrides for a request."""
    base_url, api_key, model_id, timeout_s = llm.resolve_openai_credentials(
        payload, model_type=model_type
    )
    machine_config = load_machine_config(base_dir / "config" / "machine.json") or {}
    selected_model_name = llm.get_selected_model_name(payload, model_type=model_type)
    model_overrides = load_model_prompt_overrides(machine_config, selected_model_name)
    return base_url, api_key, model_id, timeout_s, model_overrides


def _build_messages(
    *,
    system_message_key: str,
    user_prompt_key: str,
    model_overrides: dict,
    **prompt_kwargs,
) -> list[dict[str, str]]:
    """Build a two-message system/user prompt pair for story generation flows."""
    sys_msg = {
        "role": "system",
        "content": get_system_message(system_message_key, model_overrides),
    }
    user_prompt = get_user_prompt(
        user_prompt_key,
        user_prompt_overrides=model_overrides,
        **prompt_kwargs,
    )
    return [sys_msg, {"role": "user", "content": user_prompt}]


def build_chapter_summary_messages(
    *, mode: str, current_summary: str, chapter_text: str, model_overrides: dict
):
    """Build messages for creating or updating a chapter summary."""
    sys_msg = {
        "role": "system",
        "content": get_system_message("chapter_summarizer", model_overrides),
    }
    if mode == "discard" or not current_summary:
        user_prompt = get_user_prompt(
            "chapter_summary_new",
            chapter_text=chapter_text,
            user_prompt_overrides=model_overrides,
        )
    else:
        user_prompt = get_user_prompt(
            "chapter_summary_update",
            existing_summary=current_summary,
            chapter_text=chapter_text,
            user_prompt_overrides=model_overrides,
        )
    return [sys_msg, {"role": "user", "content": user_prompt}]


def build_story_summary_messages(
    *,
    mode: str,
    current_story_summary: str,
    chapter_summaries: list[str],
    model_overrides: dict,
):
    """Build messages for creating or updating a story-level summary."""
    sys_msg = {
        "role": "system",
        "content": get_system_message("story_summarizer", model_overrides),
    }
    if mode == "discard" or not current_story_summary:
        user_prompt = get_user_prompt(
            "story_summary_new",
            chapter_summaries="\n\n".join(chapter_summaries),
            user_prompt_overrides=model_overrides,
        )
    else:
        user_prompt = get_user_prompt(
            "story_summary_update",
            existing_summary=current_story_summary,
            chapter_summaries="\n\n".join(chapter_summaries),
            user_prompt_overrides=model_overrides,
        )
    return [sys_msg, {"role": "user", "content": user_prompt}]


def build_write_chapter_messages(
    *,
    project_title: str,
    chapter_title: str,
    chapter_summary: str,
    model_overrides: dict,
):
    """Build messages for first-pass chapter drafting."""
    return _build_messages(
        system_message_key="story_writer",
        user_prompt_key="write_chapter",
        model_overrides=model_overrides,
        project_title=project_title,
        chapter_title=chapter_title,
        chapter_summary=chapter_summary,
    )


def build_continue_chapter_messages(
    *,
    chapter_title: str,
    chapter_summary: str,
    existing_text: str,
    model_overrides: dict,
):
    """Build messages for continuing an existing chapter draft."""
    return _build_messages(
        system_message_key="story_continuer",
        user_prompt_key="continue_chapter",
        model_overrides=model_overrides,
        chapter_title=chapter_title,
        chapter_summary=chapter_summary,
        existing_text=existing_text,
    )
