# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for LLM HTTP transport-error classification.

Purpose: verify that network failures (DNS, refused, timeout, proxy, TLS)
are turned into categorized, actionable messages that surface in the Debug
window and raw LLM log.
"""

import asyncio
import errno
import socket
import ssl
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from augmentedquill.services.llm.llm_http_ops import (
    _classify_transport_error,
    is_loopback_url,
    logged_request,
)


def _request() -> MagicMock:
    return MagicMock()


def test_dns_failure_is_classified():
    exc = httpx.ConnectError("boom", request=_request())
    exc.__cause__ = socket.gaierror(-2, "Name or service not known")
    summary, hint = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "DNS lookup failed" in summary
    assert "DNS" in hint


def test_connection_refused_is_classified():
    exc = httpx.ConnectError("boom", request=_request())
    exc.__cause__ = ConnectionRefusedError(111, "Connection refused")
    summary, hint = _classify_transport_error(exc, "http://localhost:11434/v1")
    assert "Connection refused" in summary
    assert "host.docker.internal" in hint


def test_network_unreachable_is_classified():
    exc = httpx.ConnectError("boom", request=_request())
    exc.__cause__ = OSError(errno.ENETUNREACH, "Network is unreachable")
    summary, _ = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "Network is unreachable" in summary


def test_connect_timeout_is_classified():
    exc = httpx.ConnectTimeout("timed out", request=_request())
    summary, hint = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "timed out" in summary
    assert "Docker" in hint


def test_read_timeout_is_classified():
    exc = httpx.ReadTimeout("timed out", request=_request())
    summary, _ = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "timed out while streaming" in summary


def test_proxy_error_is_classified():
    exc = httpx.ProxyError("proxy down", request=_request())
    summary, hint = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "Proxy error" in summary
    assert "HTTP_PROXY" in hint


def test_tls_error_is_classified():
    exc = httpx.ConnectError("boom", request=_request())
    exc.__cause__ = ssl.SSLError("certificate verify failed")
    summary, hint = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "TLS/SSL error" in summary
    assert "certificate" in hint.lower()


def test_connection_reset_is_classified():
    exc = httpx.ConnectError("boom", request=_request())
    exc.__cause__ = ConnectionResetError(104, "Connection reset by peer")
    summary, _ = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "reset" in summary.lower()


def test_unknown_connect_error_falls_back_to_generic():
    exc = httpx.ConnectError("mystery", request=_request())
    exc.__cause__ = OSError(1, "Operation not permitted")
    summary, _ = _classify_transport_error(exc, "https://api.openai.com/v1")
    assert "Could not connect" in summary


def test_plain_exception_is_not_classified_as_network():
    summary, _ = _classify_transport_error(ValueError("not network"), "https://x/v1")
    assert "Request to https://x/v1 failed" in summary


# ─── Loopback proxy bypass ───────────────────────────────────────────────────


def test_loopback_urls_are_detected():
    assert is_loopback_url("http://localhost:8080/v1") is True
    assert is_loopback_url("http://127.0.0.1:11434/v1") is True
    assert is_loopback_url("http://127.0.0.2:8080/v1") is True
    assert is_loopback_url("http://[::1]:8080/v1") is True
    assert is_loopback_url("http://0.0.0.0:8080/v1") is True
    assert is_loopback_url("http://LOCALHOST:8080/v1") is True
    assert is_loopback_url("http://host.docker.internal:11434/v1") is True
    assert is_loopback_url("http://host-gateway:11434/v1") is True


def test_non_loopback_urls_are_not_detected():
    assert is_loopback_url("https://api.openai.com/v1") is False
    assert is_loopback_url("http://192.168.1.10:8080/v1") is False
    assert is_loopback_url("http://localhost.evil.com/v1") is False


def _capture_client_kwargs(url: str, status: int = 200) -> dict:
    """Run logged_request and return the kwargs AsyncClient was created with."""
    captured: dict = {}

    async def _run():
        resp = MagicMock(spec=httpx.Response)
        resp.status_code = status
        resp.headers = {"content-type": "application/json"}
        resp.json.return_value = {}
        resp.text = ""
        resp.raise_for_status = MagicMock()
        with (
            patch("httpx.AsyncClient") as mock_client_cls,
            patch("augmentedquill.services.llm.llm_http_ops.add_llm_log"),
            patch(
                "augmentedquill.services.llm.llm_http_ops.create_log_entry",
                return_value={},
            ),
        ):
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__.return_value = mock_client
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.request = AsyncMock(return_value=resp)

            await logged_request(
                caller_id="test",
                method="POST",
                url=url,
                headers={},
                timeout=httpx.Timeout(5.0),
                body={},
            )
            captured.update(mock_client_cls.call_args.kwargs)

    asyncio.run(_run())
    return captured


def test_local_llm_bypasses_system_proxy():
    kwargs = _capture_client_kwargs("http://localhost:8080/v1")
    assert kwargs.get("trust_env") is False


def test_cloud_provider_still_uses_proxy_env():
    kwargs = _capture_client_kwargs("https://api.openai.com/v1")
    assert kwargs.get("trust_env") is True
