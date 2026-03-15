# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the project snapshots unit so this responsibility stays isolated, testable, and easy to evolve."""

import base64
import shutil
from pathlib import Path
from typing import Dict


def iter_project_files(project_dir: Path):
    """Yield relative file paths for snapshot-able project files."""
    for path in project_dir.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(project_dir)
        rel_parts = rel.parts
        if not rel_parts:
            continue
        if rel_parts[0] in {".aq_history", "chats", "checkpoints"}:
            continue
        yield rel


def capture_project_snapshot(project_dir: Path) -> Dict[str, str]:
    """Capture project files as base64-encoded bytes keyed by relative path."""
    snapshot: Dict[str, str] = {}
    for rel_path in iter_project_files(project_dir):
        abs_path = project_dir / rel_path
        snapshot[str(rel_path)] = base64.b64encode(abs_path.read_bytes()).decode(
            "ascii"
        )
    return snapshot


def restore_project_snapshot(project_dir: Path, snapshot: Dict[str, str]):
    """Replace project files with the exact snapshot content."""
    expected = set(snapshot.keys())
    current = {str(rel): rel for rel in iter_project_files(project_dir)}

    for rel_str, rel_path in current.items():
        if rel_str not in expected:
            (project_dir / rel_path).unlink(missing_ok=True)

    for rel_str, encoded in snapshot.items():
        rel_path = Path(rel_str)
        abs_path = project_dir / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(base64.b64decode(encoded.encode("ascii")))


def snapshot_to_directory(project_dir: Path, target_dir: Path):
    """Copy all snapshot-able project files to a target directory structure."""
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in iter_project_files(project_dir):
        src_path = project_dir / rel_path
        dst_path = target_dir / rel_path
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)


def restore_from_directory(project_dir: Path, source_dir: Path):
    """Restore project state from a checkpoint directory."""
    # First delete existing files that should be overwritten or removed
    for rel_path in iter_project_files(project_dir):
        (project_dir / rel_path).unlink(missing_ok=True)

    # Then copy all files from the snapshot directory
    if source_dir.exists():
        for path in source_dir.rglob("*"):
            if not path.is_file():
                continue
            rel_path = path.relative_to(source_dir)

            # Additional safety check
            rel_parts = rel_path.parts
            if rel_parts and rel_parts[0] in {".aq_history", "chats", "checkpoints"}:
                continue

            dst_path = project_dir / rel_path
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dst_path)
