# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the common unit so this responsibility stays isolated, testable, and easy to evolve."""

from fastapi import Request

from augmentedquill.api.v1.request_body import parse_json_object_body


async def parse_json_body(request: Request) -> dict:
    """Parse json body."""
    return await parse_json_object_body(request)
