# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""API-level tests for marker-based scenes endpoints."""

import json
from unittest.mock import AsyncMock, patch

from augmentedquill.services.projects.projects import select_project
from tests.unit.api.v1.api_test_case import ApiTestCase


class ScenesApiTest(ApiTestCase):
    def setUp(self) -> None:
        super().setUp()
        ok, msg = select_project("scenes_api_proj")
        self.assertTrue(ok, msg)
        pdir = self.projects_root / "scenes_api_proj"
        story = {
            "metadata": {"version": 2},
            "project_title": "Scenes API Test",
            "format": "markdown",
            "project_type": "short-story",
            "scenes": {},
        }
        (pdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
        (pdir / "content.md").write_text("Alpha Bravo Charlie", encoding="utf-8")
        self.pname = "scenes_api_proj"

    def _url(self, suffix: str = "") -> str:
        return f"/api/v1/projects/{self.pname}/scenes{suffix}"

    def _create(self, **kwargs) -> dict:
        resp = self.client.post(self._url(), json=kwargs)
        self.assertEqual(resp.status_code, 201, resp.text)
        return resp.json()

    def test_create_list_get_delete_crud(self) -> None:
        created = self._create(summary="Scene A")

        listed = self.client.get(self._url())
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)

        fetched = self.client.get(self._url(f"/{created['id']}"))
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["summary"], "Scene A")

        deleted = self.client.delete(self._url(f"/{created['id']}"))
        self.assertEqual(deleted.status_code, 204)

    def test_link_and_unlink_scene_prose(self) -> None:
        scene = self._create(summary="Linked")

        linked = self.client.post(
            self._url(f"/{scene['id']}/link-prose"),
            json={"scope_type": "story", "start_offset": 0, "end_offset": 5},
        )
        self.assertEqual(linked.status_code, 200, linked.text)

        fetched = self.client.get(self._url(f"/{scene['id']}"))
        self.assertEqual(fetched.status_code, 200)
        self.assertIsNotNone(fetched.json()["prose_link"])

        unlinked = self.client.post(self._url(f"/{scene['id']}/unlink-prose"), json={})
        self.assertEqual(unlinked.status_code, 200, unlinked.text)

        fetched_after = self.client.get(self._url(f"/{scene['id']}"))
        self.assertEqual(fetched_after.status_code, 200)
        self.assertIsNone(fetched_after.json()["prose_link"])

    def test_patch_prose_content(self) -> None:
        scene = self._create(summary="Edit")
        self.client.post(
            self._url(f"/{scene['id']}/link-prose"),
            json={"scope_type": "story", "start_offset": 0, "end_offset": 5},
        )

        resp = self.client.patch(
            self._url(f"/{scene['id']}/prose-content"),
            json={"text": "Omega"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["id"], scene["id"])

    def test_detect_boundaries_links_single_scene(self) -> None:
        scene = self._create(summary="Boundary")
        resp = self.client.post(
            self._url("/detect-boundaries"),
            json={
                "scope_type": "story",
                "scene_ids": [scene["id"]],
                "start_offset": 0,
                "end_offset": 10,
                "prose_text": "Alpha text",
            },
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        self.assertEqual(len(payload["assignments"]), 1)
        self.assertEqual(payload["assignments"][0]["scene_id"], scene["id"])

    def test_write_scene_generates_text_and_links(self) -> None:
        scene = self._create(summary="Write scene")

        with patch(
            "augmentedquill.services.scenes.scene_generation_service.llm.unified_chat_complete",
            new=AsyncMock(return_value={"content": "Generated scene prose."}),
        ):
            resp = self.client.post(
                self._url(f"/{scene['id']}/write"),
                json={
                    "scope_type": "story",
                    "include_following_scenes": 0,
                    "detect_boundaries": False,
                },
            )

        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        self.assertEqual(payload["generated_text"], "Generated scene prose.")
        self.assertEqual(payload["scene"]["id"], scene["id"])

    def test_auto_link_scope(self) -> None:
        scene = self._create(summary="Auto")
        resp = self.client.post(
            self._url("/auto-link-scope"),
            json={
                "scope_type": "story",
                "current_text": "Alpha Bravo Charlie",
                "scene_ids": [scene["id"]],
                "start_offset": 0,
            },
        )

        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        self.assertEqual(len(payload["assignments"]), 1)

    def test_auto_link_scope_links_multiple_scenes_without_existing_markers(
        self,
    ) -> None:
        first = self._create(summary="First")
        second = self._create(summary="Second")
        pdir = self.projects_root / self.pname
        (pdir / "content.md").write_text(
            "Para one.\n\nPara two.",
            encoding="utf-8",
        )

        resp = self.client.post(
            self._url("/auto-link-scope"),
            json={
                "scope_type": "story",
                "current_text": "Para one.\n\nPara two.",
            },
        )

        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        assignments = payload["assignments"]
        self.assertEqual(len(assignments), 2)
        self.assertEqual(assignments[0]["scene_id"], first["id"])
        self.assertEqual(assignments[1]["scene_id"], second["id"])

        first_scene = self.client.get(self._url(f"/{first['id']}"))
        second_scene = self.client.get(self._url(f"/{second['id']}"))
        self.assertEqual(first_scene.status_code, 200, first_scene.text)
        self.assertEqual(second_scene.status_code, 200, second_scene.text)
        self.assertIsNotNone(first_scene.json().get("prose_link"))
        self.assertIsNotNone(second_scene.json().get("prose_link"))

    def test_auto_link_scope_uses_saved_scope_text_offsets(self) -> None:
        first = self._create(summary="First")
        second = self._create(summary="Second")

        # Persisted prose has two paragraphs; request text is stale/normalized
        # differently and should not drive boundary offsets.
        pdir = self.projects_root / self.pname
        saved = "Alpha first paragraph.\n\nBeta second paragraph."
        (pdir / "content.md").write_text(saved, encoding="utf-8")

        resp = self.client.post(
            self._url("/auto-link-scope"),
            json={
                "scope_type": "story",
                "current_text": "Alpha first paragraph. Beta second paragraph.",
            },
        )

        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        self.assertEqual(len(payload["assignments"]), 2)

        text = (pdir / "content.md").read_text(encoding="utf-8")
        self.assertIn(f"<!--scene:{first['id']}:start-->", text)
        self.assertIn(f"<!--scene:{first['id']}:end-->", text)
        self.assertIn(f"<!--scene:{second['id']}:start-->", text)
        self.assertIn(f"<!--scene:{second['id']}:end-->", text)

    def test_auto_link_scope_splits_single_paragraph_for_multiple_scenes(self) -> None:
        first = self._create(summary="First")
        second = self._create(summary="Second")

        pdir = self.projects_root / self.pname
        (pdir / "content.md").write_text(
            "Alpha one two three four five six seven eight.",
            encoding="utf-8",
        )

        resp = self.client.post(
            self._url("/auto-link-scope"),
            json={
                "scope_type": "story",
                "current_text": "Alpha one two three four five six seven eight.",
            },
        )

        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        assignments = payload["assignments"]
        self.assertEqual(len(assignments), 2)
        self.assertLess(assignments[0]["start_offset"], assignments[0]["end_offset"])
        self.assertLess(assignments[1]["start_offset"], assignments[1]["end_offset"])

        first_scene = self.client.get(self._url(f"/{first['id']}"))
        second_scene = self.client.get(self._url(f"/{second['id']}"))
        self.assertEqual(first_scene.status_code, 200, first_scene.text)
        self.assertEqual(second_scene.status_code, 200, second_scene.text)
        self.assertIsNotNone(first_scene.json().get("prose_link"))
        self.assertIsNotNone(second_scene.json().get("prose_link"))

    def test_auto_link_scope_does_not_create_nested_marker_comments(self) -> None:
        first = self._create(summary="First")
        second = self._create(summary="Second")

        pdir = self.projects_root / self.pname
        saved = "First paragraph.\n\nSecond paragraph."
        (pdir / "content.md").write_text(saved, encoding="utf-8")

        resp = self.client.post(
            self._url("/auto-link-scope"),
            json={
                "scope_type": "story",
                "current_text": saved,
            },
        )

        self.assertEqual(resp.status_code, 200, resp.text)
        text = (pdir / "content.md").read_text(encoding="utf-8")
        self.assertIn(f"<!--scene:{first['id']}:start-->", text)
        self.assertIn(f"<!--scene:{first['id']}:end-->", text)
        self.assertIn(f"<!--scene:{second['id']}:start-->", text)
        self.assertIn(f"<!--scene:{second['id']}:end-->", text)
        self.assertNotIn("<!--scene:2:start-<!--scene:1:end-->->", text)
