# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test chat tools unit so this responsibility stays isolated, testable, and easy to evolve."""

import json
import os
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import augmentedquill.main as main
from augmentedquill.services.projects.projects import select_project


class ChatToolsTest(TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.projects_root = Path(self.td.name) / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = Path(self.td.name) / "projects.json"
        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)
        self.client = TestClient(main.app)

    def tearDown(self):
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    def _bootstrap_project(self):
        ok, msg = select_project("demo")
        self.assertTrue(ok, msg)
        pdir = self.projects_root / "demo"
        chdir = pdir / "chapters"
        chdir.mkdir(parents=True, exist_ok=True)
        (chdir / "0001.txt").write_text("Alpha chapter content.", encoding="utf-8")
        (chdir / "0002.txt").write_text("Beta chapter content.", encoding="utf-8")
        (pdir / "story.json").write_text(
            '{"metadata": {"version": 2}, "project_title":"Demo","format":"markdown","chapters":[{"title":"Intro","summary":""},{"title":"Next","summary":""}],"llm_prefs":{"temperature":0.7,"max_tokens":256}}',
            encoding="utf-8",
        )

    def _post_single_tool(self, name: str, arguments: dict | str):
        return self._post_single_tool_for_role("CHAT", name, arguments)

    def _post_single_tool_for_role(
        self, model_type: str, name: str, arguments: dict | str
    ):
        if isinstance(arguments, str):
            args = arguments
        else:
            args = json.dumps(arguments)

        body = {
            "model_type": model_type,
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": f"call_{name}",
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": args,
                            },
                        }
                    ],
                }
            ],
        }
        response = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_update_metadata_and_aliases(self):
        self._bootstrap_project()

        # 1. Test update_chapter_metadata with new fields
        body = {
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "u1",
                            "type": "function",
                            "function": {
                                "name": "update_chapter_metadata",
                                "arguments": json.dumps(
                                    {
                                        "chap_id": 1,
                                        "notes": "New note",
                                        "conflicts": json.dumps(
                                            [{"id": "c1", "description": "Fight!"}]
                                        ),
                                    }
                                ),
                            },
                        }
                    ],
                }
            ]
        }
        r = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(r.status_code, 200)

        # Verify persistence
        pdir = self.projects_root / "demo"
        with open(pdir / "story.json", "r") as f:
            story = json.load(f)
        chap1 = story["chapters"][0]
        self.assertEqual(chap1.get("notes"), "New note")
        self.assertIsNone(chap1.get("private_notes"))
        self.assertEqual(len(chap1.get("conflicts", [])), 1)

        # 2. Test aliases for story summary
        body_alias = {
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "a1",
                            "type": "function",
                            "function": {
                                "name": "get_story_metadata",
                                "arguments": "{}",
                            },
                        }
                    ],
                }
            ]
        }
        r = self.client.post("/api/v1/chat/tools", json=body_alias)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("Demo", data["appended_messages"][0]["content"])

    def test_tools_execute_write_functions(self):
        self._bootstrap_project()

        # Test write_chapter_content
        body_content = {
            "model_name": None,
            "model_type": "EDITING",
            "messages": [
                {"role": "user", "content": "Write new content to chapter 1"},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_write_content",
                            "type": "function",
                            "function": {
                                "name": "write_chapter_content",
                                "arguments": '{"chap_id":1,"content":"Updated content"}',
                            },
                        },
                    ],
                },
            ],
            "active_chapter_id": 1,
        }

        r = self.client.post("/api/v1/chat/tools", json=body_content)
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertTrue(data.get("ok"))
        app = data.get("appended_messages") or []
        self.assertEqual(len(app), 1)
        t = app[0]
        self.assertEqual(t.get("role"), "tool")
        self.assertEqual(t.get("name"), "write_chapter_content")
        self.assertIn("successfully", t.get("content", ""))

        # Verify content was written
        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        self.assertEqual(chapter_file.read_text(encoding="utf-8"), "Updated content")

        # Test write_chapter_summary
        body_summary = {
            "model_name": None,
            "messages": [
                {"role": "user", "content": "Write new summary to chapter 1"},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_write_summary",
                            "type": "function",
                            "function": {
                                "name": "write_chapter_summary",
                                "arguments": '{"chap_id":1,"summary":"Updated summary"}',
                            },
                        },
                    ],
                },
            ],
            "active_chapter_id": 1,
        }

        r2 = self.client.post("/api/v1/chat/tools", json=body_summary)
        self.assertEqual(r2.status_code, 200, r2.text)
        data2 = r2.json()
        self.assertTrue(data2.get("ok"))
        app2 = data2.get("appended_messages") or []
        self.assertEqual(len(app2), 1)
        t2 = app2[0]
        self.assertEqual(t2.get("role"), "tool")
        self.assertEqual(t2.get("name"), "write_chapter_summary")
        self.assertIn("successfully", t2.get("content", ""))

        # Verify summary was written
        story_file = self.projects_root / "demo" / "story.json"
        story = json.loads(story_file.read_text(encoding="utf-8"))
        self.assertEqual(story["chapters"][0]["summary"], "Updated summary")

    def test_get_current_chapter_tool(self):
        self._bootstrap_project()

        # Call as a tool execution request with active_chapter_id set.
        body = {
            "model_type": "CHAT",
            "active_chapter_id": 1,
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_get_current_chapter",
                            "type": "function",
                            "function": {
                                "name": "get_current_chapter_id",
                                "arguments": "{}",
                            },
                        }
                    ],
                }
            ],
        }
        response = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()

        self.assertIn("appended_messages", result)
        appended = result.get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        tool_msg = appended[0]
        self.assertEqual(tool_msg.get("role"), "tool")
        self.assertEqual(tool_msg.get("name"), "get_current_chapter_id")

        payload = json.loads(tool_msg.get("content", "{}"))
        self.assertIn("chapter_id", payload)
        self.assertIn("chapter_title", payload)
        self.assertEqual(payload["chapter_title"], "Intro")
        self.assertNotIn("project_type", payload)
        self.assertNotIn("current_book", payload)

    def test_get_chapter_metadata_by_concrete_or_current(self):
        self._bootstrap_project()

        # Explicit chapter query
        body = {
            "model_type": "CHAT",
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_get_chapter_metadata",
                            "type": "function",
                            "function": {
                                "name": "get_chapter_metadata",
                                "arguments": '{"chap_id": 1}',
                            },
                        }
                    ],
                }
            ],
        }

        response = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.json()["appended_messages"][0]["content"])
        self.assertEqual(payload["chapter"]["title"], "Intro")

        # Current chapter query
        body_current = {
            "model_type": "CHAT",
            "active_chapter_id": 1,
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_get_chapter_metadata_current",
                            "type": "function",
                            "function": {
                                "name": "get_chapter_metadata",
                                "arguments": '{"current": true}',
                            },
                        }
                    ],
                }
            ],
        }

        response_current = self.client.post("/api/v1/chat/tools", json=body_current)
        self.assertEqual(response_current.status_code, 200)
        payload_current = json.loads(
            response_current.json()["appended_messages"][0]["content"]
        )
        self.assertEqual(payload_current["chapter"]["title"], "Intro")

    def test_chat_tool_batch_can_undo_and_redo(self):
        """Tool-call batches should expose batch_id and support undo/redo endpoints."""
        self._bootstrap_project()
        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        original = chapter_file.read_text(encoding="utf-8")

        body = {
            "model_name": None,
            "model_type": "EDITING",
            "messages": [
                {"role": "user", "content": "Update chapter"},
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call_batch_1",
                            "type": "function",
                            "function": {
                                "name": "write_chapter_content",
                                "arguments": '{"chap_id":1,"content":"Batch updated content"}',
                            },
                        }
                    ],
                },
            ],
            "active_chapter_id": 1,
        }

        r = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        batch = (data.get("mutations") or {}).get("tool_batch") or {}
        batch_id = batch.get("batch_id")
        self.assertTrue(batch_id)
        self.assertEqual(
            chapter_file.read_text(encoding="utf-8"), "Batch updated content"
        )

        r_undo = self.client.post(f"/api/v1/chat/tools/undo/{batch_id}")
        self.assertEqual(r_undo.status_code, 200, r_undo.text)
        self.assertEqual(chapter_file.read_text(encoding="utf-8"), original)

        r_redo = self.client.post(f"/api/v1/chat/tools/redo/{batch_id}")
        self.assertEqual(r_redo.status_code, 200, r_redo.text)
        self.assertEqual(
            chapter_file.read_text(encoding="utf-8"), "Batch updated content"
        )

    def test_call_editing_assistant_propagates_prose_mutations_and_ui_refreshes(self):
        self._bootstrap_project()
        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        before_text = chapter_file.read_text(encoding="utf-8")

        first_llm = {
            "content": "",
            "tool_calls": [
                {
                    "id": "nested_1",
                    "type": "function",
                    "function": {
                        "name": "write_chapter_content",
                        "arguments": json.dumps(
                            {
                                "chap_id": 1,
                                "content": "Edited chapter content",
                            }
                        ),
                    },
                }
            ],
        }
        second_llm = {"content": "Done.", "tool_calls": []}

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.side_effect = [first_llm, second_llm]
            data = self._post_single_tool(
                "call_editing_assistant",
                {"task": "Update title and summary"},
            )

        self.assertTrue((data.get("mutations") or {}).get("story_changed"))
        batch = (data.get("mutations") or {}).get("tool_batch") or {}
        batch_id = batch.get("batch_id")
        self.assertTrue(batch_id)

        self.assertEqual(
            chapter_file.read_text(encoding="utf-8"), "Edited chapter content"
        )

        # Verify the data is visible via the same project-select endpoint the UI refresh path uses.
        selected = self.client.post("/api/v1/projects/select", json={"name": "demo"})
        self.assertEqual(selected.status_code, 200, selected.text)
        selected_story = (selected.json() or {}).get("story") or {}
        self.assertEqual(selected_story.get("chapters", [])[0].get("title"), "Intro")

        undo = self.client.post(f"/api/v1/chat/tools/undo/{batch_id}")
        self.assertEqual(undo.status_code, 200, undo.text)
        self.assertEqual(chapter_file.read_text(encoding="utf-8"), before_text)

        redo = self.client.post(f"/api/v1/chat/tools/redo/{batch_id}")
        self.assertEqual(redo.status_code, 200, redo.text)
        self.assertEqual(
            chapter_file.read_text(encoding="utf-8"), "Edited chapter content"
        )

    def test_call_editing_assistant_collects_metadata_recommendations(self):
        self._bootstrap_project()

        first_llm = {
            "content": "",
            "tool_calls": [
                {
                    "id": "nested_1",
                    "type": "function",
                    "function": {
                        "name": "recommend_metadata_updates",
                        "arguments": json.dumps(
                            {
                                "story_summary": "Sharper story summary",
                                "chapter_updates": [
                                    {
                                        "chap_id": 1,
                                        "summary": "Introduce the heirloom map earlier.",
                                    }
                                ],
                                "rationale": "The opening chapter needs clearer setup.",
                            }
                        ),
                    },
                }
            ],
        }
        second_llm = {"content": "Done.", "tool_calls": []}

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.side_effect = [first_llm, second_llm]
            data = self._post_single_tool(
                "call_editing_assistant",
                {"task": "Review chapter 1 for setup issues"},
            )

        payload = json.loads(
            (data.get("appended_messages") or [])[0].get("content") or "{}"
        )
        self.assertFalse((data.get("mutations") or {}).get("story_changed"))
        self.assertEqual(payload.get("response"), "Done.")
        self.assertEqual(len(payload.get("recommended_updates") or []), 1)
        self.assertEqual(
            payload["recommended_updates"][0].get("story_summary"),
            "Sharper story summary",
        )

    def test_image_mutation_tools_emit_story_changed_and_support_undo_redo(self):
        self._bootstrap_project()
        pdir = self.projects_root / "demo"
        images_dir = pdir / "images"
        images_dir.mkdir(parents=True, exist_ok=True)
        (images_dir / "sample.png").write_bytes(b"\x89PNG\r\n\x1a\n")

        metadata_file = images_dir / "metadata.json"
        before_meta = (
            metadata_file.read_text(encoding="utf-8") if metadata_file.exists() else ""
        )

        placeholder_data = self._post_single_tool(
            "create_image_placeholder",
            {"description": "Castle on a cliff", "title": "Castle"},
        )
        self.assertTrue((placeholder_data.get("mutations") or {}).get("story_changed"))
        placeholder_batch = (placeholder_data.get("mutations") or {}).get(
            "tool_batch"
        ) or {}
        self.assertTrue(placeholder_batch.get("batch_id"))

        placeholder_msg = (placeholder_data.get("appended_messages") or [])[0]
        placeholder_payload = json.loads(placeholder_msg.get("content") or "{}")
        placeholder_name = placeholder_payload.get("filename")
        self.assertTrue(placeholder_name)

        set_meta_data = self._post_single_tool(
            "set_image_metadata",
            {
                "filename": placeholder_name,
                "title": "Castle at Dawn",
                "description": "Golden light over stone walls",
            },
        )
        self.assertTrue((set_meta_data.get("mutations") or {}).get("story_changed"))

        with patch(
            "augmentedquill.services.chat.chat_tools.image_tools._tool_generate_image_description",
            new_callable=AsyncMock,
        ) as mock_desc:
            mock_desc.return_value = "A dramatic rocky coast with a lone fortress."
            gen_data = self._post_single_tool(
                "generate_image_description", {"filename": "sample.png"}
            )

        self.assertTrue((gen_data.get("mutations") or {}).get("story_changed"))
        gen_batch = (gen_data.get("mutations") or {}).get("tool_batch") or {}
        gen_batch_id = gen_batch.get("batch_id")
        self.assertTrue(gen_batch_id)
        self.assertTrue(metadata_file.exists())

        after_meta = metadata_file.read_text(encoding="utf-8")
        self.assertNotEqual(after_meta, before_meta)

        undo = self.client.post(f"/api/v1/chat/tools/undo/{gen_batch_id}")
        self.assertEqual(undo.status_code, 200, undo.text)

        redo = self.client.post(f"/api/v1/chat/tools/redo/{gen_batch_id}")
        self.assertEqual(redo.status_code, 200, redo.text)

    def test_call_writing_llm_is_read_only_in_mutation_pipeline(self):
        self._bootstrap_project()
        # Ensure a conflict exists to satisfy conflict-first guard policy.
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {
                        "id": "c1",
                        "description": "Establish protagonist's personal stakes",
                        "resolution": "Confront antagonistic force",
                    }
                ]
            },
        )

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {"content": "Rewritten prose", "tool_calls": []}
            data = self._post_single_tool(
                "call_writing_llm",
                {"instruction": "Rewrite", "context": "Original text"},
            )

        sent_messages = mock_chat.await_args.kwargs["messages"]
        self.assertIn("You are a skilled novelist.", sent_messages[0]["content"])
        self.assertIn("Task for this request:", sent_messages[1]["content"])
        self.assertIn("Context materials:", sent_messages[1]["content"])
        self.assertNotIn(
            "Assume no prior knowledge of this application",
            sent_messages[0]["content"],
        )
        self.assertNotIn(
            "All context you may rely on for this request is below",
            sent_messages[1]["content"],
        )

        mutations = data.get("mutations") or {}
        self.assertFalse(mutations.get("story_changed"))
        self.assertIsNone(mutations.get("tool_batch"))
        appended = data.get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        payload = json.loads(appended[0].get("content") or "{}")
        self.assertEqual(payload.get("generated_text"), "Rewritten prose")

    def test_call_writing_llm_requires_conflict_metadata(self):
        self._bootstrap_project()
        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {"content": "Some prose"}
            data = self._post_single_tool(
                "call_writing_llm",
                {"instruction": "Write an opening scene", "context": ""},
            )

        appended = data.get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        result = json.loads(appended[0].get("content") or "{}")
        self.assertIn("error", result)
        self.assertIn("conflicts", result.get("error", ""))

    def test_call_writing_llm_append_mode_with_chap_id(self):
        """Test write_mode='append' appends generated text to chapter."""
        self._bootstrap_project()
        # Add conflict requirement
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {
                        "id": "c1",
                        "description": "Test conflict",
                        "resolution": "Test resolution",
                    }
                ]
            },
        )

        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        original_content = chapter_file.read_text(encoding="utf-8")

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {
                "content": "New generated content.",
                "tool_calls": [],
            }
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Continue the story",
                    "context": "Current text",
                    "write_mode": "append",
                    "chap_id": 1,
                },
            )

        # Verify content was appended
        new_content = chapter_file.read_text(encoding="utf-8")
        self.assertEqual(new_content, original_content + "\nNew generated content.")

        # Verify response structure
        appended = data.get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        result = json.loads(appended[0].get("content") or "{}")
        self.assertEqual(result.get("generated_text"), "New generated content.")
        self.assertTrue(result.get("written"))
        self.assertEqual(result.get("write_mode"), "append")
        self.assertEqual(result.get("chap_id"), 1)

        # Verify mutations for undo/redo support
        mutations = data.get("mutations") or {}
        self.assertTrue(mutations.get("story_changed"))

    def test_call_writing_llm_append_mode_short_story_auto_detect(self):
        """Test write_mode='append' auto-detects chap_id=1 for short-story projects."""
        self._bootstrap_project()

        # Change to short-story project
        pdir = self.projects_root / "demo"
        story_path = pdir / "story.json"
        story_data = json.loads(story_path.read_text(encoding="utf-8"))
        story_data["project_type"] = "short-story"
        story_data["content_file"] = "content.md"
        story_data["conflicts"] = [
            {
                "id": "c1",
                "description": "Main conflict",
                "resolution": "Resolution path",
            }
        ]
        # Remove chapters for short-story
        story_data.pop("chapters", None)
        story_path.write_text(json.dumps(story_data), encoding="utf-8")

        # Create content file
        content_file = pdir / "content.md"
        content_file.write_text("Original short story content.", encoding="utf-8")

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {
                "content": " Continuation text.",
                "tool_calls": [],
            }
            # Omit chap_id - should auto-detect for short-story
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Continue",
                    "context": "Context",
                    "write_mode": "append",
                },
            )

        # Verify content was appended
        new_content = content_file.read_text(encoding="utf-8")
        self.assertEqual(
            new_content, "Original short story content.\n Continuation text."
        )

        # Verify response has chap_id=1 set automatically
        appended = data.get("appended_messages") or []
        result = json.loads(appended[0].get("content") or "{}")
        self.assertTrue(result.get("written"))
        self.assertEqual(result.get("chap_id"), 1)

    def test_call_writing_llm_replace_mode(self):
        """Test write_mode='replace' overwrites entire chapter."""
        self._bootstrap_project()
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {"id": "c1", "description": "Conflict", "resolution": "Resolution"}
                ]
            },
        )

        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {
                "content": "Completely new chapter content.",
                "tool_calls": [],
            }
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Rewrite entirely",
                    "context": "Old content",
                    "write_mode": "replace",
                    "chap_id": 1,
                },
            )

        # Verify content was replaced (not appended)
        new_content = chapter_file.read_text(encoding="utf-8")
        self.assertEqual(new_content, "Completely new chapter content.")
        self.assertNotIn("Alpha", new_content)

        # Verify response
        appended = data.get("appended_messages") or []
        result = json.loads(appended[0].get("content") or "{}")
        self.assertEqual(result.get("write_mode"), "replace")
        self.assertTrue(result.get("written"))

        # Verify mutations
        mutations = data.get("mutations") or {}
        self.assertTrue(mutations.get("story_changed"))

    def test_call_writing_llm_insert_at_marker_mode(self):
        """Test write_mode='insert_at_marker' inserts at ~~~ marker."""
        self._bootstrap_project()
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {"id": "c1", "description": "Conflict", "resolution": "Resolution"}
                ]
            },
        )

        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        chapter_file.write_text(
            "Beginning of chapter.\n~~~\nEnd of chapter.", encoding="utf-8"
        )

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {
                "content": "Inserted middle section.",
                "tool_calls": [],
            }
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Write middle section",
                    "context": "Context",
                    "write_mode": "insert_at_marker",
                    "chap_id": 1,
                },
            )

        # Verify content was inserted at marker (marker replaced)
        new_content = chapter_file.read_text(encoding="utf-8")
        self.assertEqual(
            new_content,
            "Beginning of chapter.\nInserted middle section.\nEnd of chapter.",
        )
        self.assertNotIn("~~~", new_content)

        # Verify response
        appended = data.get("appended_messages") or []
        result = json.loads(appended[0].get("content") or "{}")
        self.assertEqual(result.get("write_mode"), "insert_at_marker")
        self.assertTrue(result.get("written"))

    def test_call_writing_llm_insert_at_marker_missing_marker_error(self):
        """Test write_mode='insert_at_marker' fails gracefully when marker not found."""
        self._bootstrap_project()
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {"id": "c1", "description": "Conflict", "resolution": "Resolution"}
                ]
            },
        )

        # Chapter without marker
        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        chapter_file.write_text("No marker here.", encoding="utf-8")

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {"content": "Text to insert", "tool_calls": []}
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Insert",
                    "context": "Context",
                    "write_mode": "insert_at_marker",
                    "chap_id": 1,
                },
            )

        # Verify error message
        appended = data.get("appended_messages") or []
        result = json.loads(appended[0].get("content") or "{}")
        self.assertIn("error", result)
        self.assertIn("~~~", result.get("error", ""))
        self.assertIn("not found", result.get("error", ""))

        # Verify content unchanged
        content = chapter_file.read_text(encoding="utf-8")
        self.assertEqual(content, "No marker here.")

    def test_call_writing_llm_invalid_write_mode_error(self):
        """Test invalid write_mode value returns clear error."""
        self._bootstrap_project()
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {"id": "c1", "description": "Conflict", "resolution": "Resolution"}
                ]
            },
        )

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {"content": "Generated text", "tool_calls": []}
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Write",
                    "context": "Context",
                    "write_mode": "invalid_mode",
                    "chap_id": 1,
                },
            )

        # Verify error message
        appended = data.get("appended_messages") or []
        result = json.loads(appended[0].get("content") or "{}")
        self.assertIn("error", result)
        error_msg = result.get("error", "")
        self.assertIn("Invalid write_mode", error_msg)
        self.assertIn("invalid_mode", error_msg)
        self.assertIn("append", error_msg)
        self.assertIn("replace", error_msg)
        self.assertIn("insert_at_marker", error_msg)

    def test_call_writing_llm_missing_chap_id_for_novel_error(self):
        """Test write_mode set without chap_id for chapter-based project returns error."""
        self._bootstrap_project()
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {"id": "c1", "description": "Conflict", "resolution": "Resolution"}
                ]
            },
        )

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {"content": "Generated text", "tool_calls": []}
            # Novel project, write_mode set, but no chap_id
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Write",
                    "context": "Context",
                    "write_mode": "append",
                    # No chap_id provided
                },
            )

        # Verify error message is clear
        appended = data.get("appended_messages") or []
        result = json.loads(appended[0].get("content") or "{}")
        self.assertIn("error", result)
        error_msg = result.get("error", "")
        self.assertIn("chap_id is required", error_msg)
        self.assertIn("chapter-based", error_msg)
        self.assertIn("get_project_overview", error_msg)

    def test_call_writing_llm_undo_redo_support(self):
        """Test write_mode operations support undo/redo via tool batch."""
        self._bootstrap_project()
        self._post_single_tool(
            "update_story_metadata",
            {
                "conflicts": [
                    {"id": "c1", "description": "Conflict", "resolution": "Resolution"}
                ]
            },
        )

        chapter_file = self.projects_root / "demo" / "chapters" / "0001.txt"
        original_content = chapter_file.read_text(encoding="utf-8")

        with (
            patch(
                "augmentedquill.services.llm.llm.resolve_openai_credentials",
                return_value=("http://localhost:11434/v1", None, "dummy", 30, "dummy"),
            ),
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                new_callable=AsyncMock,
            ) as mock_chat,
        ):
            mock_chat.return_value = {"content": " Appended text.", "tool_calls": []}
            data = self._post_single_tool(
                "call_writing_llm",
                {
                    "instruction": "Continue",
                    "context": "Context",
                    "write_mode": "append",
                    "chap_id": 1,
                },
            )

        # Verify content was written
        modified_content = chapter_file.read_text(encoding="utf-8")
        self.assertNotEqual(modified_content, original_content)

        # Get batch_id for undo/redo
        mutations = data.get("mutations") or {}
        batch = mutations.get("tool_batch") or {}
        batch_id = batch.get("batch_id")
        self.assertTrue(batch_id, "Expected batch_id for undo/redo support")

        # Test undo
        undo = self.client.post(f"/api/v1/chat/tools/undo/{batch_id}")
        self.assertEqual(undo.status_code, 200, undo.text)
        undone_content = chapter_file.read_text(encoding="utf-8")
        self.assertEqual(undone_content, original_content)

        # Test redo
        redo = self.client.post(f"/api/v1/chat/tools/redo/{batch_id}")
        self.assertEqual(redo.status_code, 200, redo.text)
        redone_content = chapter_file.read_text(encoding="utf-8")
        self.assertEqual(redone_content, modified_content)

    def test_chat_sourcebook_create_is_visible_in_project_select_payload(self):
        self._bootstrap_project()
        data = self._post_single_tool(
            "create_sourcebook_entry",
            {
                "name": "Ava",
                "description": "A strategist in the court",
                "category": "character",
                "synonyms": ["Lady Ava"],
            },
        )

        mutations = data.get("mutations") or {}
        self.assertTrue(mutations.get("story_changed"))

        selected = self.client.post("/api/v1/projects/select", json={"name": "demo"})
        self.assertEqual(selected.status_code, 200, selected.text)
        story = (selected.json() or {}).get("story") or {}
        sourcebook = story.get("sourcebook") or []
        self.assertTrue(
            any(entry.get("name") == "Ava" for entry in sourcebook),
            f"Expected 'Ava' entry in sourcebook payload, got: {sourcebook}",
        )

    def test_reorder_chapters_not_an_llm_tool(self):
        """reorder_chapters was removed from the LLM tool registry; only invocable via the REST API."""
        from augmentedquill.services.chat.chat_tool_decorator import (
            ensure_tool_registry_loaded,
            get_registered_tool_schemas,
        )

        ensure_tool_registry_loaded()
        names = {s["function"]["name"] for s in get_registered_tool_schemas()}
        self.assertNotIn("reorder_chapters", names)
        self.assertNotIn("reorder_books", names)

    def test_reorder_chapters_invalid_ids_returns_error(self):
        """Calling unknown tool through the /chat/tools endpoint returns an error, not a crash."""
        self._bootstrap_project()
        # reorder_chapters is no longer an LLM tool; the endpoint returns a structured error.
        data = self._post_single_tool(
            "reorder_chapters",
            {"chapter_ids": [99, 100]},
        )
        appended = data.get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        content = json.loads(appended[0]["content"])
        self.assertIn("error", content)

    def test_list_images_returns_empty_without_images(self):
        """list_images tool works even when the project images dir is empty."""
        self._bootstrap_project()
        data = self._post_single_tool("list_images", {})
        appended = data.get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        content = json.loads(appended[0]["content"])
        # list_images returns a bare list of image entries
        self.assertIsInstance(content, list)
