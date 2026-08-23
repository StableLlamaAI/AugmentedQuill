# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for the debug connectivity diagnostic service.

Purpose: verify the DNS -> TCP -> HTTP(S) probe chain and that a failure at any
step produces a clear, structured result instead of an uncaught exception.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from augmentedquill.models.debug import ConnectivityStep
from augmentedquill.services.debug.connectivity import (
    run_connectivity_diagnostic,
)


def _step(name: str, ok: bool, detail: str = "") -> ConnectivityStep:
    return ConnectivityStep(name=name, ok=ok, detail=detail)


def test_all_steps_succeed():
    async def _run():
        with (
            patch(
                "augmentedquill.services.debug.connectivity._probe_dns",
                AsyncMock(return_value=_step("dns", True, "Resolved host")),
            ),
            patch(
                "augmentedquill.services.debug.connectivity._probe_tcp",
                AsyncMock(return_value=_step("tcp", True, "TCP ok")),
            ),
            patch(
                "augmentedquill.services.debug.connectivity._probe_http",
                AsyncMock(return_value=_step("http", True, "HTTP 200")),
            ),
        ):
            return await run_connectivity_diagnostic("https://api.openai.com/v1")

    result = asyncio.run(_run())
    assert result.ok is True
    assert result.summary.startswith("Reachable")
    assert [step.name for step in result.steps] == ["url", "dns", "tcp", "http"]


def test_dns_failure_skips_tcp_and_http():
    async def _run():
        with (
            patch(
                "augmentedquill.services.debug.connectivity._probe_dns",
                AsyncMock(return_value=_step("dns", False, "DNS lookup failed")),
            ),
            patch(
                "augmentedquill.services.debug.connectivity._probe_tcp",
                AsyncMock(side_effect=AssertionError("tcp must not run")),
            ),
            patch(
                "augmentedquill.services.debug.connectivity._probe_http",
                AsyncMock(side_effect=AssertionError("http must not run")),
            ),
        ):
            return await run_connectivity_diagnostic("https://api.openai.com/v1")

    result = asyncio.run(_run())
    assert result.ok is False
    assert "dns" in result.summary
    tcp = next(s for s in result.steps if s.name == "tcp")
    assert tcp.ok is False and "Skipped" in tcp.detail


def test_tcp_failure_skips_http():
    async def _run():
        with (
            patch(
                "augmentedquill.services.debug.connectivity._probe_dns",
                AsyncMock(return_value=_step("dns", True, "Resolved host")),
            ),
            patch(
                "augmentedquill.services.debug.connectivity._probe_tcp",
                AsyncMock(return_value=_step("tcp", False, "TCP connect failed")),
            ),
            patch(
                "augmentedquill.services.debug.connectivity._probe_http",
                AsyncMock(side_effect=AssertionError("http must not run")),
            ),
        ):
            return await run_connectivity_diagnostic("https://api.openai.com/v1")

    result = asyncio.run(_run())
    assert result.ok is False
    assert "tcp" in result.summary


def test_invalid_url_is_rejected_without_network_work():
    result = asyncio.run(run_connectivity_diagnostic("not-a-url"))
    assert result.ok is False
    assert result.steps[0].name == "url"
    assert result.steps[0].ok is False


def test_ftp_scheme_is_rejected():
    result = asyncio.run(run_connectivity_diagnostic("ftp://example.com/file"))
    assert result.ok is False
    assert result.steps[0].name == "url"
