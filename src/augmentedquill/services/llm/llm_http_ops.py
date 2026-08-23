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

import asyncio
import datetime
import errno
import socket
import ssl
import traceback
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
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


def _require_caller_id(caller_id: str) -> str:
    """Validate and normalize caller identity used for LLM diagnostics."""
    normalized = str(caller_id or "").strip()
    if not normalized:
        raise ValueError("caller_id is required for LLM requests.")
    return normalized


def _safe_log_headers(headers: dict[str, str] | None) -> dict[str, str]:
    """Return a safe log headers.."""
    return {
        str(k): (
            "REDACTED" if str(k).lower() in ("authorization", "x-api-key") else str(v)
        )
        for k, v in (headers or {}).items()
    }


def _safe_log_body(body: Any) -> Any:
    """Return a safe log body.."""
    if not isinstance(body, dict):
        return body
    import copy

    safe_body = copy.deepcopy(body)
    for key in ("api_key", "secret", "password"):
        if key in safe_body:
            safe_body[key] = "REDACTED"
    return safe_body


def _log_response_body(response: httpx.Response) -> Any:
    """Helper for response body.."""
    content_type = str(response.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        try:
            return response.json()
        except Exception:
            return {"raw": response.text}
    return {"raw": response.text}


# ---------------------------------------------------------------------------
# Retry helpers
# ---------------------------------------------------------------------------

#: Maximum number of automatic retry attempts for transient LLM failures.
_MAX_RETRIES = 3
#: Initial delay in seconds before the first retry; doubles with each attempt.
_RETRY_BACKOFF_BASE_S = 1.0
#: HTTP status codes considered transient and eligible for retry.
_RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
#: Transport-level exception types eligible for retry.
_RETRYABLE_TRANSPORT_ERRORS = (
    httpx.ConnectError,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
)


def _is_retryable(exc: Exception) -> bool:
    """Return True when *exc* represents a transient failure worth retrying."""
    return isinstance(exc, _RETRYABLE_TRANSPORT_ERRORS)


def _classify_transport_error(exc: Exception, url: str) -> tuple[str, str]:
    """Return a (summary, hint) pair turning a raw transport failure into an
    actionable diagnosis.

    Network failures inside containers (Docker) usually come from DNS, egress
    firewalls, proxies or wrong host addressing. Surfacing a categorized
    message (instead of a bare traceback) makes the cause obvious in the Debug
    window and in the raw LLM log.
    """
    if isinstance(exc, httpx.ConnectTimeout):
        return (
            f"Connection to {url} timed out (no response within the configured timeout).",
            (
                "The provider did not respond in time. If you are running in Docker, verify the "
                "container can reach the provider: outbound HTTPS from the container is NAT-ed "
                "through the Docker host, and a host firewall or a required egress proxy can "
                "block it."
            ),
        )
    if isinstance(exc, (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout)):
        return (
            f"Request to {url} timed out while streaming data ({type(exc).__name__}).",
            (
                "The provider stopped responding mid-request. A reverse proxy or firewall that "
                "drops long-lived connections can cause this."
            ),
        )
    if isinstance(exc, httpx.ProxyError):
        return (
            f"Proxy error while connecting to {url}.",
            (
                "The HTTP(S) proxy configured via HTTP_PROXY/HTTPS_PROXY/ALL_PROXY could not "
                "relay the request. Verify the proxy is reachable from the container and that "
                "NO_PROXY is set correctly."
            ),
        )
    if isinstance(exc, httpx.ConnectError):
        cause = exc.__cause__ or exc
        if isinstance(cause, ssl.SSLError):
            return (
                f"TLS/SSL error while connecting to {url}.",
                (
                    f"Certificate or TLS handshake failure: {cause!s}. If a corporate proxy "
                    "performs TLS inspection, the container may reject its certificate."
                ),
            )
        if isinstance(cause, socket.gaierror):
            return (
                f"Could not resolve {url} (DNS lookup failed).",
                (
                    "DNS resolution failed inside the container. Check that the Docker host can "
                    "resolve the provider's hostname and that the container's embedded DNS "
                    "(127.0.0.11) is working. Try a different hostname or the provider's IP "
                    "address."
                ),
            )
        if getattr(cause, "errno", None) in (errno.ENETUNREACH, errno.EHOSTUNREACH):
            return (
                f"Network is unreachable for {url} (errno {getattr(cause, 'errno', None)}).",
                (
                    "The container cannot reach the destination network. A host firewall/egress "
                    "filter may be blocking outbound traffic from the Docker bridge, or the "
                    "destination network does not exist."
                ),
            )
        if isinstance(cause, ConnectionRefusedError):
            return (
                f"Connection refused for {url}.",
                (
                    "Nothing is listening on that host/port from inside the container. If the "
                    "provider runs on the Docker host, remember that 'localhost' inside the "
                    "container is the container itself - use http://host.docker.internal:PORT "
                    "(requires 'extra_hosts: [\"host.docker.internal:host-gateway\"]') or the "
                    "Docker bridge gateway (e.g. http://172.17.0.1:PORT)."
                ),
            )
        if isinstance(cause, (ConnectionResetError, ConnectionAbortedError)):
            return (
                f"Connection to {url} was reset.",
                (
                    "The connection was closed by the peer or an intermediate device. A "
                    "firewall, TLS-inspecting proxy, or rate limiter may have dropped the "
                    "connection."
                ),
            )
        return (
            f"Could not connect to {url}.",
            (
                f"Transport error while connecting: {cause!s}. If you are running in Docker, "
                "verify outbound connectivity from the container (see the Troubleshooting "
                "chapter)."
            ),
        )
    if isinstance(exc, ssl.SSLError):
        return (
            f"TLS/SSL error while connecting to {url}.",
            (
                f"Certificate or TLS handshake failure: {exc!s}. If a corporate proxy performs "
                "TLS inspection, the container may reject its certificate."
            ),
        )
    if isinstance(exc, httpx.ReadError):
        return (
            f"Connection to {url} failed while reading the response.",
            f"Read error: {exc!s}. The provider may have closed the stream unexpectedly.",
        )
    return (
        f"Request to {url} failed: {type(exc).__name__}: {exc!s}",
        "See the raw exception detail below; this is not a recognized network failure.",
    )


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
    log_entry["timestamp_end"] = datetime.datetime.now(datetime.UTC).isoformat()

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
    caller_id: str,
    model_type: str | None = None,
    method: str,
    url: str,
    headers: dict[str, str] | None,
    timeout: httpx.Timeout,
    body: Any = None,
    raise_for_status: bool = False,
) -> httpx.Response:
    """Execute one HTTP request with guaranteed request/response logging."""
    caller_id = _require_caller_id(caller_id)
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
    log_entry["caller_id"] = caller_id
    log_entry["model_type"] = model_type
    add_llm_log(log_entry)

    try:
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            if attempt > 0:
                delay = _RETRY_BACKOFF_BASE_S * (2 ** (attempt - 1))
                await asyncio.sleep(delay)
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.request(
                        method=method, url=url, headers=headers, json=body
                    )
                if (
                    response.status_code in _RETRYABLE_STATUS_CODES
                    and attempt < _MAX_RETRIES
                ):
                    last_exc = None
                    continue
                # A prior attempt may have failed with a transient error (e.g.
                # ReadTimeout). The current attempt succeeded, so the stale
                # exception must not be re-raised — the response is the result.
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                if not _is_retryable(exc) or attempt >= _MAX_RETRIES:
                    raise
        else:
            # All retries exhausted via status code path — use last response.
            pass
        if last_exc is not None:
            raise last_exc
    except Exception as exc:
        # Transport-level failures (DNS, refused, timeout, proxy, TLS) get a
        # categorized, actionable summary so the Debug window and raw log show
        # the cause immediately. Non-network errors keep the full traceback.
        if isinstance(exc, httpx.RequestError):
            summary, hint = _classify_transport_error(exc, url)
            detail = f"{summary}\n\n{hint}\n\n{type(exc).__name__}: {exc!s}"
        else:
            summary = (
                f"An internal error occurred during the LLM request: "
                f"{type(exc).__name__} {exc}"
            )
            detail = traceback.format_exc()
        _finalize_log_entry(log_entry, error=summary, error_detail=detail)
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
    caller_id: str,
    model_type: str | None = None,
    method: str,
    url: str,
    headers: dict[str, str] | None,
    timeout: httpx.Timeout,
    body: Any = None,
) -> AsyncIterator[tuple[httpx.Response, dict[str, Any]]]:
    """Open one streaming HTTP request with guaranteed lifecycle logging."""
    caller_id = _require_caller_id(caller_id)
    _ensure_allowed_request_url(url)
    log_entry = create_log_entry(
        url,
        str(method).upper(),
        _safe_log_headers(headers),
        _safe_log_body(body),
        streaming=True,
    )
    log_entry["caller_id"] = caller_id
    log_entry["model_type"] = model_type
    add_llm_log(log_entry)

    try:
        async with (
            httpx.AsyncClient(timeout=timeout) as client,
            client.stream(
                method=str(method).upper(), url=url, headers=headers, json=body
            ) as response,
        ):
            log_entry["response"]["status_code"] = response.status_code
            yield response, log_entry
    except Exception as exc:
        if isinstance(exc, httpx.RequestError):
            summary, hint = _classify_transport_error(exc, url)
            detail = f"{summary}\n\n{hint}\n\n{type(exc).__name__}: {exc!s}"
        else:
            summary = (
                f"An internal error occurred during the LLM request: "
                f"{type(exc).__name__} {exc}"
            )
            detail = traceback.format_exc()
        _finalize_log_entry(log_entry, error=summary, error_detail=detail)
        raise
    finally:
        if not log_entry.get("timestamp_end"):
            _finalize_log_entry(log_entry)
