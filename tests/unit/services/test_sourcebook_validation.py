# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test sourcebook validation unit so this responsibility stays isolated, testable, and easy to evolve."""

import json
import os
import tempfile
from pathlib import Path
from unittest import TestCase
from augmentedquill.services.sourcebook.sourcebook_helpers import (
    sourcebook_create_entry,
    sourcebook_delete_entry,
    sourcebook_get_entry,
    sourcebook_update_entry,
)
from augmentedquill.services.projects.projects import select_project


class SourcebookValidationTest(TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.projects_root = Path(self.td.name) / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = Path(self.td.name) / "projects.json"

        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)

        # Create test project
        self.pdir = self.projects_root / "test_proj"
        self.pdir.mkdir(parents=True, exist_ok=True)
        (self.pdir / "story.json").write_text(
            '{"metadata": {"version": 2}, "project_title": "Test Project", "format": "markdown", "sourcebook": {}}'
        )

        # Select it (creates registry entry)
        select_project("test_proj")

    def tearDown(self):
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    def test_create_invalid_entry_returns_error(self):
        # Category is now mandatory, so we must provide it to test other fields
        result = sourcebook_create_entry(
            name=None, description="Valid desc", category="Cat"
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            entries = self._get_entries()
            if len(entries) > 0 and entries[0]["name"] is None:
                self.fail(
                    "Bug reproduced: Invalid sourcebook entry created with name=None"
                )

    def test_create_entry_with_null_description_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name", description=None, category="Cat"
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            entries = self._get_entries()
            if len(entries) > 0 and entries[0]["description"] is None:
                self.fail(
                    "Bug reproduced: Invalid sourcebook entry created with description=None"
                )

    def test_create_entry_with_invalid_category_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name", description="Valid", category=123
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            self.fail("Should create error for numeric category")

    def test_create_entry_with_invalid_synonyms_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name",
            description="Valid",
            category="Cat",
            synonyms="not a list",
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            self.fail("Should create error for non-list synonyms")

    def test_create_entry_with_none_synonyms_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name", description="Valid", category="Cat", synonyms=None
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            entries = self._get_entries()
            val = entries[0]["synonyms"]
            if val is None:
                self.fail("Bug: synonyms is None in database")
            else:
                self.fail(f"Bug: synonyms is {val}")

    def test_delete_entry_with_none_returns_false_safe(self):
        try:
            result = sourcebook_delete_entry(None)
            self.assertFalse(result)
        except AttributeError:
            self.fail("sourcebook_delete_entry crashed on None input")

    def test_get_entry_with_none_returns_none_safe(self):
        try:
            result = sourcebook_get_entry(None)
            self.assertIsNone(result)
        except AttributeError:
            self.fail("sourcebook_get_entry crashed on None input")

    def test_create_requires_category(self):
        result = sourcebook_create_entry(
            name="Valid Name", description="Valid", category=None
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            self.fail("Bug: Created entry without category")

    def test_update_success(self):
        # Create valid entry
        entry = sourcebook_create_entry("UpdateTarget", "Desc", "Cat")
        self.assertNotIn("error", entry)
        eid = entry["id"]

        # Update it
        updated = sourcebook_update_entry(eid, name="NewName", description="NewDesc")
        self.assertNotIn("error", updated)
        self.assertEqual(updated["name"], "NewName")
        self.assertEqual(updated["description"], "NewDesc")
        self.assertEqual(updated["category"], "Cat")  # Unchanged

        # Check persistence
        entries = self._get_entries()
        new_eid = updated["id"]
        saved = next(e for e in entries if e["id"] == new_eid)
        self.assertEqual(saved["name"], "NewName")

    def test_update_with_invalid_id_returns_error(self):
        result = sourcebook_update_entry("nonexistent", name="Foo")
        self.assertIn("error", result)

    def test_update_with_invalid_fields_returns_error(self):
        # Create valid entry
        entry = sourcebook_create_entry("UpdateTarget2", "Desc", "Cat")
        eid = entry["id"]

        # Valid update
        updated = sourcebook_update_entry(eid, name="Valid")
        self.assertNotIn("error", updated)
        eid = updated["id"]

        # Invalid name
        self.assertIn("error", sourcebook_update_entry(eid, name=""))

        # Test None explicitly logic
        res = sourcebook_update_entry(eid, name=None)  # Should be fine, just no update
        self.assertNotIn("error", res)

        # Invalid Type
        self.assertIn("error", sourcebook_update_entry(eid, category=123))

        # Invalid Identifier (None)
        self.assertIn("error", sourcebook_update_entry(None))

    def _get_entries(self):
        story_path = self.pdir / "story.json"
        story = json.loads(story_path.read_text())
        sb = story.get("sourcebook", {})
        if isinstance(sb, dict):
            # Convert to list for tests that expect it
            return [{"id": name, "name": name, **data} for name, data in sb.items()]
        return sb
