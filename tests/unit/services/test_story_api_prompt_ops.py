# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for the prompt building helpers used by story generation."""

from unittest import TestCase

from augmentedquill.core.prompts import get_system_message
from augmentedquill.services.story.story_api_prompt_ops import (
    build_ai_action_messages,
    build_story_summary_messages,
)


class StoryApiPromptOpsTest(TestCase):
    def test_build_ai_action_messages_system_prompt_has_no_placeholders(self):
        messages = build_ai_action_messages(
            target="summary",
            action="rewrite",
            project_type_label="Novel",
            story_title="My Story",
            story_summary="Some story summary",
            story_tags="tag1, tag2",
            chapter_title="Chapter 1",
            chapter_summary="Some chapter summary",
            chapter_conflicts="",
            existing_content="Some chapter content",
            model_overrides={},
            language="en",
        )

        system_msg = next((m for m in messages if m["role"] == "system"), None)
        self.assertIsNotNone(system_msg)
        self.assertNotIn("{content_label}", system_msg["content"])
        self.assertNotIn("{tools_list}", system_msg["content"])
        self.assertNotIn("{tool_instructions}", system_msg["content"])

        # Regression guard: ensure at least one tool is listed in the system prompt.
        self.assertIn("get_story_metadata", system_msg["content"])

        user_msg = next((m for m in messages if m["role"] == "user"), None)
        self.assertIsNotNone(user_msg)

        expected_label = get_system_message("chapter_text_label", {}, language="en")
        self.assertIn(expected_label, user_msg["content"])

    def test_short_story_ai_action_messages_use_current_draft_wording(self):
        messages = build_ai_action_messages(
            target="chapter",
            action="rewrite",
            project_type_label="Short Story",
            story_title="My Story",
            story_summary="Some story summary",
            story_tags="tag1, tag2",
            chapter_title="My Story",
            chapter_summary="Some summary",
            chapter_conflicts="- Storm approaches",
            existing_content="Existing text",
            model_overrides={},
            language="en",
            project_type="short-story",
        )

        user_msg = next((m for m in messages if m["role"] == "user"), None)
        self.assertIsNotNone(user_msg)
        self.assertIn("current draft", user_msg["content"].lower())

    def test_story_summary_messages_use_book_heading_for_series(self):
        messages = build_story_summary_messages(
            mode="update",
            current_story_summary="Current project summary",
            source_summaries=["Book One:\nSeries setup", "Book Two:\nSeries payoff"],
            summary_heading="Book summaries",
            model_overrides={},
            language="en",
            project_type="series",
        )

        user_msg = next((m for m in messages if m["role"] == "user"), None)
        self.assertIsNotNone(user_msg)
        self.assertIn("Book summaries:", user_msg["content"])
        self.assertIn("Book One:\nSeries setup", user_msg["content"])
        self.assertNotIn("Chapter summaries:", user_msg["content"])
