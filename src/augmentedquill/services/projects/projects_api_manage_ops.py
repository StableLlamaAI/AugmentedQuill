# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the projects api manage ops unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

import re
import shutil
import json
import base64
from uuid import uuid4
from pathlib import Path

from fastapi.responses import JSONResponse

from augmentedquill.services.exceptions import BadRequestError

from augmentedquill.core.config import load_story_config, save_story_config
from augmentedquill.services.projects.project_helpers import (
    normalize_story_for_frontend,
)
from augmentedquill.services.projects.projects import (
    change_project_type,
    create_new_book,
    create_project,
    delete_project,
    get_active_project_dir,
    list_projects,
    load_registry,
    select_project,
)


def normalize_registry(reg: dict) -> dict:
    cur = reg.get("current") or ""
    if cur:
        cur = Path(cur).name
    recent = [Path(p).name for p in reg.get("recent", []) if p]
    return {"current": cur, "recent": recent}


def projects_listing_payload() -> dict:
    """Projects Listing Payload."""
    reg = load_registry()
    normalized_reg = normalize_registry(reg)
    available = list_projects()
    return {
        "current": normalized_reg["current"],
        "recent": normalized_reg["recent"][:5],
        "available": available,
    }


def delete_project_response(name: str) -> JSONResponse:
    """Delete Project Response."""
    ok, msg = delete_project(name)
    if not ok:
        return JSONResponse(status_code=400, content={"ok": False, "detail": msg})

    reg = load_registry()
    normalized_reg = normalize_registry(reg)
    available = list_projects()
    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "message": msg,
            "registry": normalized_reg,
            "available": available,
        },
    )


def select_project_response(name: str) -> JSONResponse:
    """Select Project Response."""
    ok, msg = select_project(name)
    if not ok:
        return JSONResponse(status_code=400, content={"ok": False, "detail": msg})

    reg = load_registry()
    normalized_reg = normalize_registry(reg)
    active = get_active_project_dir()
    try:
        story = load_story_config((active / "story.json") if active else None)
    except ValueError as e:
        error_msg = str(e)
        if "outdated version" in error_msg:
            match = re.search(r"version (\d+).*Current version is (\d+)", error_msg)
            if match:
                current_version = int(match.group(1))
                required_version = int(match.group(2))
                return JSONResponse(
                    status_code=200,
                    content={
                        "ok": True,
                        "message": msg,
                        "registry": normalized_reg,
                        "story": None,
                        "error": "version_outdated",
                        "current_version": current_version,
                        "required_version": required_version,
                    },
                )
        elif "Invalid story config" in error_msg or "unknown version" in error_msg:
            return JSONResponse(
                status_code=200,
                content={
                    "ok": True,
                    "message": msg,
                    "registry": normalized_reg,
                    "story": None,
                    "error": "invalid_config",
                    "error_message": error_msg,
                },
            )
        raise

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "message": msg,
            "registry": normalized_reg,
            "story": normalize_story_for_frontend(story),
        },
    )


def create_project_response(
    name: str, project_type: str, language: str = "en"
) -> JSONResponse:
    """Create Project Response."""
    ok, msg = create_project(name, project_type=project_type, language=language)
    if not ok:
        return JSONResponse(status_code=400, content={"ok": False, "detail": msg})

    reg = load_registry()
    normalized_reg = normalize_registry(reg)
    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None)
    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "message": msg,
            "registry": normalized_reg,
            "story": normalize_story_for_frontend(story),
        },
    )


def convert_project_response(new_type: str) -> JSONResponse:
    """Convert Project Response."""
    if not new_type:
        raise BadRequestError("new_type is required")

    ok, msg = change_project_type(new_type)
    if not ok:
        return JSONResponse(status_code=400, content={"ok": False, "detail": msg})

    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None)
    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "message": msg,
            "story": normalize_story_for_frontend(story),
        },
    )


def create_book_response(title: str) -> JSONResponse:
    """Create Book Response."""
    if not title:
        raise BadRequestError("Book title is required")

    try:
        bid = create_new_book(title)
        active = get_active_project_dir()
        story = load_story_config((active / "story.json") if active else None)
        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "message": "Book created",
                "book_id": bid,
                "story": normalize_story_for_frontend(story),
            },
        )
    except ValueError as e:
        return JSONResponse(status_code=400, content={"ok": False, "detail": str(e)})


def _deleted_books_dir(active: Path) -> Path:
    path = active / ".aq_history" / "deleted_books"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _snapshot_book_for_restore(active: Path, story: dict, book_id: str) -> str:
    books = story.get("books", [])
    target_idx = next(
        (idx for idx, book in enumerate(books) if str(book.get("id")) == str(book_id)),
        -1,
    )
    if target_idx < 0:
        return ""

    target_book = books[target_idx]
    book_dir = active / "books" / str(book_id)
    files: dict[str, str] = {}
    if book_dir.exists():
        for file_path in book_dir.rglob("*"):
            if file_path.is_file():
                rel = str(file_path.relative_to(book_dir))
                files[rel] = base64.b64encode(file_path.read_bytes()).decode("ascii")

    restore_id = uuid4().hex
    snapshot = {
        "restore_id": restore_id,
        "book_id": str(book_id),
        "book": target_book,
        "index": target_idx,
        "files": files,
    }
    (_deleted_books_dir(active) / f"{restore_id}.json").write_text(
        json.dumps(snapshot), encoding="utf-8"
    )
    return restore_id


def delete_book_response(book_id: str) -> JSONResponse:
    """Delete Book Response."""
    if not book_id:
        raise BadRequestError("book_id is required")

    active = get_active_project_dir()
    if not active:
        raise BadRequestError("No active project")

    story_path = active / "story.json"
    story = load_story_config(story_path) or {}
    books = story.get("books", [])

    exists = any(str(b.get("id")) == str(book_id) for b in books)
    if not exists:
        return JSONResponse(
            status_code=404, content={"ok": False, "detail": "Book not found"}
        )

    restore_id = _snapshot_book_for_restore(active, story, book_id)

    story["books"] = [b for b in books if str(b.get("id")) != str(book_id)]
    save_story_config(story_path, story)

    book_dir = active / "books" / book_id
    if book_dir.exists():
        shutil.rmtree(book_dir)

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "message": "Book deleted",
            "story": normalize_story_for_frontend(story),
            "restore_id": restore_id,
        },
    )


def restore_book_response(restore_id: str) -> JSONResponse:
    """Restore a previously deleted book from a snapshot."""
    if not restore_id:
        raise BadRequestError("restore_id is required")

    active = get_active_project_dir()
    if not active:
        raise BadRequestError("No active project")

    snapshot_path = _deleted_books_dir(active) / f"{restore_id}.json"
    if not snapshot_path.exists():
        return JSONResponse(
            status_code=404,
            content={"ok": False, "detail": "Restore snapshot not found"},
        )

    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    book_id = str(snapshot.get("book_id") or "")
    book_data = snapshot.get("book") or {}
    insert_index = int(snapshot.get("index", 0))
    files: dict[str, str] = snapshot.get("files") or {}

    if not book_id or not isinstance(book_data, dict):
        return JSONResponse(
            status_code=400,
            content={"ok": False, "detail": "Invalid restore snapshot payload"},
        )

    story_path = active / "story.json"
    story = load_story_config(story_path) or {}
    books = story.get("books") or []

    if any(str(book.get("id")) == book_id for book in books):
        return JSONResponse(
            status_code=409,
            content={"ok": False, "detail": "Book already exists"},
        )

    safe_index = max(0, min(insert_index, len(books)))
    books.insert(safe_index, book_data)
    story["books"] = books
    save_story_config(story_path, story)

    book_dir = active / "books" / book_id
    book_dir.mkdir(parents=True, exist_ok=True)
    for rel, encoded in files.items():
        target = (book_dir / rel).resolve()
        if not target.is_relative_to(book_dir.resolve()):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(encoded.encode("ascii")))

    snapshot_path.unlink(missing_ok=True)

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "message": "Book restored",
            "book_id": book_id,
            "story": normalize_story_for_frontend(story),
        },
    )
