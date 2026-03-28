# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test settings api ops unit so this responsibility stays isolated, testable, and easy to evolve."""

import tempfile
from pathlib import Path
from unittest import TestCase

from augmentedquill.services.settings.settings_api_ops import (
    build_story_cfg_from_payload,
    clean_machine_openai_cfg_for_put,
    update_story_field,
    validate_and_fill_openai_cfg_for_settings,
)


class SettingsApiOpsTest(TestCase):
    def test_build_story_cfg_normalizes_defaults_and_types(self):
        cfg = build_story_cfg_from_payload(
            {
                "project_title": "My Story",
                "story_summary": "Summary",
                "llm_prefs": {"temperature": "0.9", "max_tokens": "4096"},
                "tags": "not-a-list",
                "chapters": [{"title": "A"}],
            }
        )
        self.assertEqual(cfg["project_title"], "My Story")
        self.assertEqual(cfg["format"], "markdown")
        self.assertEqual(cfg["story_summary"], "Summary")
        self.assertEqual(cfg["tags"], [])
        self.assertEqual(cfg["llm_prefs"]["temperature"], 0.9)
        self.assertEqual(cfg["llm_prefs"]["max_tokens"], 4096)
        self.assertEqual(len(cfg["chapters"]), 1)

    def test_validate_and_fill_openai_cfg_backfills_selected_roles(self):
        result, err = validate_and_fill_openai_cfg_for_settings(
            {
                "models": [
                    {
                        "name": "m1",
                        "base_url": "https://example.invalid/v1",
                        "model": "gpt-demo",
                    }
                ]
            }
        )
        self.assertIsNone(err)
        assert result is not None
        self.assertEqual(result["selected"], "m1")
        self.assertEqual(result["selected_chat"], "m1")
        self.assertEqual(result["selected_writing"], "m1")
        self.assertEqual(result["selected_editing"], "m1")

    def test_validate_and_fill_openai_cfg_rejects_duplicate_names(self):
        result, err = validate_and_fill_openai_cfg_for_settings(
            {
                "models": [
                    {"name": "m1", "base_url": "x", "model": "a"},
                    {"name": "m1", "base_url": "y", "model": "b"},
                ]
            }
        )
        self.assertIsNone(result)
        assert err is not None
        self.assertIn("Duplicate model name", err)

    def test_clean_machine_openai_cfg_for_put_coerces_selection_and_fields(self):
        payload, selected, err = clean_machine_openai_cfg_for_put(
            {
                "models": [
                    {
                        "name": "m1",
                        "base_url": "https://example.invalid/v1",
                        "model": "gpt-demo",
                        "timeout_s": "not-int",
                        "temperature": "0.5",
                        "max_tokens": "1024",
                        "stop": "A\nB",
                        "extra_body": {"foo": "bar"},
                    }
                ],
                "selected": "missing",
            }
        )
        self.assertIsNone(err)
        self.assertEqual(selected, "m1")
        assert payload is not None
        openai = payload["openai"]
        self.assertEqual(openai["selected"], "m1")
        self.assertEqual(openai["selected_chat"], "m1")
        model = openai["models"][0]
        self.assertEqual(model["timeout_s"], 60)
        self.assertEqual(model["temperature"], 0.5)
        self.assertEqual(model["max_tokens"], 1024)
        self.assertEqual(model["stop"], ["A", "B"])
        self.assertEqual(model["extra_body"], '{"foo": "bar"}')

    def test_clean_machine_openai_cfg_for_put_rejects_required_fields(self):
        payload, selected, err = clean_machine_openai_cfg_for_put(
            {"models": [{"name": "m1", "base_url": "", "model": ""}]}
        )
        self.assertIsNone(payload)
        self.assertIsNone(selected)
        assert err is not None
        self.assertIn("missing base_url", err)

    def test_update_story_field_persists_value(self):
        with tempfile.TemporaryDirectory() as td:
            story_path = Path(td) / "story.json"
            story_path.write_text(
                '{"metadata": {"version": 2}, "project_title": "P"}',
                encoding="utf-8",
            )

            update_story_field(story_path, "tags", ["a", "b"])
            written = story_path.read_text(encoding="utf-8")
            self.assertIn('"tags": [', written)
