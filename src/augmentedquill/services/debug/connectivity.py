# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the connectivity unit so this responsibility stays isolated, testable, and easy to evolve.

Purpose: run a lightweight outbound connectivity diagnostic (DNS -> TCP ->
HTTP(S)) from the backend process, so users can tell whether a container can
reach an LLM provider at all — the classic Docker failure mode — versus the
provider rejecting the request (auth, CORS, model not found, …).
"""

from __future__ import annotations

import asyncio
import socket
from urllib.parse import urlparse

import httpx

from augmentedquill.models.debug import ConnectivityResult, ConnectivityStep
from augmentedquill.services.llm.llm_http_ops import is_loopback_url


def _host_port(url: str) -> tuple[str, int]:
    """Extract (host, port) from a validated base URL."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return host, port


async def _probe_dns(host: str) -> ConnectivityStep:
    """Resolve *host* via the system resolver (same path the container uses)."""
    try:
        loop = asyncio.get_running_loop()
        infos = await asyncio.wait_for(
            loop.getaddrinfo(host, None, type=socket.SOCK_STREAM), timeout=10.0
        )
        addresses = sorted({info[4][0] for info in infos})
        detail = f"Resolved {host} to {', '.join(addresses) or 'no addresses'}"
        return ConnectivityStep(name="dns", ok=True, detail=detail)
    except socket.gaierror as exc:
        return ConnectivityStep(
            name="dns", ok=False, detail=f"DNS lookup failed: {exc!s}"
        )
    except TimeoutError:
        return ConnectivityStep(name="dns", ok=False, detail="DNS lookup timed out")
    except Exception as exc:
        return ConnectivityStep(
            name="dns", ok=False, detail=f"DNS lookup error: {exc!s}"
        )


async def _probe_tcp(host: str, port: int, timeout_s: float) -> ConnectivityStep:
    """Open a raw TCP connection to *host:port*."""
    target = f"{host}:{port}"
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout_s
        )
        writer.close()
        await writer.wait_closed()
        return ConnectivityStep(
            name="tcp", ok=True, detail=f"TCP connection to {target} succeeded"
        )
    except TimeoutError:
        return ConnectivityStep(
            name="tcp", ok=False, detail=f"TCP connect to {target} timed out"
        )
    except Exception as exc:
        return ConnectivityStep(
            name="tcp", ok=False, detail=f"TCP connect to {target} failed: {exc!s}"
        )


async def _probe_http(url: str, timeout_s: float) -> ConnectivityStep:
    """Issue a plain GET to *url*; any HTTP response proves the path works."""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_s),
            follow_redirects=False,
            # A local LLM must never be routed through a system proxy.
            trust_env=not is_loopback_url(url),
        ) as client:
            response = await client.get(url)
        return ConnectivityStep(
            name="http",
            ok=True,
            detail=f"HTTP {response.status_code} from {url} (any response proves reachability)",
        )
    except httpx.RequestError as exc:
        return ConnectivityStep(
            name="http", ok=False, detail=f"Request to {url} failed: {exc!s}"
        )
    except Exception as exc:
        return ConnectivityStep(
            name="http", ok=False, detail=f"Request to {url} failed: {exc!s}"
        )


async def run_connectivity_diagnostic(
    base_url: str, *, timeout_s: float = 10.0
) -> ConnectivityResult:
    """Diagnose outbound reachability of *base_url* from this process.

    Returns one step per phase so callers can see exactly where the chain
    breaks (invalid URL, DNS failure, TCP refusal, HTTP/TLS error).
    """
    url = str(base_url or "").strip()
    steps: list[ConnectivityStep] = []

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        steps.append(
            ConnectivityStep(
                name="url", ok=False, detail=f"Invalid URL (need http/https): {url!r}"
            )
        )
        return ConnectivityResult(
            ok=False,
            url=url,
            summary="Invalid URL — only http/https targets are supported",
            steps=steps,
        )
    steps.append(
        ConnectivityStep(name="url", ok=True, detail=f"Valid {parsed.scheme} URL")
    )

    host, port = _host_port(url)

    dns_step = await _probe_dns(host)
    steps.append(dns_step)

    if dns_step.ok:
        tcp_step = await _probe_tcp(host, port, timeout_s)
    else:
        tcp_step = ConnectivityStep(
            name="tcp", ok=False, detail="Skipped: DNS resolution failed"
        )
    steps.append(tcp_step)

    if tcp_step.ok:
        http_step = await _probe_http(url, timeout_s)
    else:
        http_step = ConnectivityStep(
            name="http", ok=False, detail="Skipped: TCP connection failed"
        )
    steps.append(http_step)

    failed = [step for step in steps if not step.ok]
    if not failed:
        summary = f"Reachable: {url} (DNS, TCP and HTTP(S) all succeeded)."
    else:
        summary = f"Blocked at the '{failed[0].name}' step: {failed[0].detail}"
    return ConnectivityResult(ok=not failed, url=url, summary=summary, steps=steps)
