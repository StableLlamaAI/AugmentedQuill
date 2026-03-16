# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test sourcebook api unit so this responsibility stays isolated, testable, and easy to evolve."""

import json
import os
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import augmentedquill.main as main
from augmentedquill.services.projects.projects import select_project


class SourcebookApiTest(TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.projects_root = Path(self.td.name) / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = Path(self.td.name) / "projects.json"

        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)

        ok, msg = select_project("sourcebook_api_proj")
        self.assertTrue(ok, msg)

        pdir = self.projects_root / "sourcebook_api_proj"
        story = {
            "metadata": {"version": 2},
            "project_title": "Sourcebook API",
            "format": "markdown",
            "project_type": "novel",
            "sourcebook": {},
        }
        (pdir / "story.json").write_text(json.dumps(story), encoding="utf-8")

        self.client = TestClient(main.app)

    def tearDown(self):
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    def test_sourcebook_api_crud(self):
        create = self.client.post(
            "/api/v1/sourcebook",
            json={
                "name": "Aelith",
                "description": "A traveling archivist",
                "category": "character",
                "synonyms": ["Archivist"],
                "images": ["aelith.png"],
            },
        )
        self.assertEqual(create.status_code, 200, create.text)
        created = create.json()
        self.assertEqual(created["id"], "Aelith")

        get_all = self.client.get("/api/v1/sourcebook")
        self.assertEqual(get_all.status_code, 200, get_all.text)
        entries = get_all.json()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["name"], "Aelith")

        update = self.client.put(
            "/api/v1/sourcebook/Aelith",
            json={
                "name": "Aelith Ren",
                "description": "Renowned traveling archivist",
                "synonyms": ["Archivist", "Ren"],
            },
        )
        self.assertEqual(update.status_code, 200, update.text)
        updated = update.json()
        self.assertEqual(updated["name"], "Aelith Ren")

        delete = self.client.delete("/api/v1/sourcebook/Aelith Ren")
        self.assertEqual(delete.status_code, 200, delete.text)
        self.assertEqual(delete.json().get("ok"), True)

        get_after_delete = self.client.get("/api/v1/sourcebook")
        self.assertEqual(get_after_delete.status_code, 200, get_after_delete.text)
        self.assertEqual(get_after_delete.json(), [])

    def test_sourcebook_api_search(self):
        self.client.post(
            "/api/v1/sourcebook",
            json={
                "name": "Alaric",
                "description": "A brave knight.",
                "category": "Character",
            },
        )
        self.client.post(
            "/api/v1/sourcebook",
            json={
                "name": "Rose Castle",
                "description": "Where Alaric lives.",
                "category": "Location",
            },
        )

        # Search for Alaric
        res = self.client.get("/api/v1/sourcebook?query=Alaric")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Extensive mode matches name/synonyms/keywords (not raw description).
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Alaric")

        # Search for Rose
        res = self.client.get("/api/v1/sourcebook?query=Rose")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Rose Castle")

        # No split fallback by default for user filter API
        res = self.client.get("/api/v1/sourcebook?query=Alaric Castle")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data, [])

        # Explicit split fallback for extensive multi-token lookup
        res = self.client.get(
            "/api/v1/sourcebook?query=Alaric Castle&split_query_fallback=true"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        names = [e["name"] for e in data]
        self.assertIn("Alaric", names)
        self.assertIn("Rose Castle", names)

        # Non-existent search
        res = self.client.get("/api/v1/sourcebook?query=nonexistent")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), [])

    def test_sourcebook_api_query_uses_keyword_refresh_search(self):
        with patch(
            "augmentedquill.api.v1.sourcebook.sourcebook_search_entries_with_keyword_refresh",
            new=AsyncMock(return_value=[]),
        ) as mocked_search:
            res = self.client.get(
                "/api/v1/sourcebook?query=rose&match_mode=extensive&split_query_fallback=true"
            )
            self.assertEqual(res.status_code, 200)
            mocked_search.assert_awaited_once_with(
                "rose",
                match_mode="extensive",
                split_query_fallback=True,
                payload={},
            )

    def test_sourcebook_api_create_calls_keyword_refresh(self):
        refreshed_entry = {
            "id": "Aelith",
            "name": "Aelith",
            "description": "A traveling archivist",
            "category": "Character",
            "synonyms": ["Archivist"],
            "images": ["aelith.png"],
            "keywords": ["traveling archivist"],
        }
        with patch(
            "augmentedquill.api.v1.sourcebook.sourcebook_refresh_entry_keywords",
            new=AsyncMock(return_value=refreshed_entry),
        ) as mocked_refresh:
            create = self.client.post(
                "/api/v1/sourcebook",
                json={
                    "name": "Aelith",
                    "description": "A traveling archivist",
                    "category": "character",
                    "synonyms": ["Archivist"],
                    "images": ["aelith.png"],
                },
            )
            self.assertEqual(create.status_code, 200, create.text)
            body = create.json()
            self.assertEqual(body.get("keywords"), ["traveling archivist"])
            mocked_refresh.assert_awaited_once_with("Aelith", payload={})

    def test_sourcebook_api_update_calls_keyword_refresh(self):
        self.client.post(
            "/api/v1/sourcebook",
            json={
                "name": "Aelith",
                "description": "A traveling archivist",
                "category": "Character",
            },
        )

        refreshed_entry = {
            "id": "Aelith",
            "name": "Aelith",
            "description": "Renowned traveling archivist",
            "category": "Character",
            "synonyms": ["Archivist"],
            "images": [],
            "keywords": ["renowned archivist"],
        }
        with patch(
            "augmentedquill.api.v1.sourcebook.sourcebook_refresh_entry_keywords",
            new=AsyncMock(return_value=refreshed_entry),
        ) as mocked_refresh:
            update = self.client.put(
                "/api/v1/sourcebook/Aelith",
                json={
                    "description": "Renowned traveling archivist",
                    "synonyms": ["Archivist"],
                },
            )
            self.assertEqual(update.status_code, 200, update.text)
            body = update.json()
            self.assertEqual(body.get("keywords"), ["renowned archivist"])
            mocked_refresh.assert_awaited_once_with("Aelith", payload={})
