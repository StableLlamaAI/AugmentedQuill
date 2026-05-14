# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""REST endpoints for scene management.

All routes are scoped under ``/projects/{project_name}/scenes`` and require a
valid, existing project directory resolved via the ``ProjectDep`` dependency.
"""

from typing import List

from fastapi import APIRouter, HTTPException

from augmentedquill.api.v1.dependencies import ProjectDep
from augmentedquill.models.scene import (
    ProseConflictError,
    Scene,
    SceneCreateRequest,
    SceneId,
    SceneLinkProseRequest,
    SceneProseLink,
    SceneReorderProseRequest,
    SceneReorderProseResponse,
    SceneUpdateProseContentRequest,
    SceneUpdateRequest,
)
from augmentedquill.services.scenes.scene_service import (
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

router = APIRouter(prefix="/projects/{project_name}", tags=["Scenes"])


@router.get("/scenes", response_model=List[Scene])
async def get_scenes(project_dir: ProjectDep) -> List[Scene]:
    """List all scenes for the project, with staleness flags on prose links."""
    return [Scene(**s) for s in list_scenes(project_dir)]


@router.post("/scenes", response_model=Scene, status_code=201)
async def create_new_scene(
    project_dir: ProjectDep,
    payload: SceneCreateRequest,
) -> Scene:
    """Create a new scene."""
    return Scene(**create_scene(project_dir, payload))


@router.get("/scenes/{scene_id}", response_model=Scene)
async def get_single_scene(project_dir: ProjectDep, scene_id: SceneId) -> Scene:
    """Fetch a single scene by ID."""
    scene = get_scene(project_dir, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    return Scene(**scene)


@router.put("/scenes/{scene_id}", response_model=Scene)
async def update_existing_scene(
    project_dir: ProjectDep,
    scene_id: SceneId,
    payload: SceneUpdateRequest,
) -> Scene:
    """Update an existing scene (partial – only provided fields are changed)."""
    scene = update_scene(project_dir, scene_id, payload)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    return Scene(**scene)


@router.delete("/scenes/{scene_id}", status_code=204)
async def delete_existing_scene(project_dir: ProjectDep, scene_id: SceneId) -> None:
    """Delete a scene and remove it from all order constraints."""
    if not delete_scene(project_dir, scene_id):
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")


class RefreshProseHashRequest(SceneProseLink):
    """Body for the prose-link hash refresh endpoint."""

    beat_id: str | None = None


@router.post("/scenes/{scene_id}/refresh-hash", response_model=SceneProseLink)
async def refresh_prose_hash(
    project_dir: ProjectDep,
    scene_id: SceneId,
    payload: RefreshProseHashRequest,
) -> SceneProseLink:
    """Recompute and persist the content hash for a prose link.

    The frontend calls this after the user repositions a scene/beat marker so
    that the hash is up-to-date and the stale flag is cleared.
    """
    beat_id = payload.beat_id
    link = SceneProseLink(**payload.model_dump(exclude={"beat_id"}))
    return update_prose_link_hash(project_dir, scene_id, beat_id, link)


@router.post("/scenes/{scene_id}/link-prose", response_model=List[Scene])
async def link_scene_prose(
    project_dir: ProjectDep,
    scene_id: SceneId,
    payload: SceneLinkProseRequest,
) -> List[Scene]:
    """Assign a prose-text range to a scene.

    Validates that the new range does not create a hole in any existing linked
    scene.  Overlapping scenes are adjusted (their range trimmed or unlinked).
    Returns all scenes that were modified.
    """
    if payload.start_offset >= payload.end_offset:
        raise HTTPException(
            status_code=422, detail="start_offset must be less than end_offset"
        )
    scene = get_scene(project_dir, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    try:
        updated = link_prose(project_dir, scene_id, payload)
    except ProseConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Selection creates a hole in scene '{exc.conflicting_scene_id}'",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [Scene(**s) for s in updated]


@router.post("/scenes/reorder-prose", response_model=SceneReorderProseResponse)
async def reorder_scene_prose_route(
    project_dir: ProjectDep,
    payload: SceneReorderProseRequest,
) -> SceneReorderProseResponse:
    """Reorder linked prose blocks and persist the rewritten offsets."""
    try:
        updated = reorder_scene_prose(project_dir, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return SceneReorderProseResponse(
        scenes=[Scene(**s) for s in updated["scenes"]],
        scope_type=updated["scope_type"],
        chapter_id=updated.get("chapter_id"),
        book_id=updated.get("book_id"),
        scope_start=updated["scope_start"],
        scope_end=updated["scope_end"],
        rebuilt_text=updated["rebuilt_text"],
    )


@router.patch("/scenes/{scene_id}/prose-content", response_model=Scene)
async def update_scene_prose_content(
    project_dir: ProjectDep,
    scene_id: SceneId,
    payload: SceneUpdateProseContentRequest,
) -> Scene:
    """Replace the text at a scene's linked prose offsets.

    Writes the new text to disk, updates ``end_offset`` and ``content_hash``,
    and returns the refreshed scene.
    """
    try:
        result = update_prose_content(project_dir, scene_id, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    return Scene(**result)
