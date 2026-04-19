# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the projects unit so this responsibility stays isolated, testable, and easy to evolve.

API endpoints for project-related operations including creation, deletion, and management.
"""

from typing import Any
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from augmentedquill.services.projects.projects_api_manage_ops import (
    projects_listing_payload,
    delete_project_response,
    select_project_response,
    create_project_response,
    convert_project_response,
    create_book_response,
    delete_book_response,
    restore_book_response,
)
from augmentedquill.services.projects.projects_api_asset_ops import (
    list_images_response,
    update_image_description_response,
    create_image_placeholder_response,
    upload_image_response,
    delete_image_response,
    restore_image_response,
    get_image_file_response,
    export_project_response,
    import_project_response,
)
from augmentedquill.services.projects.export_epub import export_project_epub_response

from augmentedquill.models.projects import (
    ProjectDeleteRequest,
    ProjectSelectRequest,
    ProjectCreateRequest,
    ProjectConvertRequest,
    BookCreateRequest,
    BookDeleteRequest,
    BookRestoreRequest,
    ImageDescriptionUpdateRequest,
    ImagePlaceholderRequest,
    ImageDeleteRequest,
    ImageRestoreRequest,
    ProjectListResponse,
)

router = APIRouter(tags=["Projects"])


@router.get("/projects", response_model=ProjectListResponse)
async def api_projects() -> ProjectListResponse:
    """Handle the API request to projects."""
    return projects_listing_payload()


@router.post("/projects/delete")
async def api_projects_delete(body: ProjectDeleteRequest) -> JSONResponse:
    """Handle the API request to projects delete."""
    return delete_project_response(body.name)


@router.post("/projects/select")
async def api_projects_select(body: ProjectSelectRequest) -> JSONResponse:
    """Handle the API request to projects select."""
    return select_project_response(body.name)


@router.post("/projects/create")
async def api_projects_create(body: ProjectCreateRequest) -> JSONResponse:
    """Handle the API request to projects create."""
    # language is optional, default occurs downstream
    return create_project_response(body.name, body.type, body.language or "en")


@router.post("/projects/convert")
async def api_projects_convert(body: ProjectConvertRequest) -> JSONResponse:
    """Handle the API request to projects convert."""
    return convert_project_response(body.target_type)


@router.post("/books/create")
async def api_books_create(body: BookCreateRequest) -> JSONResponse:
    """Handle the API request to books create."""
    return create_book_response(body.name)


@router.post("/books/delete")
async def api_books_delete(body: BookDeleteRequest) -> JSONResponse:
    """Handle the API request to books delete."""
    return delete_book_response(body.name)


@router.post("/books/restore")
async def api_books_restore(body: BookRestoreRequest) -> JSONResponse:
    """Handle the API request to books restore."""
    return restore_book_response(body.restore_id)


@router.get("/projects/images/list")
async def api_projects_images_list() -> JSONResponse:
    """Handle the API request to projects images list."""
    return list_images_response()


@router.post("/projects/images/update_description")
async def api_projects_images_update_description(
    body: ImageDescriptionUpdateRequest,
) -> JSONResponse:
    """Handle the API request to projects images update description."""
    return update_image_description_response(body.model_dump())


@router.post("/projects/images/create_placeholder")
async def api_projects_images_create_placeholder(
    body: ImagePlaceholderRequest,
) -> JSONResponse:
    """Handle the API request to projects images create placeholder."""
    return create_image_placeholder_response(body.model_dump())


@router.post("/projects/images/upload")
async def api_projects_images_upload(
    file: UploadFile = File(...), target_name: str | None = None
) -> JSONResponse:
    """Handle the API request to projects images upload."""
    return await upload_image_response(file=file, target_name=target_name)


@router.post("/projects/images/delete")
async def api_projects_images_delete(body: ImageDeleteRequest) -> JSONResponse:
    """Handle the API request to projects images delete."""
    return delete_image_response(body.model_dump())


@router.post("/projects/images/restore")
async def api_projects_images_restore(body: ImageRestoreRequest) -> JSONResponse:
    """Handle the API request to projects images restore."""
    return restore_image_response(body.model_dump())


@router.get("/projects/images/{filename}")
async def api_projects_images_get(filename: str) -> Any:
    """Handle the API request to projects images get."""
    return get_image_file_response(filename)


@router.get("/projects/export")
async def api_projects_export(name: str = None) -> Any:
    """Handle the API request to projects export."""
    return export_project_response(name=name)


@router.get("/projects/export/epub")
async def api_projects_export_epub(name: str = None) -> Any:
    """Handle the API request to projects export epub."""
    return export_project_epub_response(name=name)


@router.post("/projects/import")
async def api_projects_import(file: UploadFile = File(...)) -> Any:
    """Handle the API request to projects import."""
    return await import_project_response(file)
