# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""API-level tests for the scenes endpoints."""

import json

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
            "project_type": "novel",
            "scenes": {},
        }
        (pdir / "story.json").write_text(json.dumps(story), encoding="utf-8")
        self.pname = "scenes_api_proj"

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _url(self, suffix: str = "") -> str:
        return f"/api/v1/projects/{self.pname}/scenes{suffix}"

    def _create(self, **kwargs) -> dict:
        resp = self.client.post(self._url(), json=kwargs)
        self.assertEqual(resp.status_code, 201, resp.text)
        return resp.json()

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def test_list_empty(self) -> None:
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_create_and_list(self) -> None:
        scene = self._create(
            summary="Scene Alpha", color_tag="#ff00ff", status="active"
        )
        self.assertEqual(scene["summary"], "Scene Alpha")
        self.assertIn("id", scene)

        all_scenes = self.client.get(self._url()).json()
        self.assertEqual(len(all_scenes), 1)

    def test_get_single(self) -> None:
        scene = self._create(summary="Single")
        resp = self.client.get(self._url(f"/{scene['id']}"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["summary"], "Single")

    def test_get_404(self) -> None:
        resp = self.client.get(self._url("/nonexistent"))
        self.assertEqual(resp.status_code, 404)

    def test_update(self) -> None:
        scene = self._create(summary="Before")
        resp = self.client.put(self._url(f"/{scene['id']}"), json={"summary": "After"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["summary"], "After")

    def test_update_404(self) -> None:
        resp = self.client.put(self._url("/ghost"), json={"summary": "x"})
        self.assertEqual(resp.status_code, 404)

    def test_delete(self) -> None:
        scene = self._create(summary="To remove")
        resp = self.client.delete(self._url(f"/{scene['id']}"))
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(self.client.get(self._url()).json(), [])

    def test_delete_404(self) -> None:
        resp = self.client.delete(self._url("/ghost"))
        self.assertEqual(resp.status_code, 404)

    # ------------------------------------------------------------------
    # Order constraints
    # ------------------------------------------------------------------

    def test_order_constraints_persisted(self) -> None:
        a = self._create(summary="A")
        b = self._create(summary="B", order_after=[a["id"]])
        fetched = self.client.get(self._url(f"/{b['id']}")).json()
        self.assertIn(a["id"], fetched["order_after"])

    def test_delete_removes_from_sibling_constraints(self) -> None:
        a = self._create(summary="A")
        b = self._create(summary="B", order_after=[a["id"]])
        # Put A's ID in B's order_after; put B's ID in A's order_before
        self.client.put(self._url(f"/{a['id']}"), json={"order_before": [b["id"]]})

        self.client.delete(self._url(f"/{a['id']}"))
        b_after = self.client.get(self._url(f"/{b['id']}")).json()
        self.assertNotIn(a["id"], b_after.get("order_after", []))

    # ------------------------------------------------------------------
    # Prose link and stale detection
    # ------------------------------------------------------------------

    def test_prose_link_stale_flag_missing_file(self) -> None:
        """Endpoint annotates prose links with is_stale when file is missing."""
        scene = self._create(
            summary="Ghost link",
            prose_link={
                "scope_type": "chapter",
                "chapter_id": "ghost.md",
                "start_offset": 0,
                "content_hash": "deadbeef12345678",
            },
        )
        fetched = self.client.get(self._url(f"/{scene['id']}")).json()
        self.assertTrue(fetched["prose_link"]["is_stale"])

    def test_refresh_hash_endpoint(self) -> None:
        """Refresh-hash endpoint responds with a SceneProseLink object."""
        pdir = self.projects_root / self.pname
        pdir.joinpath("content.md").write_text("Story text.", encoding="utf-8")

        scene = self._create(
            summary="Has link",
            prose_link={
                "scope_type": "story",
                "start_offset": 0,
                "content_hash": "",
            },
        )
        resp = self.client.post(
            self._url(f"/{scene['id']}/refresh-hash"),
            json={
                "scope_type": "story",
                "start_offset": 0,
                "content_hash": "",
                "beat_id": None,
            },
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        link = resp.json()
        self.assertEqual(len(link["content_hash"]), 16)

    # ------------------------------------------------------------------
    # link-prose endpoint
    # ------------------------------------------------------------------

    def test_link_prose_assigns_range_to_scene(self) -> None:
        """POST link-prose returns all modified scenes with the new range."""
        pdir = self.projects_root / self.pname
        (pdir / "content.md").write_text("A" * 200, encoding="utf-8")

        scene = self._create(summary="Linked scene")
        resp = self.client.post(
            self._url(f"/{scene['id']}/link-prose"),
            json={"scope_type": "story", "start_offset": 10, "end_offset": 80},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        scenes = resp.json()
        self.assertIsInstance(scenes, list)
        target = next((s for s in scenes if s["id"] == scene["id"]), None)
        self.assertIsNotNone(target)
        self.assertEqual(target["prose_link"]["start_offset"], 10)
        self.assertEqual(target["prose_link"]["end_offset"], 80)

    def test_link_prose_rejects_inverted_offsets(self) -> None:
        """start_offset >= end_offset is a 422 error."""
        scene = self._create(summary="Inverted")
        resp = self.client.post(
            self._url(f"/{scene['id']}/link-prose"),
            json={"scope_type": "story", "start_offset": 100, "end_offset": 50},
        )
        self.assertEqual(resp.status_code, 422)

    def test_link_prose_404_for_unknown_scene(self) -> None:
        resp = self.client.post(
            self._url("/ghost/link-prose"),
            json={"scope_type": "story", "start_offset": 0, "end_offset": 10},
        )
        self.assertEqual(resp.status_code, 404)

    # ------------------------------------------------------------------
    # prose-content (PATCH) endpoint
    # ------------------------------------------------------------------

    def test_patch_prose_content_replaces_text(self) -> None:
        """PATCH prose-content updates the linked region and returns the scene."""
        pdir = self.projects_root / self.pname
        original = "Hello world, this is the story."
        (pdir / "content.md").write_text(original, encoding="utf-8")

        scene = self._create(
            summary="Content scene",
            prose_link={
                "scope_type": "story",
                "start_offset": 0,
                "end_offset": len(original),
                "content_hash": "",
            },
        )
        new_text = "Goodbye world."
        resp = self.client.patch(
            self._url(f"/{scene['id']}/prose-content"),
            json={"text": new_text},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        updated = resp.json()
        self.assertEqual(updated["id"], scene["id"])
        self.assertEqual(updated["prose_link"]["end_offset"], len(new_text))

    def test_patch_prose_content_post_is_405(self) -> None:
        """POST to the prose-content endpoint must return 405 (method not allowed)."""
        pdir = self.projects_root / self.pname
        (pdir / "content.md").write_text("Some text.", encoding="utf-8")
        scene = self._create(
            summary="Method check",
            prose_link={
                "scope_type": "story",
                "start_offset": 0,
                "end_offset": 10,
                "content_hash": "",
            },
        )
        resp = self.client.post(
            self._url(f"/{scene['id']}/prose-content"),
            json={"text": "should fail"},
        )
        self.assertEqual(resp.status_code, 405)

    def test_patch_prose_content_422_when_no_prose_link(self) -> None:
        """PATCH prose-content on an unlinked scene returns 422."""
        scene = self._create(summary="Unlinked")
        resp = self.client.patch(
            self._url(f"/{scene['id']}/prose-content"),
            json={"text": "anything"},
        )
        self.assertEqual(resp.status_code, 422)

    def test_patch_prose_content_404_for_unknown_scene(self) -> None:
        resp = self.client.patch(
            self._url("/ghost/prose-content"),
            json={"text": "anything"},
        )
        self.assertEqual(resp.status_code, 404)

    # ------------------------------------------------------------------
    # reorder-prose endpoint
    # ------------------------------------------------------------------

    def test_reorder_prose_rewrites_scene_offsets(self) -> None:
        pdir = self.projects_root / self.pname
        pdir.joinpath("content.md").write_text(
            "Alpha--Bravo==Charlie", encoding="utf-8"
        )

        scene_a = self._create(
            summary="Scene A",
            prose_link={
                "scope_type": "story",
                "start_offset": 0,
                "end_offset": 5,
                "content_hash": "",
            },
        )
        scene_b = self._create(
            summary="Scene B",
            prose_link={
                "scope_type": "story",
                "start_offset": 7,
                "end_offset": 12,
                "content_hash": "",
            },
        )

        resp = self.client.post(
            self._url("/reorder-prose"),
            json={
                "source_scene_id": scene_b["id"],
                "target_scene_id": scene_a["id"],
                "place_before": True,
            },
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        payload = resp.json()
        scenes = payload["scenes"]
        self.assertEqual(
            {scene["id"] for scene in scenes}, {scene_a["id"], scene_b["id"]}
        )
        self.assertEqual(payload["scope_type"], "story")
        self.assertEqual(payload["rebuilt_text"], "Bravo--Alpha")

        updated_a = self.client.get(self._url(f"/{scene_a['id']}")).json()
        updated_b = self.client.get(self._url(f"/{scene_b['id']}")).json()
        self.assertEqual(updated_b["prose_link"]["start_offset"], 0)
        self.assertEqual(updated_a["prose_link"]["start_offset"], 7)

    def test_reorder_prose_422_for_missing_link(self) -> None:
        scene_a = self._create(summary="Unlinked A")
        scene_b = self._create(
            summary="Linked B",
            prose_link={
                "scope_type": "story",
                "start_offset": 0,
                "end_offset": 5,
                "content_hash": "",
            },
        )

        resp = self.client.post(
            self._url("/reorder-prose"),
            json={
                "source_scene_id": scene_a["id"],
                "target_scene_id": scene_b["id"],
                "place_before": True,
            },
        )
        self.assertEqual(resp.status_code, 422)

    def test_reorder_prose_404_for_unknown_scene(self) -> None:
        scene = self._create(
            summary="Linked",
            prose_link={
                "scope_type": "story",
                "start_offset": 0,
                "end_offset": 5,
                "content_hash": "",
            },
        )

        resp = self.client.post(
            self._url("/reorder-prose"),
            json={
                "source_scene_id": scene["id"],
                "target_scene_id": "ghost",
                "place_before": True,
            },
        )
        self.assertEqual(resp.status_code, 404)
