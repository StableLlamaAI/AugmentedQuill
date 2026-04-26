# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test project file locking unit so this responsibility stays isolated, testable, and easy to evolve.

Purpose: Verify that concurrent writes to the same project directory are
serialised by the per-project asyncio lock introduced in project_locks.py.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from augmentedquill.services.projects.project_locks import get_project_lock, run_locked


class TestGetProjectLock:
    def test_same_dir_same_lock(self, tmp_path: Path) -> None:
        lock1 = get_project_lock(tmp_path)
        lock2 = get_project_lock(tmp_path)
        assert lock1 is lock2

    def test_different_dirs_different_locks(self, tmp_path: Path) -> None:
        dir_a = tmp_path / "a"
        dir_a.mkdir()
        dir_b = tmp_path / "b"
        dir_b.mkdir()
        lock_a = get_project_lock(dir_a)
        lock_b = get_project_lock(dir_b)
        assert lock_a is not lock_b

    def test_resolves_symlink(self, tmp_path: Path) -> None:
        real_dir = tmp_path / "real"
        real_dir.mkdir()
        link_dir = tmp_path / "link"
        link_dir.symlink_to(real_dir)
        # Both resolved paths must yield the same lock.
        lock_real = get_project_lock(real_dir)
        lock_link = get_project_lock(link_dir)
        assert lock_real is lock_link


class TestRunLocked:
    def test_run_locked_executes_function(self, tmp_path: Path) -> None:
        result = asyncio.run(run_locked(tmp_path, lambda: 42))
        assert result == 42

    def test_run_locked_serialises_concurrent_writes(self, tmp_path: Path) -> None:
        """Two coroutines writing the same file should not interleave."""
        target = tmp_path / "counter.json"
        target.write_text(json.dumps({"n": 0}), encoding="utf-8")

        def increment() -> None:
            data = json.loads(target.read_text(encoding="utf-8"))
            data["n"] += 1
            target.write_text(json.dumps(data), encoding="utf-8")

        async def run_concurrent() -> None:
            await asyncio.gather(
                run_locked(tmp_path, increment),
                run_locked(tmp_path, increment),
                run_locked(tmp_path, increment),
            )

        asyncio.run(run_concurrent())
        final = json.loads(target.read_text(encoding="utf-8"))
        assert final["n"] == 3

    def test_run_locked_propagates_exception(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="boom"):
            asyncio.run(
                run_locked(tmp_path, lambda: (_ for _ in ()).throw(ValueError("boom")))
            )
