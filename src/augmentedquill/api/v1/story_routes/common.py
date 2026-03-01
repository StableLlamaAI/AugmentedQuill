# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the common unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from augmentedquill.api.v1.http_responses import error_json
from augmentedquill.services.exceptions import ServiceError


class StoryApiError(ServiceError):
    """Base domain exception for story-related operations.

    Inherits from ``ServiceError`` so the global handler can catch it,
    while preserving backward-compatible subclass names used by story routes.
    """

    default_status_code = 400


class StoryBadRequestError(StoryApiError):
    default_status_code = 400


class StoryNotFoundError(StoryApiError):
    default_status_code = 404


class StoryPersistenceError(StoryApiError):
    default_status_code = 500


async def parse_json_body(request: Request) -> dict:
    try:
        payload = await request.json()
    except Exception as exc:
        raise StoryBadRequestError("Invalid JSON body") from exc
    return payload if isinstance(payload, dict) else {}


def map_story_exception(exc: Exception) -> JSONResponse:
    if isinstance(exc, ServiceError):
        return error_json(exc.detail, exc.status_code)
    if isinstance(exc, HTTPException):
        return error_json(str(exc.detail), exc.status_code)
    return error_json(str(exc), 500)
