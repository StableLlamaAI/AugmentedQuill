# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test project snapshots unit so this responsibility stays isolated, testable, and easy to evolve."""

import base64
import tempfile
from pathlib import Path
from unittest import TestCase

from augmentedquill.services.projects.project_snapshots import (
    _is_safe_relative_path,
    capture_project_snapshot,
    restore_from_directory,
    restore_project_snapshot,
    snapshot_to_directory,
)


class ProjectSnapshotsTest(TestCase):
    def test_safe_relative_path_rules(self):
        self.assertTrue(_is_safe_relative_path(Path("chapters/0001.txt")))
        self.assertFalse(_is_safe_relative_path(Path("../escape.txt")))
        self.assertFalse(_is_safe_relative_path(Path(".aq_history/batch.json")))
        self.assertFalse(_is_safe_relative_path(Path("chats/c1.json")))
        self.assertFalse(_is_safe_relative_path(Path("checkpoints/x/file.txt")))

    def test_capture_and_restore_snapshot_filters_internal_dirs(self):
        with tempfile.TemporaryDirectory() as td:
            project_dir = Path(td) / "project"
            (project_dir / "chapters").mkdir(parents=True, exist_ok=True)
            (project_dir / "chats").mkdir(parents=True, exist_ok=True)
            (project_dir / ".aq_history").mkdir(parents=True, exist_ok=True)
            (project_dir / "checkpoints").mkdir(parents=True, exist_ok=True)

            safe_file = project_dir / "chapters" / "0001.txt"
            safe_file.write_text("chapter", encoding="utf-8")
            (project_dir / "chats" / "c1.json").write_text("{}", encoding="utf-8")
            (project_dir / ".aq_history" / "x.txt").write_text("x", encoding="utf-8")
            (project_dir / "checkpoints" / "x.txt").write_text("x", encoding="utf-8")

            snapshot = capture_project_snapshot(project_dir)
            self.assertIn("chapters/0001.txt", snapshot)
            self.assertNotIn("chats/c1.json", snapshot)
            self.assertTrue(
                base64.b64decode(snapshot["chapters/0001.txt"]).decode("utf-8")
                == "chapter"
            )

            # Mutate current files and restore from snapshot.
            safe_file.write_text("mutated", encoding="utf-8")
            extra = project_dir / "chapters" / "0002.txt"
            extra.write_text("remove-me", encoding="utf-8")

            restore_project_snapshot(project_dir, snapshot)
            self.assertEqual(safe_file.read_text(encoding="utf-8"), "chapter")
            self.assertFalse(extra.exists())

    def test_restore_ignores_unsafe_snapshot_paths(self):
        with tempfile.TemporaryDirectory() as td:
            project_dir = Path(td) / "project"
            project_dir.mkdir(parents=True, exist_ok=True)

            snapshot = {
                "chapters/0001.txt": base64.b64encode(b"safe").decode("ascii"),
                "../evil.txt": base64.b64encode(b"evil").decode("ascii"),
            }
            restore_project_snapshot(project_dir, snapshot)

            self.assertTrue((project_dir / "chapters" / "0001.txt").exists())
            self.assertFalse((project_dir.parent / "evil.txt").exists())

    def test_snapshot_to_directory_requires_checkpoints_subdir(self):
        with tempfile.TemporaryDirectory() as td:
            project_dir = Path(td) / "project"
            (project_dir / "chapters").mkdir(parents=True, exist_ok=True)
            (project_dir / "chapters" / "0001.txt").write_text("c", encoding="utf-8")

            with self.assertRaises(ValueError):
                snapshot_to_directory(project_dir, project_dir / "outside")

            target = project_dir / "checkpoints" / "2026-01-01"
            snapshot_to_directory(project_dir, target)
            self.assertTrue((target / "chapters" / "0001.txt").exists())

    def test_restore_from_directory_requires_checkpoints_subdir(self):
        with tempfile.TemporaryDirectory() as td:
            project_dir = Path(td) / "project"
            (project_dir / "chapters").mkdir(parents=True, exist_ok=True)
            (project_dir / "chapters" / "0001.txt").write_text("old", encoding="utf-8")

            with self.assertRaises(ValueError):
                restore_from_directory(project_dir, project_dir / "not-checkpoint")

            checkpoint_dir = project_dir / "checkpoints" / "snap"
            (checkpoint_dir / "chapters").mkdir(parents=True, exist_ok=True)
            (checkpoint_dir / "chapters" / "0001.txt").write_text(
                "new", encoding="utf-8"
            )
            restore_from_directory(project_dir, checkpoint_dir)
            self.assertEqual(
                (project_dir / "chapters" / "0001.txt").read_text(encoding="utf-8"),
                "new",
            )
