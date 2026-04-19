# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines FastAPI dependencies shared across project-scoped routes.

Purpose: Provides a single, reusable FastAPI dependency for resolving
a project name path parameter to a validated project directory Path.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi import Path as FastAPIPath

from augmentedquill.services.projects.projects import get_projects_root


def require_project_path(
    project_name: str = FastAPIPath(..., description="Directory name of the project"),
) -> Path:
    """Resolve a project_name path parameter to its absolute directory Path.

    Raises HTTP 404 if the project directory does not exist or has no story.json.
    """
    project_dir = get_projects_root() / project_name
    if not project_dir.is_dir() or not (project_dir / "story.json").exists():
        raise HTTPException(
            status_code=404, detail=f"Project '{project_name}' not found"
        )
    return project_dir


# Convenience type alias for use in route signatures.
ProjectDep = Annotated[Path, Depends(require_project_path)]
