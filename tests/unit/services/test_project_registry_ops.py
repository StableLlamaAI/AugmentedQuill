# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test project registry ops unit so this responsibility stays isolated, testable, and easy to evolve."""

import json
import tempfile
from pathlib import Path
from unittest import TestCase

from augmentedquill.services.projects.project_registry_ops import (
    get_active_project_dir_from_registry,
    load_registry_from_path,
    save_registry_to_path,
    set_active_project_in_registry,
)


class ProjectRegistryOpsTest(TestCase):
    def test_load_registry_missing_file_returns_defaults(self):
        with tempfile.TemporaryDirectory() as td:
            registry_path = Path(td) / "projects.json"
            loaded = load_registry_from_path(registry_path)
            self.assertEqual(loaded, {"current": "", "recent": []})

    def test_load_registry_invalid_json_returns_defaults(self):
        with tempfile.TemporaryDirectory() as td:
            registry_path = Path(td) / "projects.json"
            registry_path.write_text("{bad-json", encoding="utf-8")
            loaded = load_registry_from_path(registry_path)
            self.assertEqual(loaded, {"current": "", "recent": []})

    def test_load_registry_sanitizes_recent_shape(self):
        with tempfile.TemporaryDirectory() as td:
            registry_path = Path(td) / "projects.json"
            registry_path.write_text(
                json.dumps({"current": "/tmp/p", "recent": "not-a-list"}),
                encoding="utf-8",
            )
            loaded = load_registry_from_path(registry_path)
            self.assertEqual(loaded["current"], "/tmp/p")
            self.assertEqual(loaded["recent"], [])

    def test_save_registry_dedupes_and_caps_recent(self):
        with tempfile.TemporaryDirectory() as td:
            registry_path = Path(td) / "projects.json"
            current = "/tmp/p5"
            recent = [
                "/tmp/p4",
                "/tmp/p3",
                "/tmp/p5",
                "/tmp/p2",
                "/tmp/p1",
                "/tmp/p0",
            ]
            save_registry_to_path(registry_path, current=current, recent=recent)

            payload = json.loads(registry_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["current"], current)
            self.assertEqual(
                payload["recent"],
                ["/tmp/p5", "/tmp/p4", "/tmp/p3", "/tmp/p2", "/tmp/p1"],
            )

    def test_set_active_project_prepends_and_dedupes(self):
        current, recent = set_active_project_in_registry(
            registry_path=Path("unused"),
            project_path=Path("/tmp/new"),
            current_registry={"current": "/tmp/old", "recent": ["/tmp/new", "/tmp/a"]},
        )
        self.assertEqual(current, "/tmp/new")
        self.assertEqual(recent, ["/tmp/new", "/tmp/a"])

    def test_get_active_project_dir_from_registry_requires_absolute_path(self):
        self.assertIsNone(
            get_active_project_dir_from_registry({"current": "relative/path"})
        )

        active = get_active_project_dir_from_registry({"current": "/tmp/abs"})
        self.assertIsNotNone(active)
        self.assertEqual(str(active), "/tmp/abs")


class RegistrySchemaValidationTest(TestCase):
    """Tests for schema-based validation in save_registry_to_path."""

    def test_save_valid_registry_writes_file(self):
        with tempfile.TemporaryDirectory() as td:
            registry_path = Path(td) / "projects.json"
            save_registry_to_path(registry_path, current="/tmp/p1", recent=["/tmp/p2"])
            payload = json.loads(registry_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["current"], "/tmp/p1")
            self.assertIn("/tmp/p1", payload["recent"])

    def test_save_empty_string_current_is_valid(self):
        """An empty current string is schema-valid (no active project state)."""
        with tempfile.TemporaryDirectory() as td:
            registry_path = Path(td) / "projects.json"
            save_registry_to_path(registry_path, current="", recent=[])
            payload = json.loads(registry_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["current"], "")
            self.assertEqual(payload["recent"], [])
