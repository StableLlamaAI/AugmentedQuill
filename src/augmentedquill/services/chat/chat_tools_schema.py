# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the chat tools schema unit so this responsibility stays isolated, testable, and easy to evolve.

Chat tool schemas for LLM function calling.

Compatibility shim for legacy imports that resolves schemas from the canonical
decorator-based tool registry.
"""

from augmentedquill.services.chat.chat_tool_decorator import get_registered_tool_schemas

get_story_tools = get_registered_tool_schemas
