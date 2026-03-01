# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the chat tool dispatcher unit so this responsibility stays isolated, testable, and easy to evolve.

Compatibility shim for legacy imports that dispatches via the canonical
decorator-based tool runtime.
"""

from __future__ import annotations

from augmentedquill.services.chat.chat_tool_decorator import execute_registered_tool


async def exec_chat_tool(
    name: str, args_obj: dict, call_id: str, payload: dict, mutations: dict
) -> dict:
    """Dispatch a single tool call using the canonical chat tool runtime."""
    return await execute_registered_tool(name, args_obj, call_id, payload, mutations)
