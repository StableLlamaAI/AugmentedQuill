# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines tests for the unified story action streaming endpoint."""

import os
import tempfile
import json
from pathlib import Path
from unittest import TestCase, mock
from fastapi.testclient import TestClient

from augmentedquill.main import app
from augmentedquill.services.projects.projects import select_project


class StoryActionsTest(TestCase):
    captured_messages = None

    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.user_data_root = Path(self.td.name)
        self.projects_root = self.user_data_root / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = self.user_data_root / "projects.json"

        # Isolation env vars
        os.environ["AUGQ_USER_DATA_DIR"] = str(self.user_data_root)
        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)

        # Minimal mock of user settings
        self.config_dir = self.user_data_root / "config"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        (self.config_dir / "machine.json").write_text(
            json.dumps(
                {
                    "llm": {
                        "active_presets": {
                            "CHAT": "default",
                            "WRITING": "default",
                            "EDITING": "default",
                        },
                        "providers": {
                            "openai": {
                                "base_url": "http://fake",
                                "api_key": "fake-key",
                                "default_model": "gpt-4",
                                "timeout": 30,
                            }
                        },
                    }
                }
            )
        )

        self.client = TestClient(app)
        self._patch_llm()

    def tearDown(self):
        os.environ.pop("AUGQ_USER_DATA_DIR", None)
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)
        mock.patch.stopall()

    def _patch_llm(self):
        StoryActionsTest.captured_messages = None

        async def fake_chat_stream(**kwargs):
            StoryActionsTest.captured_messages = kwargs.get("messages")
            # We yield a recognizable piece of content
            yield {"content": "Generated content chunk."}

        mock.patch(
            "augmentedquill.services.llm.llm.unified_chat_stream",
            side_effect=fake_chat_stream,
        ).start()
        mock.patch(
            "augmentedquill.services.llm.llm.resolve_openai_credentials",
            return_value=("http://fake", "key", "model", 30, "fake"),
        ).start()

    def _make_project(self, name="action_test"):
        StoryActionsTest.captured_messages = None
        select_project(name)
        pdir = self.projects_root / name
        chdir = pdir / "chapters"
        chdir.mkdir(parents=True, exist_ok=True)
        (chdir / "0001.txt").write_text("Existing chapter content.", encoding="utf-8")
        story_cfg = {
            "project_title": "Action Story",
            "story_summary": "A grand tale.",
            "tags": ["epic"],
            "chapters": [{"title": "Ch 1", "summary": "Initial summary"}],
            "metadata": {"version": 2},
        }
        (pdir / "story.json").write_text(json.dumps(story_cfg), encoding="utf-8")
        return pdir

    def test_action_stream_invalid_chap_id(self):
        self._make_project()
        r = self.client.post(
            "/api/v1/story/action/stream",
            json={"target": "chapter", "action": "extend", "chap_id": 1},
        )
        # Invalid chap_id 999
        r = self.client.post(
            "/api/v1/story/action/stream",
            json={"target": "chapter", "action": "extend", "chap_id": 999},
        )
        self.assertEqual(r.status_code, 404)

    def test_action_stream_extend_chapter_persists(self):
        pdir = self._make_project()
        chap_f = pdir / "chapters" / "0001.txt"

        r = self.client.post(
            "/api/v1/story/action/stream",
            json={"target": "chapter", "action": "extend", "chap_id": 1},
        )
        self.assertEqual(r.status_code, 200)
        # Consume the stream to trigger persistence
        for line in r.iter_lines():
            # Check SSE format
            if line:
                decoded = line
                if decoded.startswith("data: "):
                    content = json.loads(decoded[6:])
                    self.assertEqual(content["content"], "Generated content chunk.")

        new_content = chap_f.read_text(encoding="utf-8")
        self.assertIn("Existing chapter content.", new_content)
        self.assertIn("Generated content chunk.", new_content)

    def test_action_stream_rewrite_chapter_persists(self):
        pdir = self._make_project()
        chap_f = pdir / "chapters" / "0001.txt"

        r = self.client.post(
            "/api/v1/story/action/stream",
            json={"target": "chapter", "action": "rewrite", "chap_id": 1},
        )
        self.assertEqual(r.status_code, 200)
        for line in r.iter_lines():
            pass

        new_content = chap_f.read_text(encoding="utf-8")
        self.assertEqual(new_content, "Generated content chunk.")

    def test_action_stream_update_summary_persists(self):
        pdir = self._make_project()
        story_f = pdir / "story.json"

        r = self.client.post(
            "/api/v1/story/action/stream",
            json={"target": "summary", "action": "update", "chap_id": 1},
        )
        self.assertEqual(r.status_code, 200)
        for line in r.iter_lines():
            pass

        story_cfg = json.loads(story_f.read_text(encoding="utf-8"))
        self.assertEqual(
            story_cfg["chapters"][0]["summary"], "Generated content chunk."
        )

    def test_action_stream_rewrite_summary_persists(self):
        pdir = self._make_project()
        story_f = pdir / "story.json"

        r = self.client.post(
            "/api/v1/story/action/stream",
            json={"target": "summary", "action": "rewrite", "chap_id": 1},
        )
        self.assertEqual(r.status_code, 200)
        for line in r.iter_lines():
            pass

        story_cfg = json.loads(story_f.read_text(encoding="utf-8"))
        self.assertEqual(
            story_cfg["chapters"][0]["summary"], "Generated content chunk."
        )
