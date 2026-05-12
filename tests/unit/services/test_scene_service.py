# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Unit tests for the scene service – CRUD and prose stale-flag logic."""

import json
from pathlib import Path

import pytest

from augmentedquill.core.config import load_story_config, save_story_config
from augmentedquill.models.scene import (
    SceneCreateRequest,
    SceneLinkProseRequest,
    SceneProseLink,
    SceneReorderProseRequest,
    SceneUpdateRequest,
)
from augmentedquill.services.scenes.scene_service import (
    _compute_file_hash,
    create_scene,
    delete_scene,
    get_scene,
    link_prose,
    list_scenes,
    reorder_scene_prose,
    update_prose_content,
    update_prose_link_hash,
    update_scene,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def project_dir(tmp_path: Path) -> Path:
    """Return a minimal project directory with an empty story.json."""
    story = {"metadata": {"version": 2}, "project_title": "Test", "scenes": {}}
    (tmp_path / "story.json").write_text(json.dumps(story), encoding="utf-8")
    return tmp_path


@pytest.fixture()
def scene_with_prose(project_dir: Path) -> tuple[Path, str]:
    """Create a project with a content file and a scene linked to it.

    Returns (project_dir, scene_id).
    """
    content = "Hello world, this is the story prose."
    (project_dir / "content.md").write_text(content, encoding="utf-8")

    payload = SceneCreateRequest(
        summary="Opening scene",
        prose_link=SceneProseLink(
            scope_type="story",
            start_offset=0,
            end_offset=len(content),
            content_hash="",
        ),
    )
    scene = create_scene(project_dir, payload)
    # Refresh the hash so it's current
    link = SceneProseLink(**scene["prose_link"])
    update_prose_link_hash(project_dir, scene["id"], None, link)
    return project_dir, scene["id"]


# ---------------------------------------------------------------------------
# CRUD tests
# ---------------------------------------------------------------------------


class TestSceneCRUD:
    def test_create_and_list(self, project_dir: Path) -> None:
        payload = SceneCreateRequest(summary="Scene one", color_tag="#ff0000")
        scene = create_scene(project_dir, payload)

        assert scene["id"]
        assert scene["summary"] == "Scene one"
        assert scene["color_tag"] == "#ff0000"
        assert scene["status"] == "active"

        scenes = list_scenes(project_dir)
        assert len(scenes) == 1
        assert scenes[0]["id"] == scene["id"]

    def test_get_single_scene(self, project_dir: Path) -> None:
        created = create_scene(project_dir, SceneCreateRequest(summary="Fetched"))
        fetched = get_scene(project_dir, created["id"])
        assert fetched is not None
        assert fetched["summary"] == "Fetched"

    def test_get_nonexistent_returns_none(self, project_dir: Path) -> None:
        assert get_scene(project_dir, "does-not-exist") is None

    def test_update_scene(self, project_dir: Path) -> None:
        scene = create_scene(project_dir, SceneCreateRequest(summary="Original"))
        updated = update_scene(
            project_dir,
            scene["id"],
            SceneUpdateRequest(summary="Revised", status="inactive"),
        )
        assert updated is not None
        assert updated["summary"] == "Revised"
        assert updated["status"] == "inactive"
        # Unchanged fields survive
        assert updated["id"] == scene["id"]

    def test_update_nonexistent_returns_none(self, project_dir: Path) -> None:
        result = update_scene(
            project_dir, "ghost", SceneUpdateRequest(summary="No effect")
        )
        assert result is None

    def test_delete_scene(self, project_dir: Path) -> None:
        scene = create_scene(project_dir, SceneCreateRequest(summary="To delete"))
        assert delete_scene(project_dir, scene["id"]) is True
        assert get_scene(project_dir, scene["id"]) is None

    def test_delete_nonexistent_returns_false(self, project_dir: Path) -> None:
        assert delete_scene(project_dir, "ghost") is False

    def test_delete_removes_from_order_constraints(self, project_dir: Path) -> None:
        """Deleting a scene clears its ID from order_before/after on siblings."""
        a = create_scene(project_dir, SceneCreateRequest(summary="A"))
        b_payload = SceneCreateRequest(
            summary="B",
            order_after=[a["id"]],
        )
        b = create_scene(project_dir, b_payload)

        # Manually add B to A's order_before (the service does not enforce symmetry)
        update_scene(
            project_dir,
            a["id"],
            SceneUpdateRequest(order_before=[b["id"]]),
        )

        delete_scene(project_dir, a["id"])

        b_after = get_scene(project_dir, b["id"])
        assert b_after is not None
        assert a["id"] not in b_after.get("order_after", [])

    def test_ordering_in_list(self, project_dir: Path) -> None:
        """list_scenes returns cards sorted by pinboard_y then pinboard_x."""
        create_scene(
            project_dir,
            SceneCreateRequest(summary="Bottom-right", pinboard_x=200, pinboard_y=200),
        )
        create_scene(
            project_dir,
            SceneCreateRequest(summary="Top-left", pinboard_x=10, pinboard_y=10),
        )
        create_scene(
            project_dir,
            SceneCreateRequest(summary="Top-right", pinboard_x=300, pinboard_y=10),
        )

        scenes = list_scenes(project_dir)
        assert scenes[0]["summary"] == "Top-left"
        assert scenes[1]["summary"] == "Top-right"
        assert scenes[2]["summary"] == "Bottom-right"

    def test_list_normalizes_legacy_null_list_fields(self, project_dir: Path) -> None:
        """Scenes with legacy null list fields are coerced to valid list defaults."""
        story = load_story_config(project_dir / "story.json") or {}
        story["scenes"] = {
            "legacy-null": {
                "summary": "Legacy",
                "beats": None,
                "active_characters": None,
                "passive_characters": None,
                "sourcebook_entry_ids": None,
                "order_before": None,
                "order_after": None,
                "pinboard_x": None,
                "pinboard_y": None,
                "status": None,
            }
        }
        save_story_config(project_dir / "story.json", story)

        scenes = list_scenes(project_dir)
        assert len(scenes) == 1
        scene = scenes[0]
        assert scene["id"] == "legacy-null"
        assert scene["beats"] == []
        assert scene["active_characters"] == []
        assert scene["passive_characters"] == []
        assert scene["sourcebook_entry_ids"] == []
        assert scene["order_before"] == []
        assert scene["order_after"] == []
        assert scene["pinboard_x"] == 100.0
        assert scene["pinboard_y"] == 100.0
        assert scene["status"] == "active"


# ---------------------------------------------------------------------------
# Prose stale detection tests
# ---------------------------------------------------------------------------


class TestProseStaleDetection:
    def test_no_prose_link_is_not_stale(self, project_dir: Path) -> None:
        scene = create_scene(project_dir, SceneCreateRequest(summary="No link"))
        fetched = get_scene(project_dir, scene["id"])
        assert fetched["prose_link"] is None

    def test_fresh_hash_not_stale(self, scene_with_prose: tuple[Path, str]) -> None:
        project_dir, scene_id = scene_with_prose
        fetched = get_scene(project_dir, scene_id)
        assert fetched is not None
        link = fetched.get("prose_link")
        assert link is not None
        assert link.get("is_stale") is False

    def test_external_change_marks_stale(
        self, scene_with_prose: tuple[Path, str]
    ) -> None:
        """If the content file changes after the hash is stored, is_stale must be True."""
        project_dir, scene_id = scene_with_prose
        # Simulate an external edit
        content_file = project_dir / "content.md"
        content_file.write_text("Externally modified content!", encoding="utf-8")

        fetched = get_scene(project_dir, scene_id)
        assert fetched is not None
        link = fetched.get("prose_link")
        assert link is not None
        assert link.get("is_stale") is True

    def test_refresh_hash_clears_stale(
        self, scene_with_prose: tuple[Path, str]
    ) -> None:
        """After calling update_prose_link_hash the stale flag clears."""
        project_dir, scene_id = scene_with_prose
        content_file = project_dir / "content.md"
        content_file.write_text("Changed content after refresh.", encoding="utf-8")

        # First confirm stale
        scene = get_scene(project_dir, scene_id)
        assert scene["prose_link"]["is_stale"] is True

        # Refresh
        link = SceneProseLink(
            **{k: v for k, v in scene["prose_link"].items() if k != "is_stale"}
        )
        update_prose_link_hash(project_dir, scene_id, None, link)

        scene_after = get_scene(project_dir, scene_id)
        assert scene_after["prose_link"]["is_stale"] is False

    def test_beat_prose_link_stale_detection(self, project_dir: Path) -> None:
        """Stale detection works for beat-level prose links too."""
        content = "Beat content here."
        (project_dir / "content.md").write_text(content, encoding="utf-8")

        # Create scene with a beat carrying a prose link
        from augmentedquill.models.scene import SceneBeat

        beat = SceneBeat(
            id="beat-1",
            text="Beat text",
            prose_link=SceneProseLink(
                scope_type="story",
                start_offset=0,
                end_offset=len(content),
                content_hash=_compute_file_hash(project_dir / "content.md"),
            ),
        )
        scene = create_scene(
            project_dir,
            SceneCreateRequest(summary="Scene with beat", beats=[beat]),
        )

        # Not stale yet
        fetched = get_scene(project_dir, scene["id"])
        beat_link = fetched["beats"][0]["prose_link"]
        assert beat_link["is_stale"] is False

        # External modification
        (project_dir / "content.md").write_text("Tampered!", encoding="utf-8")
        fetched_after = get_scene(project_dir, scene["id"])
        beat_link_after = fetched_after["beats"][0]["prose_link"]
        assert beat_link_after["is_stale"] is True

    def test_missing_file_considered_stale(self, project_dir: Path) -> None:
        """A prose link whose file doesn't exist is flagged stale."""
        payload = SceneCreateRequest(
            summary="Ghost link",
            prose_link=SceneProseLink(
                scope_type="chapter",
                chapter_id="nonexistent_chapter.md",
                start_offset=0,
                content_hash="abc123def456abcd",  # non-empty but file missing
            ),
        )
        scene = create_scene(project_dir, payload)
        fetched = get_scene(project_dir, scene["id"])
        assert fetched["prose_link"]["is_stale"] is True


# ---------------------------------------------------------------------------
# Prose offset update tracking test
# ---------------------------------------------------------------------------


class TestProseOffsetTracking:
    def test_update_offsets_when_prose_changes(self, project_dir: Path) -> None:
        """When prose content changes, the user can update offsets and rehash."""
        original = "First paragraph.\n\nSecond paragraph."
        (project_dir / "content.md").write_text(original, encoding="utf-8")

        hash_at_creation = _compute_file_hash(project_dir / "content.md")
        payload = SceneCreateRequest(
            summary="Offset scene",
            prose_link=SceneProseLink(
                scope_type="story",
                start_offset=18,  # "Second paragraph."
                end_offset=len(original),
                content_hash=hash_at_creation,
            ),
        )
        scene = create_scene(project_dir, payload)

        # Simulate the user inserting a paragraph at the start
        new_content = "Prologue.\n\nFirst paragraph.\n\nSecond paragraph."
        (project_dir / "content.md").write_text(new_content, encoding="utf-8")

        # User moves the scene marker to the new position of "Second paragraph."
        new_start = new_content.index("Second paragraph.")
        updated = update_scene(
            project_dir,
            scene["id"],
            SceneUpdateRequest(
                prose_link=SceneProseLink(
                    scope_type="story",
                    start_offset=new_start,
                    end_offset=len(new_content),
                    content_hash="",  # will be refreshed
                )
            ),
        )
        assert updated is not None

        # Refresh hash
        link = SceneProseLink(
            **{k: v for k, v in updated["prose_link"].items() if k != "is_stale"}
        )
        update_prose_link_hash(project_dir, scene["id"], None, link)

        final = get_scene(project_dir, scene["id"])
        assert final["prose_link"]["start_offset"] == new_start
        assert final["prose_link"]["is_stale"] is False


# ---------------------------------------------------------------------------
# link_prose tests
# ---------------------------------------------------------------------------
# Content layout used by most tests:
#   [0, 200) characters total
#   Scene A: [10, 100)
#   Scene B: [110, 180)
# ---------------------------------------------------------------------------

CONTENT = "x" * 200  # 200 identical chars; structure is all about offsets


def _make_two_scene_project(project_dir: Path) -> tuple[str, str]:
    """Create content.md and two linked scenes A[10,100) and B[110,180).

    Returns (scene_a_id, scene_b_id).
    """
    (project_dir / "content.md").write_text(CONTENT, encoding="utf-8")
    a = create_scene(
        project_dir,
        SceneCreateRequest(
            summary="Scene A",
            prose_link=SceneProseLink(
                scope_type="story", start_offset=10, end_offset=100, content_hash=""
            ),
        ),
    )
    b = create_scene(
        project_dir,
        SceneCreateRequest(
            summary="Scene B",
            prose_link=SceneProseLink(
                scope_type="story", start_offset=110, end_offset=180, content_hash=""
            ),
        ),
    )
    return a["id"], b["id"]


def _make_three_scene_project(project_dir: Path) -> tuple[str, str, str]:
    """Create three linked story scenes with distinct text blocks and gaps."""
    content = "Alpha--Bravo==Charlie"
    (project_dir / "content.md").write_text(content, encoding="utf-8")
    a = create_scene(
        project_dir,
        SceneCreateRequest(
            summary="Scene A",
            prose_link=SceneProseLink(
                scope_type="story", start_offset=0, end_offset=5, content_hash=""
            ),
        ),
    )
    b = create_scene(
        project_dir,
        SceneCreateRequest(
            summary="Scene B",
            prose_link=SceneProseLink(
                scope_type="story", start_offset=7, end_offset=12, content_hash=""
            ),
        ),
    )
    c = create_scene(
        project_dir,
        SceneCreateRequest(
            summary="Scene C",
            prose_link=SceneProseLink(
                scope_type="story", start_offset=14, end_offset=21, content_hash=""
            ),
        ),
    )
    return a["id"], b["id"], c["id"]


class TestLinkProse:
    def test_no_overlap_links_cleanly(self, project_dir: Path) -> None:
        """Drag [0, 9] onto Scene C – no overlap with A or B."""
        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        result = link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=0, end_offset=9),
        )
        ids = {s["id"] for s in result}
        assert c["id"] in ids
        c_updated = get_scene(project_dir, c["id"])
        assert c_updated["prose_link"]["start_offset"] == 0
        assert c_updated["prose_link"]["end_offset"] == 9
        # A and B are untouched
        a = get_scene(project_dir, a_id)
        assert a["prose_link"]["start_offset"] == 10

    def test_exact_match_transfers_ownership(self, project_dir: Path) -> None:
        """Drag [10, 100] (exactly Scene A's range) onto Scene C."""
        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        result = link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=10, end_offset=100),
        )
        ids = {s["id"] for s in result}
        assert a_id in ids  # A was modified
        assert c["id"] in ids
        a_after = get_scene(project_dir, a_id)
        assert a_after["prose_link"] is None
        c_after = get_scene(project_dir, c["id"])
        assert c_after["prose_link"]["start_offset"] == 10

    def test_hole_is_forbidden(self, project_dir: Path) -> None:
        """Drag [30, 60] (interior of A) → FORBIDDEN."""
        from augmentedquill.models.scene import ProseConflictError

        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        with pytest.raises(ProseConflictError) as exc_info:
            link_prose(
                project_dir,
                c["id"],
                SceneLinkProseRequest(
                    scope_type="story", start_offset=30, end_offset=60
                ),
            )
        assert exc_info.value.conflicting_scene_id == a_id

    def test_cuts_start_of_existing(self, project_dir: Path) -> None:
        """Drag [10, 60] – includes A's start → A becomes [60, 100)."""
        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=10, end_offset=60),
        )
        a_after = get_scene(project_dir, a_id)
        assert a_after["prose_link"]["start_offset"] == 60
        assert a_after["prose_link"]["end_offset"] == 100

    def test_cuts_end_of_existing(self, project_dir: Path) -> None:
        """Drag [60, 100] – includes A's end → A becomes [10, 60)."""
        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=60, end_offset=100),
        )
        a_after = get_scene(project_dir, a_id)
        assert a_after["prose_link"]["start_offset"] == 10
        assert a_after["prose_link"]["end_offset"] == 60

    def test_new_fully_contains_unlinks_existing(self, project_dir: Path) -> None:
        """Drag [5, 200] – fully contains both A and B → both unlinked."""
        a_id, b_id = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=5, end_offset=200),
        )
        assert get_scene(project_dir, a_id)["prose_link"] is None
        assert get_scene(project_dir, b_id)["prose_link"] is None

    def test_cross_boundary_cuts_both(self, project_dir: Path) -> None:
        """Drag [50, 120] – cuts end of A and start of B."""
        a_id, b_id = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=50, end_offset=120),
        )
        a_after = get_scene(project_dir, a_id)
        b_after = get_scene(project_dir, b_id)
        # A [10,100) → [10,50)
        assert a_after["prose_link"]["start_offset"] == 10
        assert a_after["prose_link"]["end_offset"] == 50
        # B [110,180) → [120,180)
        assert b_after["prose_link"]["start_offset"] == 120
        assert b_after["prose_link"]["end_offset"] == 180

    def test_gap_range_has_no_overlap(self, project_dir: Path) -> None:
        """Drag [100, 110] (the gap between A and B) – no changes to A or B."""
        a_id, b_id = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=100, end_offset=110),
        )
        a_after = get_scene(project_dir, a_id)
        b_after = get_scene(project_dir, b_id)
        assert a_after["prose_link"]["start_offset"] == 10
        assert a_after["prose_link"]["end_offset"] == 100
        assert b_after["prose_link"]["start_offset"] == 110

    def test_invalid_offsets_raises(self, project_dir: Path) -> None:
        """start_offset >= end_offset → ValueError."""
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        with pytest.raises(ValueError):
            link_prose(
                project_dir,
                c["id"],
                SceneLinkProseRequest(
                    scope_type="story", start_offset=50, end_offset=50
                ),
            )

    def test_different_scope_ignored(self, project_dir: Path) -> None:
        """A prose link in a different scope does not affect chapter-scope links."""
        a_id, _ = _make_two_scene_project(project_dir)  # scope='story'
        c = create_scene(project_dir, SceneCreateRequest(summary="Scene C"))
        # Assign the same [10, 100) range but for a chapter scope – no conflict
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(
                scope_type="chapter",
                chapter_id="ch1.md",
                start_offset=10,
                end_offset=100,
            ),
        )
        a_after = get_scene(project_dir, a_id)
        # A (story scope) is unchanged
        assert a_after["prose_link"]["start_offset"] == 10

    def test_link_prose_replaces_own_existing_link(self, project_dir: Path) -> None:
        """Calling link_prose on a scene that already has a link updates it."""
        (project_dir / "content.md").write_text(CONTENT, encoding="utf-8")
        a = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="A",
                prose_link=SceneProseLink(
                    scope_type="story", start_offset=0, end_offset=50, content_hash=""
                ),
            ),
        )
        link_prose(
            project_dir,
            a["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=60, end_offset=90),
        )
        a_after = get_scene(project_dir, a["id"])
        assert a_after["prose_link"]["start_offset"] == 60
        assert a_after["prose_link"]["end_offset"] == 90

    def test_hole_at_start_boundary_allowed(self, project_dir: Path) -> None:
        """Drag [10, 10+n] where n < A.end - A.start but starts at A.start – not a hole."""
        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="C"))
        # [10, 50] starts at A.start (10), so it cuts A's start, not a hole
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=10, end_offset=50),
        )
        a_after = get_scene(project_dir, a_id)
        assert a_after["prose_link"]["start_offset"] == 50  # trimmed

    def test_hole_at_end_boundary_allowed(self, project_dir: Path) -> None:
        """Drag [n, A.end] where n > A.start – cuts end, not a hole."""
        a_id, _ = _make_two_scene_project(project_dir)
        c = create_scene(project_dir, SceneCreateRequest(summary="C"))
        # [50, 100] ends at A.end (100), so it cuts A's end, not a hole
        link_prose(
            project_dir,
            c["id"],
            SceneLinkProseRequest(scope_type="story", start_offset=50, end_offset=100),
        )
        a_after = get_scene(project_dir, a_id)
        assert a_after["prose_link"]["end_offset"] == 50  # trimmed


# ---------------------------------------------------------------------------
# reorder_scene_prose tests
# ---------------------------------------------------------------------------


class TestReorderSceneProse:
    def test_reorders_and_rewrites_all_linked_scenes(self, project_dir: Path) -> None:
        a_id, b_id, c_id = _make_three_scene_project(project_dir)

        result = reorder_scene_prose(
            project_dir,
            SceneReorderProseRequest(
                source_scene_id=b_id,
                target_scene_id=a_id,
                place_before=True,
            ),
        )

        assert {scene["id"] for scene in result["scenes"]} == {a_id, b_id, c_id}
        assert result["scope_type"] == "story"
        assert result["scope_start"] == 0
        assert result["scope_end"] == 21
        assert result["rebuilt_text"] == "Bravo--Alpha==Charlie"

        content = (project_dir / "content.md").read_text(encoding="utf-8")
        assert content == "Bravo--Alpha==Charlie"

        a_after = get_scene(project_dir, a_id)
        b_after = get_scene(project_dir, b_id)
        c_after = get_scene(project_dir, c_id)
        assert b_after["prose_link"]["start_offset"] == 0
        assert b_after["prose_link"]["end_offset"] == 5
        assert a_after["prose_link"]["start_offset"] == 7
        assert a_after["prose_link"]["end_offset"] == 12
        assert c_after["prose_link"]["start_offset"] == 14
        assert c_after["prose_link"]["end_offset"] == 21
        assert a_after["prose_link"]["is_stale"] is False
        assert b_after["prose_link"]["is_stale"] is False
        assert c_after["prose_link"]["is_stale"] is False

    def test_same_scene_is_noop(self, project_dir: Path) -> None:
        a_id, _, _ = _make_three_scene_project(project_dir)

        with pytest.raises(ValueError, match="must differ"):
            reorder_scene_prose(
                project_dir,
                SceneReorderProseRequest(
                    source_scene_id=a_id,
                    target_scene_id=a_id,
                    place_before=True,
                ),
            )

    def test_rejects_missing_links(self, project_dir: Path) -> None:
        a = create_scene(
            project_dir,
            SceneCreateRequest(summary="A", prose_link=None),
        )
        b = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="B", prose_link=SceneProseLink(scope_type="story")
            ),
        )

        with pytest.raises(ValueError, match="must have prose links"):
            reorder_scene_prose(
                project_dir,
                SceneReorderProseRequest(
                    source_scene_id=a["id"],
                    target_scene_id=b["id"],
                    place_before=True,
                ),
            )

    def test_moves_scene_text_across_scopes(self, project_dir: Path) -> None:
        (project_dir / "content.md").write_text("Alpha--Bravo", encoding="utf-8")
        chapters_dir = project_dir / "chapters"
        chapters_dir.mkdir(parents=True, exist_ok=True)
        (chapters_dir / "ch-1.md").write_text("Gamma==Delta", encoding="utf-8")

        source = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="Source",
                prose_link=SceneProseLink(
                    scope_type="story",
                    start_offset=0,
                    end_offset=5,
                    content_hash="",
                ),
            ),
        )
        target = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="Target",
                prose_link=SceneProseLink(
                    scope_type="chapter",
                    chapter_id="ch-1",
                    start_offset=0,
                    end_offset=5,
                    content_hash="",
                ),
            ),
        )

        result = reorder_scene_prose(
            project_dir,
            SceneReorderProseRequest(
                source_scene_id=source["id"],
                target_scene_id=target["id"],
                place_before=True,
            ),
        )

        assert result["scope_type"] == "chapter"
        assert result["chapter_id"] == "ch-1"
        assert result["rebuilt_text"] == "AlphaGamma==Delta"

        story_text = (project_dir / "content.md").read_text(encoding="utf-8")
        chapter_text = (chapters_dir / "ch-1.md").read_text(encoding="utf-8")
        assert story_text == "--Bravo"
        assert chapter_text == "AlphaGamma==Delta"

        source_after = get_scene(project_dir, source["id"])
        target_after = get_scene(project_dir, target["id"])
        assert source_after["prose_link"]["scope_type"] == "chapter"
        assert source_after["prose_link"]["chapter_id"] == "ch-1"
        assert source_after["prose_link"]["start_offset"] == 0
        assert source_after["prose_link"]["end_offset"] == 5
        assert target_after["prose_link"]["start_offset"] == 5
        assert target_after["prose_link"]["end_offset"] == 10

    def test_moves_from_series_chapter_with_filename_mapping(
        self, project_dir: Path
    ) -> None:
        books_dir = project_dir / "books"
        book_1 = "book-1"
        book_2 = "book-2"
        (books_dir / book_1 / "chapters").mkdir(parents=True, exist_ok=True)
        (books_dir / book_2 / "chapters").mkdir(parents=True, exist_ok=True)
        (books_dir / book_1 / "chapters" / "0001.txt").write_text(
            "Alpha--Bravo", encoding="utf-8"
        )
        (books_dir / book_2 / "chapters" / "0001.txt").write_text(
            "Gamma==Delta", encoding="utf-8"
        )

        story_path = project_dir / "story.json"
        story = load_story_config(story_path) or {}
        story["project_type"] = "series"
        story["books"] = [
            {
                "id": book_1,
                "title": "Book 1",
                "chapters": [{"title": "Chapter 1", "filename": "0001.txt"}],
            },
            {
                "id": book_2,
                "title": "Book 2",
                "chapters": [{"title": "Chapter 1", "filename": "0001.txt"}],
            },
        ]
        save_story_config(story_path, story)

        source = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="Source",
                prose_link=SceneProseLink(
                    scope_type="chapter",
                    chapter_id="1",
                    book_id=book_1,
                    start_offset=0,
                    end_offset=5,
                    content_hash="",
                ),
            ),
        )
        target = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="Target",
                prose_link=SceneProseLink(
                    scope_type="chapter",
                    chapter_id="2",
                    book_id=book_2,
                    start_offset=0,
                    end_offset=5,
                    content_hash="",
                ),
            ),
        )

        result = reorder_scene_prose(
            project_dir,
            SceneReorderProseRequest(
                source_scene_id=source["id"],
                target_scene_id=target["id"],
                place_before=True,
            ),
        )

        assert result["scope_type"] == "chapter"
        assert result["book_id"] == book_2
        assert result["rebuilt_text"] == "AlphaGamma==Delta"

        assert (books_dir / book_1 / "chapters" / "0001.txt").read_text(
            encoding="utf-8"
        ) == "--Bravo"
        assert (books_dir / book_2 / "chapters" / "0001.txt").read_text(
            encoding="utf-8"
        ) == "AlphaGamma==Delta"


# ---------------------------------------------------------------------------
# update_prose_content tests
# ---------------------------------------------------------------------------


class TestUpdateProseContent:
    def _create_linked_scene(
        self, project_dir: Path, content: str, start: int, end: int
    ) -> str:
        """Write content.md and create a scene linked to [start, end). Returns scene id."""
        (project_dir / "content.md").write_text(content, encoding="utf-8")
        s = create_scene(
            project_dir,
            SceneCreateRequest(
                summary="Linked",
                prose_link=SceneProseLink(
                    scope_type="story",
                    start_offset=start,
                    end_offset=end,
                    content_hash="",
                ),
            ),
        )
        return s["id"]

    def test_replaces_text_and_updates_offsets(self, project_dir: Path) -> None:
        content = "Hello world. Goodbye world."
        scene_id = self._create_linked_scene(project_dir, content, 13, 27)
        result = update_prose_content(project_dir, scene_id, "See you later.")
        assert result is not None
        assert result["prose_link"]["start_offset"] == 13
        assert result["prose_link"]["end_offset"] == 13 + len("See you later.")
        # File was updated
        new_content = (project_dir / "content.md").read_text(encoding="utf-8")
        assert new_content == "Hello world. See you later."

    def test_hash_is_refreshed_after_update(self, project_dir: Path) -> None:
        content = "AABB"
        scene_id = self._create_linked_scene(project_dir, content, 0, 2)
        result = update_prose_content(project_dir, scene_id, "XY")
        assert result is not None
        expected_hash = _compute_file_hash(project_dir / "content.md")
        assert result["prose_link"]["content_hash"] == expected_hash
        assert result["prose_link"]["is_stale"] is False

    def test_no_prose_link_raises(self, project_dir: Path) -> None:
        scene = create_scene(project_dir, SceneCreateRequest(summary="No link"))
        with pytest.raises(ValueError, match="no prose link"):
            update_prose_content(project_dir, scene["id"], "text")

    def test_nonexistent_scene_returns_none(self, project_dir: Path) -> None:
        result = update_prose_content(project_dir, "ghost-id", "text")
        assert result is None

    def test_preserves_surrounding_content(self, project_dir: Path) -> None:
        """Text outside the linked range must not be modified."""
        content = "PRE middle POST"
        scene_id = self._create_linked_scene(project_dir, content, 4, 10)
        update_prose_content(project_dir, scene_id, "CORE")
        new_content = (project_dir / "content.md").read_text(encoding="utf-8")
        assert new_content.startswith("PRE ")
        assert new_content.endswith(" POST")
