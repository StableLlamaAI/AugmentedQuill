# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import JSONResponse
from app.helpers.projects_api_manage_ops import (
    projects_listing_payload,
    delete_project_response,
    select_project_response,
    create_project_response,
    convert_project_response,
    create_book_response,
    delete_book_response,
)
from app.helpers.projects_api_request_ops import (
    parse_json_body,
    payload_value,
)
from app.helpers.projects_api_asset_ops import (
    list_images_response,
    update_image_description_response,
    create_image_placeholder_response,
    upload_image_response,
    delete_image_response,
    get_image_file_response,
    export_project_response,
    import_project_response,
)

router = APIRouter()


@router.get("/api/projects")
async def api_projects() -> dict:
    return projects_listing_payload()


@router.post("/api/projects/delete")
async def api_projects_delete(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    name = payload_value(payload, "name", "")
    return delete_project_response(name)


@router.post("/api/projects/select")
async def api_projects_select(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    name = payload_value(payload, "name", "")
    return select_project_response(name)


@router.post("/api/projects/create")
async def api_projects_create(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    name = payload_value(payload, "name", "")
    project_type = payload_value(payload, "type", "novel")

    return create_project_response(name, project_type)


@router.post("/api/projects/convert")
async def api_projects_convert(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    new_type = payload_value(payload, "new_type")
    return convert_project_response(new_type)


@router.post("/api/books/create")
async def api_books_create(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    title = payload_value(payload, "title")
    return create_book_response(title)


@router.post("/api/books/delete")
async def api_books_delete(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    book_id = payload_value(payload, "book_id")
    return delete_book_response(book_id)


@router.get("/api/projects/images/list")
async def api_list_images() -> JSONResponse:
    return list_images_response()


@router.post("/api/projects/images/update_description")
async def api_update_image_description(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    return update_image_description_response(payload)


@router.post("/api/projects/images/create_placeholder")
async def api_create_image_placeholder(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    return create_image_placeholder_response(payload)


@router.post("/api/projects/images/upload")
async def api_upload_image(
    file: UploadFile = File(...), target_name: str | None = None
) -> JSONResponse:
    return await upload_image_response(file=file, target_name=target_name)


@router.post("/api/projects/images/delete")
async def api_delete_image(request: Request) -> JSONResponse:
    payload = await parse_json_body(request)
    return delete_image_response(payload)


@router.get("/api/projects/images/{filename}")
async def api_projects_get_image(filename: str):
    return get_image_file_response(filename)


@router.get("/api/projects/export")
async def api_projects_export(name: str = None):
    return export_project_response(name=name)


@router.post("/api/projects/import")
async def api_projects_import(file: UploadFile = File(...)):
    return await import_project_response(file)
