# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for sourcebook search refinement logic."""

import os
import tempfile
import json
from pathlib import Path
from unittest import TestCase
from fastapi.testclient import TestClient

from augmentedquill.main import app
from augmentedquill.services.projects.projects import select_project
from augmentedquill.services.sourcebook.sourcebook_helpers import (
    sourcebook_create_entry,
)


class SourcebookSearchRefinementTest(TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.projects_root = Path(self.td.name) / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = Path(self.td.name) / "projects.json"
        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)

        self.client = TestClient(app)
        ok, msg = select_project("test_sb")
        self.assertTrue(ok, msg)

        # Create some entries
        sourcebook_create_entry(
            "Alaric", "A brave knight.", "Character", synonyms=["Knight of the Rose"]
        )
        sourcebook_create_entry("Alaric's Sword", "A sharp blade.", "Item")
        sourcebook_create_entry("Rose Castle", "Where Alaric lives.", "Location")

    def tearDown(self):
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    def _call_search_sourcebook(self, query: str):
        body = {
            "model_type": "CHAT",
            "messages": [
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "c1",
                            "type": "function",
                            "function": {
                                "name": "search_sourcebook",
                                "arguments": json.dumps({"query": query}),
                            },
                        }
                    ],
                }
            ],
        }
        response = self.client.post("/api/v1/chat/tools", json=body)
        self.assertEqual(response.status_code, 200)
        appended = response.json().get("appended_messages") or []
        self.assertEqual(len(appended), 1)
        return json.loads(appended[0]["content"])

    def test_search_sourcebook_direct_match_name(self):
        """Test that a direct name match returns only that entry with others as suggestions."""
        content = self._call_search_sourcebook("Alaric")

        # Check that it's the refined format
        self.assertIn("entry", content)
        self.assertEqual(content["entry"]["name"], "Alaric")
        self.assertIn("other_matches_found", content)
        # Should include others that match query (at least "Alaric's Sword" and "Rose Castle" search in description/name)
        self.assertIn("Alaric's Sword", content["other_matches_found"])
        self.assertIn("Rose Castle", content["other_matches_found"])
        self.assertIn("instruction", content)

    def test_search_sourcebook_direct_match_synonym(self):
        """Test that a direct synonym match also uses the same refinement."""
        content = self._call_search_sourcebook("Knight of the Rose")

        self.assertIn("entry", content)
        self.assertEqual(content["entry"]["name"], "Alaric")
        # Should NOT be in list format if it matched a synonym directly
        self.assertIsInstance(content, dict)

    def test_search_sourcebook_partial_matches_only(self):
        """Test that if there is NO direct match, it still returns the full list."""
        # "Rose" matches:
        # 1. Alaric (synonym: Knight of the Rose)
        # 2. Rose Castle (name: Rose Castle)
        # Both are partial matches for the query "Rose"
        content = self._call_search_sourcebook("Rose")

        # Should return a list of matches
        self.assertIsInstance(content, list)
        self.assertEqual(len(content), 2)
        names = [e["name"] for e in content]
        self.assertIn("Alaric", names)
        self.assertIn("Rose Castle", names)
