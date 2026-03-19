# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Validates all LLM-callable chat tools for successful execution and graceful handling of malformed and invalid tool-call inputs."""

import json
import os
import tempfile
import uuid
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from fastapi.testclient import TestClient

import augmentedquill.main as main
from augmentedquill.services.chat.chat_tools_schema import get_story_tools
from augmentedquill.services.chat.chat_tool_decorator import get_registered_tool_schemas
from augmentedquill.services.projects.projects import select_project
from augmentedquill.services.sourcebook.sourcebook_helpers import (
    sourcebook_create_entry,
)


class ChatToolContractsTest(TestCase):
    _SPECIAL_CASE_MUTATION_TOOLS = {
        # Covered with nested-tool-call behavior assertions in test_chat_tools.py
        "call_editing_assistant",
    }

    _READ_ONLY_TOOLS = {
        "call_writing_llm",
        "get_book_metadata",
        "get_chapter_content",
        "get_chapter_heading",
        "get_chapter_metadata",
        "get_chapter_summaries",
        "get_chapter_summary",
        "get_project_overview",
        "get_sourcebook_entry",
        "get_story_metadata",
        "get_story_summary",
        "get_story_tags",
        "list_images",
        "list_projects",
        "read_book_content",
        "read_story_content",
        "recommend_metadata_updates",
        "search_sourcebook",
    }

    _EDITING_ONLY_TOOLS = {
        "replace_text_in_chapter",
        "apply_chapter_replacements",
        "insert_text_at_marker",
        "recommend_metadata_updates",
        "write_chapter_content",
    }

    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)

        self.projects_root = Path(self.td.name) / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = Path(self.td.name) / "projects.json"

        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)

        self.client = TestClient(main.app)
        self._bootstrap_project()

    def tearDown(self):
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    def _bootstrap_project(self):
        ok, msg = select_project("tool_contracts")
        self.assertTrue(ok, msg)

        pdir = self.projects_root / "tool_contracts"
        self.book_id = str(uuid.uuid4())
        series_chapters_dir = pdir / "books" / self.book_id / "chapters"
        series_chapters_dir.mkdir(parents=True, exist_ok=True)
        (series_chapters_dir / "0001.txt").write_text(
            "Initial chapter one text.", encoding="utf-8"
        )
        (series_chapters_dir / "0002.txt").write_text(
            "Initial chapter two text.", encoding="utf-8"
        )

        (pdir / "books" / self.book_id / "content.md").write_text(
            "Initial book content.", encoding="utf-8"
        )

        (pdir / "images").mkdir(parents=True, exist_ok=True)
        (pdir / "images" / "sample.png").write_bytes(b"\x89PNG\r\n\x1a\n")

        story = {
            "metadata": {"version": 2},
            "project_title": "Tool Contracts",
            "format": "markdown",
            "project_type": "series",
            "chapters": [
                {"title": "Chapter One", "summary": "Summary 1"},
                {"title": "Chapter Two", "summary": "Summary 2"},
            ],
            "books": [
                {
                    "id": self.book_id,
                    "title": "Book One",
                    "summary": "Book summary",
                    "notes": "Book notes",
                    "chapters": [
                        {"id": 1, "title": "Chapter One", "summary": "Summary 1"}
                    ],
                }
            ],
            "llm_prefs": {"temperature": 0.7, "max_tokens": 256},
            "story_summary": "Initial story summary",
            "tags": ["seed"],
        }
        (pdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
        (pdir / "story_content.md").write_text(
            "Initial story content.", encoding="utf-8"
        )

        sourcebook_create_entry(
            name="Hero Entry",
            description="A known sourcebook character",
            category="character",
            synonyms=["The Hero"],
        )

    def _tool_names(self):
        return [t["function"]["name"] for t in get_story_tools()]

    def _call_tool(self, name: str, args, model_type: str = "CHAT"):
        if isinstance(args, str):
            arguments = args
        else:
            arguments = json.dumps(args)

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
                            "function": {"name": name, "arguments": arguments},
                        }
                    ],
                }
            ],
            "active_chapter_id": 1,
        }
        response = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        appended = payload.get("appended_messages") or []
        self.assertEqual(len(appended), 1, payload)
        msg = appended[0]
        self.assertEqual(msg.get("name"), name)
        self.assertEqual(msg.get("role"), "tool")
        content = json.loads(msg.get("content") or "{}")
        self.assertIsInstance(content, (dict, list, str, int, float, bool, type(None)))
        return content

    def _call_tool_with_payload(self, name: str, args, model_type: str = "CHAT"):
        if isinstance(args, str):
            arguments = args
        else:
            arguments = json.dumps(args)

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
                            "function": {"name": name, "arguments": arguments},
                        }
                    ],
                }
            ],
            "active_chapter_id": 1,
        }
        response = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        return payload, json.loads(
            (payload.get("appended_messages") or [{}])[0].get("content") or "{}"
        )

    def _tool_role_for_execution(self, tool_name: str) -> str:
        return "EDITING" if tool_name in self._EDITING_ONLY_TOOLS else "CHAT"

    def _base_valid_args(self, tool_name: str):
        args = {
            "chap_id": 1,
            "book_id": self.book_id,
            "chapter_ids": [1],
            "book_ids": [self.book_id],
            "filename": "sample.png",
            "name_or_id": "Hero Entry",
            "name": "tmp_project_for_delete",
            "description": "Tool test description",
            "content": "Tool test content",
            "summary": "Tool test summary",
            "heading": "Tool test heading",
            "title": "Tool test title",
            "query": "Hero",
            "tags": ["tool", "test"],
            "project_type": "novel",
            "new_type": "series",
            "confirm": False,
            "mode": "update",
            "category": "character",
            "synonyms": ["Alias"],
        }

        if tool_name == "create_project":
            args["name"] = "tmp_project_for_delete"
            args["project_type"] = "series"
        if tool_name == "delete_project":
            args["name"] = "tmp_project_for_delete"
            args["confirm"] = False
        if tool_name == "delete_book":
            args["book_id"] = self.book_id
            args["confirm"] = False
        if tool_name == "create_sourcebook_entry":
            args["name"] = "Hero Entry 2"
            args["description"] = "Secondary sourcebook entry"
            args["category"] = "character"
            args["synonyms"] = ["Hero Alias"]
        if tool_name == "update_sourcebook_entry":
            args["name_or_id"] = "Hero Entry"
            args["description"] = "Updated sourcebook entry"
        if tool_name == "delete_sourcebook_entry":
            args["name_or_id"] = "Hero Entry"
        if tool_name == "delete_chapter":
            args["chap_id"] = 1
            args["confirm"] = False

        return args

    def _build_args_for_schema(self, tool_schema: dict, invalid: bool):
        fn = tool_schema["function"]
        tool_name = fn["name"]
        params = (fn.get("parameters") or {}).get("properties") or {}
        required = set((fn.get("parameters") or {}).get("required") or [])

        base = self._base_valid_args(tool_name)
        built = {}

        for key, prop in params.items():
            if key not in required:
                continue

            if key in base:
                built[key] = base[key]
                continue

            typ = prop.get("type")
            if typ == "integer":
                built[key] = 1
            elif typ == "number":
                built[key] = 1.0
            elif typ == "boolean":
                built[key] = True
            elif typ == "array":
                built[key] = []
            else:
                built[key] = "value"

        # Include select optional arguments that influence semantic behavior.
        if tool_name == "create_project":
            built["project_type"] = base["project_type"]
        if tool_name in {"delete_project", "delete_book", "delete_chapter"}:
            built["confirm"] = base["confirm"]

        if invalid:
            invalid_overrides = {
                "chap_id": 999999,
                "book_id": "missing-book-id",
                "chapter_ids": [999999],
                "book_ids": ["missing-book-id"],
                "filename": "does-not-exist.png",
                "name_or_id": "does-not-exist",
                "project_type": "invalid-project-type",
                "new_type": "invalid-project-type",
                "confirm": True,
            }
            for key, value in invalid_overrides.items():
                if key in built:
                    built[key] = value

        return built

    def _assert_invalid_parameters(self, tool_name: str, content):
        self.assertIsInstance(content, dict, f"Expected dict response for {tool_name}")
        self.assertEqual(
            content.get("error"),
            "Invalid parameters",
            f"Expected Invalid parameters for {tool_name}: {content}",
        )
        self.assertIsInstance(
            content.get("details"),
            list,
            f"Expected validation details list for {tool_name}: {content}",
        )

    def test_all_tools_handle_malformed_arguments_gracefully(self):
        for name in self._tool_names():
            content = self._call_tool(
                name,
                "{this is not valid json",
                model_type=self._tool_role_for_execution(name),
            )
            self.assertIsInstance(
                content, (dict, list, str, int, float, bool, type(None))
            )

    def test_all_tools_handle_invalid_content_gracefully(self):
        for tool_schema in get_story_tools():
            args = self._build_args_for_schema(tool_schema, invalid=True)
            tool_name = tool_schema["function"]["name"]
            content = self._call_tool(
                tool_name,
                args,
                model_type=self._tool_role_for_execution(tool_name),
            )
            # Contract: invalid semantic input must never crash tool execution.
            self.assertIsInstance(
                content, (dict, list, str, int, float, bool, type(None))
            )

    def test_all_tools_reject_unknown_argument_keys(self):
        for tool_schema in get_story_tools():
            tool_name = tool_schema["function"]["name"]
            args = self._build_args_for_schema(tool_schema, invalid=False)
            args["unexpected_key"] = "unexpected_value"
            content = self._call_tool(
                tool_name,
                args,
                model_type=self._tool_role_for_execution(tool_name),
            )
            self._assert_invalid_parameters(tool_name, content)

    def test_all_tools_reject_missing_required_keys(self):
        for tool_schema in get_story_tools():
            fn = tool_schema["function"]
            tool_name = fn["name"]
            required = (fn.get("parameters") or {}).get("required") or []
            if not required:
                continue

            args = self._build_args_for_schema(tool_schema, invalid=False)
            missing_key = required[0]
            self.assertIn(
                missing_key,
                args,
                f"Test harness failed to build required key {missing_key} for {tool_name}",
            )
            args.pop(missing_key)

            content = self._call_tool(
                tool_name,
                args,
                model_type=self._tool_role_for_execution(tool_name),
            )
            self._assert_invalid_parameters(tool_name, content)

    def test_get_project_overview_include_notes_contract(self):
        content = self._call_tool("get_project_overview", {"include_notes": True})
        self.assertIsInstance(content, dict)
        self.assertNotIn("Execution error", json.dumps(content))

        invalid = self._call_tool(
            "get_project_overview", {"include_notes": {"unexpected": True}}
        )
        self._assert_invalid_parameters("get_project_overview", invalid)

    def test_tool_registry_filters_by_model_role(self):
        writing_tools = {
            tool["function"]["name"]
            for tool in get_registered_tool_schemas(model_type="WRITING")
        }
        editing_tools = {
            tool["function"]["name"]
            for tool in get_registered_tool_schemas(model_type="EDITING")
        }
        chat_tools = {
            tool["function"]["name"]
            for tool in get_registered_tool_schemas(model_type="CHAT")
        }

        self.assertEqual(writing_tools, set())
        self.assertIn("call_editing_assistant", chat_tools)
        self.assertIn("update_story_metadata", chat_tools)
        self.assertNotIn("replace_text_in_chapter", chat_tools)
        self.assertIn("replace_text_in_chapter", editing_tools)
        self.assertIn("recommend_metadata_updates", editing_tools)
        self.assertNotIn("update_story_metadata", editing_tools)
        self.assertNotIn("create_sourcebook_entry", editing_tools)

    def test_project_tool_descriptions_cover_all_project_types(self):
        schemas = {
            tool["function"]["name"]: tool["function"]
            for tool in get_registered_tool_schemas(model_type="CHAT")
        }

        self.assertIn(
            "short story",
            schemas["get_project_overview"]["description"].lower(),
        )
        self.assertIn("short-story", schemas["create_project"]["description"])
        self.assertIn(
            "short-story",
            schemas["change_project_type"]["description"],
        )

    def test_tools_reject_wrong_model_role(self):
        content = self._call_tool(
            "update_story_metadata",
            {"title": "Should fail"},
            model_type="EDITING",
        )
        self.assertEqual(content.get("error"), "Tool unavailable for model role")

        content = self._call_tool(
            "recommend_metadata_updates",
            {"story_summary": "Suggested only"},
            model_type="CHAT",
        )
        self.assertEqual(content.get("error"), "Tool unavailable for model role")

    def test_all_tools_have_successful_execution_path(self):
        async def fake_generate_summary(**kwargs):
            return {"summary": "AI generated chapter summary", "ok": True}

        async def fake_write_chapter(**kwargs):
            return {"content": "AI generated chapter", "ok": True}

        async def fake_continue_chapter(**kwargs):
            return {"content": "AI chapter continuation", "ok": True}

        async def fake_story_summary(**kwargs):
            return {"story_summary": "AI story summary", "ok": True}

        async def fake_image_description(filename: str, payload: dict):
            return "Generated image description"

        async def fake_unified_chat_complete(**kwargs):
            return {"content": "Mocked WRITING response", "ok": True}

        with (
            patch(
                "augmentedquill.services.llm.llm.unified_chat_complete",
                side_effect=fake_unified_chat_complete,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.chapter_tools.generate_chapter_summary",
                side_effect=fake_generate_summary,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.chapter_tools.write_chapter_from_summary",
                side_effect=fake_write_chapter,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.chapter_tools.continue_chapter_from_summary",
                side_effect=fake_continue_chapter,
            ),
            patch(
                "augmentedquill.services.story.story_generation_ops.generate_story_summary",
                side_effect=fake_story_summary,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.image_tools._tool_generate_image_description",
                side_effect=fake_image_description,
            ),
        ):
            for tool_schema in get_story_tools():
                ok, msg = select_project("tool_contracts")
                self.assertTrue(ok, msg)

                name = tool_schema["function"]["name"]
                args = self._build_args_for_schema(tool_schema, invalid=False)
                content = self._call_tool(
                    name,
                    args,
                    model_type=self._tool_role_for_execution(name),
                )

                self.assertNotIn("Execution error", json.dumps(content))
                self.assertNotIn("Invalid parameters", json.dumps(content))

    def test_all_project_mutation_tools_emit_story_changed_and_batch(self):
        expected_mutation_tools = {
            "create_project",
            "delete_project",
            "update_story_metadata",
            "write_story_content",
            "update_book_metadata",
            "write_book_content",
            "set_story_tags",
            "sync_story_summary",
            "write_story_summary",
            "update_chapter_metadata",
            "write_chapter_content",
            "replace_text_in_chapter",
            "apply_chapter_replacements",
            "insert_text_at_marker",
            "write_chapter_summary",
            "sync_summary",
            "write_chapter",
            "continue_chapter",
            "create_new_chapter",
            "write_chapter_heading",
            "delete_chapter",
            "reorder_chapters",
            "reorder_books",
            "delete_book",
            "create_new_book",
            "change_project_type",
            "create_sourcebook_entry",
            "update_sourcebook_entry",
            "delete_sourcebook_entry",
            "generate_image_description",
            "create_image_placeholder",
            "set_image_metadata",
            "read_scratchpad",
            "write_scratchpad",
        }

        tool_names = set(self._tool_names())
        covered_tools = (
            expected_mutation_tools
            | self._READ_ONLY_TOOLS
            | self._SPECIAL_CASE_MUTATION_TOOLS
        )
        self.assertEqual(
            covered_tools,
            tool_names,
            f"Tool classification drift detected. Missing in tests: {sorted(tool_names - covered_tools)}; stale in tests: {sorted(covered_tools - tool_names)}",
        )
        self.assertTrue(
            expected_mutation_tools.issubset(tool_names),
            f"Missing tool coverage: {sorted(expected_mutation_tools - tool_names)}",
        )

        async def fake_generate_summary(**kwargs):
            return {"summary": "AI generated chapter summary", "ok": True}

        async def fake_write_chapter(**kwargs):
            return {"content": "AI generated chapter", "ok": True}

        async def fake_continue_chapter(**kwargs):
            return {"content": "AI chapter continuation", "ok": True}

        async def fake_story_summary(**kwargs):
            return {"story_summary": "AI story summary", "ok": True}

        async def fake_image_description(filename: str, payload: dict):
            return "Generated image description"

        mutation_calls = [
            (
                "create_project",
                {"name": "chat_tools_mutation_tmp", "project_type": "novel"},
            ),
            ("update_story_metadata", {"title": "Mutated Title"}),
            ("write_story_content", {"content": "Mutated story content"}),
            (
                "update_book_metadata",
                {"book_id": self.book_id, "title": "Mutated Book Title"},
            ),
            (
                "write_book_content",
                {"book_id": self.book_id, "content": "Mutated book content"},
            ),
            ("set_story_tags", {"tags": ["mutated", "tag"]}),
            ("sync_story_summary", {"mode": "update"}),
            ("write_story_summary", {"summary": "Mutated story summary"}),
            (
                "update_chapter_metadata",
                {"chap_id": 1, "title": "Mutated Chapter Title"},
            ),
            ("write_chapter_content", {"chap_id": 1, "content": "Mutated chapter"}),
            (
                "replace_text_in_chapter",
                {
                    "chap_id": 1,
                    "old_text": "Mutated chapter",
                    "new_text": "Mutated chapter replaced",
                },
            ),
            ("write_chapter_summary", {"chap_id": 1, "summary": "Mutated summary"}),
            ("sync_summary", {"chap_id": 1, "mode": "update"}),
            ("write_chapter", {"chap_id": 1}),
            ("continue_chapter", {"chap_id": 1}),
            ("create_new_chapter", {"title": "Extra", "book_id": self.book_id}),
            (
                "write_chapter_heading",
                {"chap_id": 1, "heading": "Mutated Heading"},
            ),
            ("delete_chapter", {"chap_id": 2, "confirm": True}),
            ("reorder_chapters", {"chapter_ids": [1], "book_id": self.book_id}),
            (
                "create_sourcebook_entry",
                {
                    "name": "Mutation Entry",
                    "description": "created by mutation test",
                    "category": "character",
                },
            ),
            (
                "update_sourcebook_entry",
                {
                    "name_or_id": "Mutation Entry",
                    "description": "updated by mutation test",
                },
            ),
            ("delete_sourcebook_entry", {"name_or_id": "Mutation Entry"}),
            (
                "create_image_placeholder",
                {"description": "placeholder mutation", "title": "ph"},
            ),
            (
                "set_image_metadata",
                {
                    "filename": "sample.png",
                    "title": "mutated",
                    "description": "mutated",
                },
            ),
            ("generate_image_description", {"filename": "sample.png"}),
            ("delete_project", {"name": "chat_tools_mutation_tmp", "confirm": True}),
        ]

        with (
            patch(
                "augmentedquill.services.chat.chat_tools.chapter_tools.generate_chapter_summary",
                side_effect=fake_generate_summary,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.chapter_tools.write_chapter_from_summary",
                side_effect=fake_write_chapter,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.chapter_tools.continue_chapter_from_summary",
                side_effect=fake_continue_chapter,
            ),
            patch(
                "augmentedquill.services.story.story_generation_ops.generate_story_summary",
                side_effect=fake_story_summary,
            ),
            patch(
                "augmentedquill.services.chat.chat_tools.image_tools._tool_generate_image_description",
                side_effect=fake_image_description,
            ),
        ):
            for name, args in mutation_calls:
                ok, msg = select_project("tool_contracts")
                self.assertTrue(ok, msg)
                payload, _content = self._call_tool_with_payload(
                    name,
                    args,
                    model_type=self._tool_role_for_execution(name),
                )
                mutations = payload.get("mutations") or {}
                self.assertTrue(
                    mutations.get("story_changed"),
                    f"Expected story_changed for tool {name}: {payload}",
                )
                batch = mutations.get("tool_batch") or {}
                self.assertTrue(
                    batch.get("batch_id"),
                    f"Expected tool_batch batch_id for tool {name}: {payload}",
                )

            create_book_payload, create_book_content = self._call_tool_with_payload(
                "create_new_book", {"title": "Book Two"}, model_type="CHAT"
            )
            self.assertTrue(
                (create_book_payload.get("mutations") or {}).get("story_changed")
            )
            created_book_id = create_book_content.get("book_id")
            self.assertTrue(created_book_id)

            reorder_payload, _ = self._call_tool_with_payload(
                "reorder_books",
                {"book_ids": [created_book_id, self.book_id]},
                model_type="CHAT",
            )
            self.assertTrue(
                (reorder_payload.get("mutations") or {}).get("story_changed")
            )

            delete_payload, _ = self._call_tool_with_payload(
                "delete_book",
                {"book_id": created_book_id, "confirm": True},
                model_type="CHAT",
            )
            self.assertTrue(
                (delete_payload.get("mutations") or {}).get("story_changed")
            )

            change_payload, _ = self._call_tool_with_payload(
                "change_project_type", {"new_type": "novel"}, model_type="CHAT"
            )
            self.assertTrue(
                (change_payload.get("mutations") or {}).get("story_changed")
            )
