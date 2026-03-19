# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Path safety utilities shared across API modules."""

from __future__ import annotations

from pathlib import Path


def safe_child_path(base: Path, *parts: str) -> Path:
    """Return a resolved path guaranteed to stay within *base*.

    Raises ValueError if the resolved candidate would escape the base directory
    (i.e. path traversal detected).
    """
    base_resolved = base.resolve()
    candidate = base_resolved.joinpath(*parts).resolve()
    if not candidate.is_relative_to(base_resolved):
        raise ValueError("Path traversal detected")
    return candidate
