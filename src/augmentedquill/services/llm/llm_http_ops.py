# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the llm http ops unit so this responsibility stays isolated, testable, and easy to evolve.

Purpose: centralize LLM HTTP communication and guarantee logging for every request.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
import datetime
import os
import traceback
from urllib.parse import urlparse

import httpx

from augmentedquill.services.llm.llm_logging import add_llm_log, create_log_entry


def _ensure_allowed_request_url(url: str) -> None:
    """Validate outbound target URL with lightweight SSRF guardrails.

    Users can configure arbitrary internet endpoints for LLM providers, so we
    only enforce structural URL safety here.
    """
    parsed = urlparse(str(url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only HTTP(S) URLs are allowed for outbound LLM requests.")
    if parsed.username or parsed.password or any(c in parsed.netloc for c in "[]"):
        raise ValueError("Potentially dangerous URL format for outbound LLM request.")


def _relpath_for_log(path: str) -> str:
    """Return a stable, readable path for log output."""
    try:
        return os.path.relpath(path, start=os.getcwd())
    except Exception:
        return path


def _resolve_call_origin() -> str:
    """Infer a compact origin string for the current LLM request."""
    stack = traceback.extract_stack()

    app_frames = []
    for frame in stack:
        filename = str(frame.filename)
        normalized = filename.replace("\\", "/")
        if "/augmentedquill/" not in normalized:
            continue
        if normalized.endswith("/llm_http_ops.py"):
            continue
        if normalized.endswith("/llm_logging.py"):
            continue
        app_frames.append(frame)

    if not app_frames:
        return "unknown:0 unknown"

    caller = app_frames[-1]
    return (
        f"{_relpath_for_log(str(caller.filename))}:{int(caller.lineno)}"
        f" {str(caller.name)}"
    )


def _safe_log_headers(headers: dict[str, str] | None) -> dict[str, str]:
    return {
        str(k): (
            "REDACTED" if str(k).lower() in ("authorization", "x-api-key") else str(v)
        )
        for k, v in (headers or {}).items()
    }


def _safe_log_body(body: Any) -> Any:
    if not isinstance(body, dict):
        return body
    safe_body = body.copy()
    for key in ("api_key", "secret", "password"):
        if key in safe_body:
            safe_body[key] = "REDACTED"
    return safe_body


def _log_response_body(response: httpx.Response) -> Any:
    content_type = str(response.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        try:
            return response.json()
        except Exception:
            return {"raw": response.text}
    return {"raw": response.text}


def _finalize_log_entry(
    log_entry: dict,
    *,
    status_code: int | None = None,
    response_body: Any | None = None,
    error: str | None = None,
    error_detail: str | None = None,
) -> None:
    """Fill in the trailing fields of a log entry and write it.

    Callers may pass in a log entry that was created with
    ``include_response=False``; in that case ``response`` will be ``None`` and
    we need to build a default structure before setting individual fields.
    """
    log_entry["timestamp_end"] = datetime.datetime.now().isoformat()

    # ensure a response container exists so downstream code can index it
    if log_entry.get("response") is None:
        log_entry["response"] = {
            "status_code": None,
            "streaming": False,
            "chunks": None,
            "full_content": None,
            "body": None,
            "error_detail": None,
        }

    if status_code is not None:
        log_entry["response"]["status_code"] = status_code
    if response_body is not None:
        log_entry["response"]["body"] = response_body
    if error is not None:
        log_entry["response"]["error"] = error
    if error_detail is not None:
        log_entry["response"]["error_detail"] = error_detail
    add_llm_log(log_entry)


async def logged_request(
    *,
    method: str,
    url: str,
    headers: dict[str, str] | None,
    timeout: httpx.Timeout,
    body: Any = None,
    raise_for_status: bool = False,
) -> httpx.Response:
    """Execute one HTTP request with guaranteed request/response logging."""
    _ensure_allowed_request_url(url)
    # log the request start; we intentionally omit the response object here
    # (it will be filled in later when the request completes).  setting the
    # field to ``None`` keeps the raw log easier to read and avoids confusion
    # when inspecting the dump.
    log_entry = create_log_entry(
        url,
        str(method).upper(),
        _safe_log_headers(headers),
        _safe_log_body(body),
        streaming=False,
        include_response=False,
    )
    log_entry["origin"] = _resolve_call_origin()
    add_llm_log(log_entry)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method, url=url, headers=headers, json=body
            )
    except Exception as exc:
        # For the common case of a ReadTimeout or other transport-level
        # error, we don't need the entire Python traceback in the log; the
        # message is usually sufficient and saves space.  Otherwise fall back
        # to formatting the full traceback for diagnostics.
        if isinstance(exc, (httpx.ReadTimeout, httpx.RequestError)):
            detail = f"{type(exc).__name__}: {str(exc)}"
        else:
            detail = traceback.format_exc()
        _finalize_log_entry(
            log_entry,
            error=f"An internal error occurred during the LLM request: {type(exc).__name__} {exc}",
            error_detail=detail,
        )
        raise

    response_body = _log_response_body(response)
    error = f"HTTP {response.status_code}" if response.status_code >= 400 else None
    _finalize_log_entry(
        log_entry,
        status_code=response.status_code,
        response_body=response_body,
        error=error,
    )

    if raise_for_status:
        response.raise_for_status()
    return response


@asynccontextmanager
async def logged_stream_request(
    *,
    method: str,
    url: str,
    headers: dict[str, str] | None,
    timeout: httpx.Timeout,
    body: Any = None,
) -> AsyncIterator[tuple[httpx.Response, dict[str, Any]]]:
    """Open one streaming HTTP request with guaranteed lifecycle logging."""
    _ensure_allowed_request_url(url)
    log_entry = create_log_entry(
        url,
        str(method).upper(),
        _safe_log_headers(headers),
        _safe_log_body(body),
        streaming=True,
    )
    log_entry["origin"] = _resolve_call_origin()
    add_llm_log(log_entry)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                method=str(method).upper(), url=url, headers=headers, json=body
            ) as response:
                log_entry["response"]["status_code"] = response.status_code
                yield response, log_entry
    except Exception as exc:
        tb = traceback.format_exc()
        _finalize_log_entry(
            log_entry,
            error=f"An internal error occurred during the LLM request: {type(exc).__name__} {exc}",
            error_detail=tb,
        )
        raise
    finally:
        if not log_entry.get("timestamp_end"):
            _finalize_log_entry(log_entry)
