# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the checkpoints unit so this responsibility stays isolated, testable, and easy to evolve."""

from datetime import datetime
import re
import shutil
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from augmentedquill.services.projects.projects import get_active_project_dir
from augmentedquill.api.v1.http_responses import ok_json, error_json
from augmentedquill.services.projects.project_snapshots import (
    snapshot_to_directory,
    restore_from_directory,
)

router = APIRouter(tags=["Checkpoints"])


class CheckpointInfo(BaseModel):
    timestamp: str


class CheckpointListResponse(BaseModel):
    checkpoints: list[CheckpointInfo]


class CheckpointLoadDeleteRequest(BaseModel):
    timestamp: str


_CHECKPOINTS_DIR_NAME = "checkpoints"


_CHECKPOINT_NAME_RE = r"^[A-Za-z0-9_\-T]+$"


def _get_checkpoints_dir(project_dir: Path) -> Path:
    d = project_dir / _CHECKPOINTS_DIR_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _resolve_checkpoint_dir(project_dir: Path, name: str) -> Path:
    """Resolve a checkpoint name to a safe, canonical directory inside the checkpoints folder."""
    # Basic validation to ensure the value cannot be used for path traversal.
    if not re.match(_CHECKPOINT_NAME_RE, name):
        raise ValueError("Invalid checkpoint name")

    # Final check: Ensure the name is exactly as it would appear inside checkpoints_dir
    # with no path navigation whatsoever. Any name containing a slash or backslash
    # is invalid here.
    if "/" in name or "\\" in name or ".." in name:
        raise ValueError("Invalid checkpoint name")

    checkpoints_dir = (project_dir / _CHECKPOINTS_DIR_NAME).resolve()
    target_dir = (checkpoints_dir / name).resolve()

    # Ensure the target stays inside the checkpoints directory (no path traversal)
    if not target_dir.is_relative_to(checkpoints_dir):
        raise ValueError("Invalid checkpoint name")

    return target_dir


@router.get("/checkpoints", response_model=CheckpointListResponse)
async def api_get_checkpoints() -> CheckpointListResponse:
    project_dir = get_active_project_dir()
    if not project_dir:
        return CheckpointListResponse(checkpoints=[])

    checkpoints_dir = _get_checkpoints_dir(project_dir)
    checkpoints = []

    for path in checkpoints_dir.iterdir():
        if path.is_dir():
            checkpoints.append(CheckpointInfo(timestamp=path.name))

    # sort descending by timestamp (newest first)
    checkpoints.sort(key=lambda x: x.timestamp, reverse=True)
    return CheckpointListResponse(checkpoints=checkpoints)


@router.post("/checkpoints/create")
async def api_create_checkpoint() -> JSONResponse:
    project_dir = get_active_project_dir()
    if not project_dir:
        return error_json("No active project selected", status_code=400)

    timestamp = datetime.now().replace(microsecond=0).isoformat()
    # To be safe with filenames, we'll replace colons
    safe_timestamp = timestamp.replace(":", "-")

    try:
        # Resolve target_dir using the same logic as load/delete to satisfy CodeQL.
        target_dir = _resolve_checkpoint_dir(project_dir, safe_timestamp)
    except ValueError:
        return error_json("Invalid checkpoint name generated", status_code=500)

    snapshot_to_directory(project_dir, target_dir)

    return ok_json(ok=True, timestamp=safe_timestamp)


@router.post("/checkpoints/load")
async def api_load_checkpoint(body: CheckpointLoadDeleteRequest) -> JSONResponse:
    project_dir = get_active_project_dir()
    if not project_dir:
        return error_json("No active project selected", status_code=400)

    try:
        target_dir = _resolve_checkpoint_dir(project_dir, body.timestamp)
    except ValueError:
        return error_json("Checkpoint not found", status_code=404)

    if not target_dir.exists() or not target_dir.is_dir():
        return error_json("Checkpoint not found", status_code=404)

    try:
        restore_from_directory(project_dir, target_dir)
        return ok_json(ok=True)
    except Exception as e:
        return error_json(f"Failed to load checkpoint: {str(e)}", status_code=500)


@router.post("/checkpoints/delete")
async def api_delete_checkpoint(body: CheckpointLoadDeleteRequest) -> JSONResponse:
    project_dir = get_active_project_dir()
    if not project_dir:
        return error_json("No active project selected", status_code=400)

    try:
        target_dir = _resolve_checkpoint_dir(project_dir, body.timestamp)
    except ValueError:
        return error_json("Checkpoint not found", status_code=404)

    if target_dir.exists() and target_dir.is_dir():
        shutil.rmtree(target_dir)

    return ok_json(ok=True)
