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
            name=None, description="Valid desc", category="Character"
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
            name="Valid Name", description=None, category="Character"
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

    def test_create_entry_with_unknown_category_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name", description="Valid", category="NotARealCategory"
        )
        self.assertIn("error", result)

    def test_create_entry_with_invalid_synonyms_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name",
            description="Valid",
            category="Character",
            synonyms="not a list",
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            self.fail("Should create error for non-list synonyms")

    def test_create_entry_with_invalid_images_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name Images",
            description="Valid",
            category="Character",
            images="not a list",
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            self.fail("Should create error for non-list images")

    def test_create_entry_with_none_images_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name Images 2",
            description="Valid",
            category="Character",
            images=None,
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            entries = self._get_entries()
            val = entries[0]["images"]
            if val is None:
                self.fail("Bug: images is None in database")
            else:
                self.fail(f"Bug: images is {val}")

    def test_create_entry_with_invalid_image_type_inside_list_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name Images 3",
            description="Valid",
            category="Character",
            images=[123, "img1"],
        )
        if "error" in result:
            self.assertIn("error", result)
        else:
            self.fail("Should create error for non-string image in list")

    def test_create_entry_with_none_synonyms_returns_error(self):
        result = sourcebook_create_entry(
            name="Valid Name",
            description="Valid",
            category="Character",
            synonyms=None,
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
        entry = sourcebook_create_entry("UpdateTarget", "Desc", "Character")
        self.assertNotIn("error", entry)
        eid = entry["id"]

        # Update it
        updated = sourcebook_update_entry(
            eid, name="NewName", description="NewDesc", images=["img1"]
        )
        self.assertNotIn("error", updated)
        self.assertEqual(updated["name"], "NewName")
        self.assertEqual(updated["description"], "NewDesc")
        self.assertEqual(updated["category"], "Character")  # Unchanged
        self.assertEqual(updated["images"], ["img1"])

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
        entry = sourcebook_create_entry("UpdateTarget2", "Desc", "Character")
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

        # Invalid Category Value
        self.assertIn(
            "error", sourcebook_update_entry(eid, category="NotARealCategory")
        )

        # Invalid Images
        self.assertIn("error", sourcebook_update_entry(eid, images="Not A List"))
        self.assertIn("error", sourcebook_update_entry(eid, images=[123]))

        # Invalid Identifier (None)
        self.assertIn("error", sourcebook_update_entry(None))

    def test_pydantic_schema_validates_images_on_create_tool(self):
        from augmentedquill.services.chat.chat_tools.sourcebook_tools import (
            CreateSourcebookEntryParams,
        )
        from pydantic import ValidationError

        # Valid
        params = CreateSourcebookEntryParams(
            name="Valid Model",
            description="Valid",
            category="Character",
            images=["img1", "img2"],
        )
        self.assertEqual(params.images, ["img1", "img2"])

        # Default is empty list
        params2 = CreateSourcebookEntryParams(
            name="Valid Model 2", description="Valid", category="Character"
        )
        self.assertEqual(params2.images, [])

        # Invalid
        with self.assertRaises(ValidationError):
            CreateSourcebookEntryParams(
                name="Invalid Model",
                description="Valid",
                category="Character",
                images="not a list",
            )

    def test_pydantic_schema_validates_images_on_update_tool(self):
        from augmentedquill.services.chat.chat_tools.sourcebook_tools import (
            UpdateSourcebookEntryParams,
        )
        from pydantic import ValidationError

        # Valid
        params = UpdateSourcebookEntryParams(name_or_id="id1", images=["img1"])
        self.assertEqual(params.images, ["img1"])

        # Default is None
        params2 = UpdateSourcebookEntryParams(name_or_id="id1")
        self.assertIsNone(params2.images)

        # Invalid
        with self.assertRaises(ValidationError):
            UpdateSourcebookEntryParams(name_or_id="id1", images="not a list")

    def _get_entries(self):
        story_path = self.pdir / "story.json"
        story = json.loads(story_path.read_text())
        sb = story.get("sourcebook", {})
        if isinstance(sb, dict):
            # Convert to list for tests that expect it
            return [{"id": name, "name": name, **data} for name, data in sb.items()]
        return sb
