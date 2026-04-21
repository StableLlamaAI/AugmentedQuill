# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test dependencies unit so this responsibility stays isolated, testable, and easy to evolve."""

import json

from fastapi import HTTPException

from augmentedquill.api.v1.dependencies import require_project_path
from augmentedquill.services.projects.projects import initialize_project_dir
from tests.unit.api.v1.api_test_case import ApiTestCase


class DependenciesTest(ApiTestCase):
    def test_require_project_path_resolves_valid_project(self):
        project_name = "test_project"
        project_dir = self.projects_root / project_name
        initialize_project_dir(project_dir, project_title="Test Project")

        resolved = require_project_path(project_name)
        self.assertEqual(resolved, project_dir)

    def test_require_project_path_rejects_path_traversal(self):
        outside_dir = self.user_data_root / "outside_project"
        outside_dir.mkdir(parents=True, exist_ok=True)
        (outside_dir / "story.json").write_text(
            json.dumps(
                {
                    "metadata": {"version": 2},
                    "project_title": "Outside",
                    "format": "markdown",
                    "chapters": [],
                }
            ),
            encoding="utf-8",
        )

        with self.assertRaises(HTTPException) as exc_info:
            require_project_path("../outside_project")

        self.assertEqual(exc_info.exception.status_code, 404)
        self.assertIn("not found", str(exc_info.exception.detail).lower())
