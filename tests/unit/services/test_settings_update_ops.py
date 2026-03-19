# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test settings update ops unit so this responsibility stays isolated, testable, and easy to evolve."""

import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from augmentedquill.services.settings.settings_update_ops import run_story_config_update


class SettingsUpdateOpsTest(TestCase):
    def test_returns_already_up_to_date(self):
        with tempfile.TemporaryDirectory() as td:
            story_path = Path(td) / "story.json"
            story_path.write_text('{"metadata": {"version": 2}}', encoding="utf-8")

            ok, message = run_story_config_update(
                base_dir=Path(td),
                config_dir=Path(td),
                story_path=story_path,
                current_schema_version=2,
            )

            self.assertTrue(ok)
            self.assertEqual(message, "Already up to date")

    def test_returns_error_when_update_script_missing(self):
        with tempfile.TemporaryDirectory() as td:
            story_path = Path(td) / "story.json"
            story_path.write_text('{"metadata": {"version": 1}}', encoding="utf-8")

            ok, message = run_story_config_update(
                base_dir=Path(td),
                config_dir=Path(td),
                story_path=story_path,
                current_schema_version=2,
            )

            self.assertFalse(ok)
            self.assertIn("No update script found", message)

    def test_runs_update_script_and_returns_stdout(self):
        with tempfile.TemporaryDirectory() as td:
            base_dir = Path(td)
            story_path = base_dir / "story.json"
            story_path.write_text('{"metadata": {"version": 1}}', encoding="utf-8")

            update_script = base_dir / "app" / "updates" / "update_v1_to_v2.py"
            update_script.parent.mkdir(parents=True, exist_ok=True)
            update_script.write_text("# dummy", encoding="utf-8")

            venv_python = base_dir / "venv" / "bin" / "python"
            venv_python.parent.mkdir(parents=True, exist_ok=True)
            venv_python.write_text("", encoding="utf-8")

            with patch(
                "augmentedquill.services.settings.settings_update_ops.subprocess.run",
                return_value=SimpleNamespace(returncode=0, stdout="updated", stderr=""),
            ) as mocked_run:
                ok, message = run_story_config_update(
                    base_dir=base_dir,
                    config_dir=base_dir,
                    story_path=story_path,
                    current_schema_version=2,
                )

            self.assertTrue(ok)
            self.assertEqual(message, "updated")
            self.assertEqual(mocked_run.call_count, 1)

    def test_subprocess_failure_returns_stderr(self):
        with tempfile.TemporaryDirectory() as td:
            base_dir = Path(td)
            story_path = base_dir / "story.json"
            story_path.write_text('{"metadata": {"version": 1}}', encoding="utf-8")

            update_script = base_dir / "app" / "updates" / "update_v1_to_v2.py"
            update_script.parent.mkdir(parents=True, exist_ok=True)
            update_script.write_text("# dummy", encoding="utf-8")

            venv_python = base_dir / "venv" / "bin" / "python"
            venv_python.parent.mkdir(parents=True, exist_ok=True)
            venv_python.write_text("", encoding="utf-8")

            with patch(
                "augmentedquill.services.settings.settings_update_ops.subprocess.run",
                return_value=SimpleNamespace(returncode=1, stdout="", stderr="boom"),
            ):
                ok, message = run_story_config_update(
                    base_dir=base_dir,
                    config_dir=base_dir,
                    story_path=story_path,
                    current_schema_version=2,
                )

            self.assertFalse(ok)
            self.assertEqual(message, "Update failed: boom")
