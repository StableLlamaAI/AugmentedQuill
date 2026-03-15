# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test checkpoints unit so this responsibility stays isolated, testable, and easy to evolve."""

import os
import tempfile
from pathlib import Path
from unittest import TestCase
from fastapi.testclient import TestClient

from augmentedquill.main import app
from augmentedquill.services.projects.projects import (
    initialize_project_dir,
    select_project,
)


class CheckpointsTest(TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.registry_path = Path(self.td.name) / "projects.json"
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)
        self.projects_root = Path(self.td.name) / "projects"
        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        self.projects_root.mkdir(parents=True, exist_ok=True)

        self.client = TestClient(app)

        # Setup an active project
        self.project_name = "test_project"
        self.project_path = self.projects_root / self.project_name
        initialize_project_dir(self.project_path, project_title="Test Project")
        select_project(self.project_name)

    def test_checkpoints_lifecycle(self):
        # 1. Start client
        client = self.client
        project_dir = self.project_path

        # Check empty list
        resp = client.get("/api/v1/checkpoints")
        assert resp.status_code == 200
        assert len(resp.json()["checkpoints"]) == 0

        # Write a test file
        test_file = project_dir / "test_file.txt"
        test_file.write_text("Hello World", encoding="utf-8")

        # Create checkpoint
        resp = client.post("/api/v1/checkpoints/create")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        timestamp = data["timestamp"]

        # Verify checkpoint exists as dict
        assert (project_dir / "checkpoints" / timestamp).is_dir()
        assert (project_dir / "checkpoints" / timestamp / "test_file.txt").exists()

        resp = client.get("/api/v1/checkpoints")
        assert resp.status_code == 200
        assert len(resp.json()["checkpoints"]) == 1
        assert resp.json()["checkpoints"][0]["timestamp"] == timestamp

        # Modify file
        test_file.write_text("Modified", encoding="utf-8")

        # Load checkpoint
        resp = client.post("/api/v1/checkpoints/load", json={"timestamp": timestamp})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify file is restored
        assert test_file.read_text(encoding="utf-8") == "Hello World"

        # Delete checkpoint
        resp = client.post("/api/v1/checkpoints/delete", json={"timestamp": timestamp})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify list is empty
        resp = client.get("/api/v1/checkpoints")
        assert resp.status_code == 200
        assert len(resp.json()["checkpoints"]) == 0
        assert not (project_dir / "checkpoints" / timestamp).exists()
