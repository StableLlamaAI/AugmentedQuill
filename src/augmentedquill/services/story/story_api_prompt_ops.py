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
    base_url, api_key, model_id, timeout_s, model_name = llm.resolve_openai_credentials(
        payload, model_type=model_type
    )
    machine_config = load_machine_config(base_dir / "config" / "machine.json") or {}
    # model_name returned from resolve_openai_credentials is the selected name!
    model_overrides = load_model_prompt_overrides(machine_config, model_name)
    return (
        base_url,
        api_key,
        model_id,
        timeout_s,
        model_name,
        model_overrides,
        model_type,
    )


def _build_messages(
    *,
    system_message_key: str,
    user_prompt_key: str,
    model_overrides: dict,
    language: str | None = None,
    **prompt_kwargs,
) -> list[dict[str, str]]:
    """Build a two-message system/user prompt pair for story generation flows.

    ``language`` is the story/project language code and is forwarded to the
    prompt helpers.
    """
    sys_msg = {
        "role": "system",
        "content": get_system_message(
            system_message_key, model_overrides, language=language
        ),
    }
    user_prompt = get_user_prompt(
        user_prompt_key,
        language=language,
        user_prompt_overrides=model_overrides,
        **prompt_kwargs,
    )
    return [sys_msg, {"role": "user", "content": user_prompt}]


def build_chapter_summary_messages(
    *,
    mode: str,
    current_summary: str,
    chapter_text: str,
    model_overrides: dict,
    language: str | None = None,
):
    """Build messages for creating or updating a chapter summary."""
    sys_msg = {
        "role": "system",
        "content": get_system_message(
            "chapter_summarizer", model_overrides, language=language
        ),
    }
    if mode == "discard" or not current_summary:
        user_prompt = get_user_prompt(
            "chapter_summary_new",
            language=language,
            chapter_text=chapter_text,
            user_prompt_overrides=model_overrides,
        )
    else:
        user_prompt = get_user_prompt(
            "chapter_summary_update",
            language=language,
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
    language: str | None = None,
):
    """Build messages for creating or updating a story-level summary."""
    sys_msg = {
        "role": "system",
        "content": get_system_message(
            "story_summarizer", model_overrides, language=language
        ),
    }
    if mode == "discard" or not current_story_summary:
        user_prompt = get_user_prompt(
            "story_summary_new",
            language=language,
            chapter_summaries="\n\n".join(chapter_summaries),
            user_prompt_overrides=model_overrides,
        )
    else:
        user_prompt = get_user_prompt(
            "story_summary_update",
            language=language,
            existing_summary=current_story_summary,
            chapter_summaries="\n\n".join(chapter_summaries),
            user_prompt_overrides=model_overrides,
        )
    return [sys_msg, {"role": "user", "content": user_prompt}]


def build_write_chapter_messages(
    *,
    story_title: str,
    story_summary: str,
    story_tags: str,
    background: str,
    chapter_title: str,
    chapter_summary: str,
    chapter_conflicts: str,
    model_overrides: dict,
    language: str | None = None,
):
    """Build messages for first-pass chapter drafting."""
    return _build_messages(
        system_message_key="story_writer",
        user_prompt_key="write_chapter",
        model_overrides=model_overrides,
        language=language,
        story_title=story_title,
        story_summary=story_summary,
        story_tags=story_tags,
        background=background,
        chapter_title=chapter_title,
        chapter_summary=chapter_summary,
        chapter_conflicts=chapter_conflicts,
    )


def build_continue_chapter_messages(
    *,
    story_title: str,
    story_summary: str,
    story_tags: str,
    background: str,
    chapter_title: str,
    chapter_summary: str,
    chapter_conflicts: str,
    existing_text: str,
    model_overrides: dict,
    language: str | None = None,
):
    """Build messages for continuing an existing chapter draft."""
    return _build_messages(
        system_message_key="story_continuer",
        user_prompt_key="continue_chapter",
        model_overrides=model_overrides,
        language=language,
        story_title=story_title,
        story_summary=story_summary,
        story_tags=story_tags,
        background=background,
        chapter_title=chapter_title,
        chapter_summary=chapter_summary,
        chapter_conflicts=chapter_conflicts,
        existing_text=existing_text,
    )


def build_ai_action_messages(
    *,
    target: str,
    action: str,
    story_title: str,
    story_summary: str,
    story_tags: str,
    chapter_title: str,
    chapter_summary: str,
    chapter_conflicts: str,
    existing_content: str,
    style_tags: str,
    model_overrides: dict,
    language: str | None = None,
):
    """Build messages for generic AI Actions (Extend/Rewrite/Summary)."""
    # Map target/action to prompt keys
    if target == "summary":
        sys_key = f"ai_action_summary_{action}"
        user_key = f"ai_action_summary_{action}_user"
    elif target == "book_summary":
        sys_key = "ai_action_summary_rewrite"
        user_key = "ai_action_summary_rewrite_user"
    elif target == "story_summary":
        sys_key = "ai_action_summary_rewrite"
        user_key = "ai_action_summary_rewrite_user"
    else:
        sys_key = f"ai_action_chapter_{action}"
        user_key = f"ai_action_chapter_{action}_user"

    # User templates for AI actions are currently same as standard ones
    if user_key.startswith("ai_action_chapter_"):
        if action == "extend":
            user_key = "continue_chapter"
        elif action == "rewrite":
            user_key = "write_chapter"
    elif user_key.startswith("ai_action_summary_"):
        if action == "rewrite":
            user_key = "chapter_summary_new"
        else:
            user_key = "chapter_summary_update"

    return _build_messages(
        system_message_key=sys_key,
        user_prompt_key=user_key,
        model_overrides=model_overrides,
        language=language,
        story_title=story_title,
        story_summary=story_summary,
        story_tags=story_tags,
        chapter_title=chapter_title,
        chapter_summary=chapter_summary,
        chapter_conflicts=chapter_conflicts,
        chapter_content=existing_content,
        chapter_text=existing_content,
        existing_text=existing_content,
        current_summary=chapter_summary,
        existing_summary=chapter_summary,
        style_tags=style_tags,
        background="",  # Background is not used for AI actions for now
    )
