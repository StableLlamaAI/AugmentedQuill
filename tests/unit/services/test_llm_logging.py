# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for the LLM logging utilities."""

from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

import httpx

from augmentedquill.services.llm import llm_http_ops, llm_logging


class LlmLoggingTest(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # clear the global list so each test starts fresh
        llm_logging.llm_logs.clear()

    async def test_create_log_entry_include_response_flag(self):
        entry = llm_logging.create_log_entry(
            "https://example.com", "GET", {}, None, streaming=False
        )
        self.assertIsInstance(entry.get("response"), dict)

        entry2 = llm_logging.create_log_entry(
            "https://example.com",
            "GET",
            {},
            None,
            streaming=False,
            include_response=False,
        )
        self.assertIsNone(entry2.get("response"))

    async def test_finalize_populates_missing_response(self):
        entry = llm_logging.create_log_entry(
            "url", "POST", {}, {"a": 1}, streaming=False, include_response=False
        )
        # at this point response is None
        self.assertIsNone(entry.get("response"))
        # finalize should create a default response container
        llm_http_ops._finalize_log_entry(
            entry, status_code=418, response_body={"ok": False}
        )
        self.assertIsInstance(entry.get("response"), dict)
        self.assertEqual(entry["response"]["status_code"], 418)
        self.assertEqual(entry["response"]["body"], {"ok": False})

    async def test_logged_request_initial_entry_has_null_response(self):
        # stub the httpx client so no real network call is made
        dummy = AsyncMock()

        class DummyResp:
            status_code = 200
            headers = {}
            text = ""

            def json(self):
                return {"data": []}

        dummy.return_value.request = AsyncMock(return_value=DummyResp())
        dummy.__aenter__.return_value = dummy.return_value

        seen = []

        def record(entry):
            # store a shallow copy to freeze the state at call time
            seen.append(entry.copy())

        with patch(
            "augmentedquill.services.llm.llm_http_ops.httpx.AsyncClient",
            return_value=dummy,
        ):
            with patch.object(llm_http_ops, "add_llm_log", new=record):
                # perform the request, ignore the result
                await llm_http_ops.logged_request(
                    caller_id="tests.llm_logging.initial_entry",
                    method="GET",
                    url="http://example.invalid",
                    headers={},
                    timeout=httpx.Timeout(1.0),
                )

        # two add_llm_log calls are expected (start + finalize), but same ID
        # should be replaced by add_llm_log logic in llm_logging.
        self.assertGreaterEqual(len(seen), 2)
        self.assertEqual(seen[0]["id"], seen[1]["id"])
        self.assertIsNone(seen[0].get("response"))
        self.assertIsNotNone(seen[1].get("response"))

    async def test_logged_request_exception_includes_traceback(self):
        """When the HTTP client throws, we log the full traceback in error_detail."""

        class BrokenClient:
            def __init__(self, timeout):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def request(self, *args, **kwargs):
                raise RuntimeError("boom")

        seen = []

        def record(entry):
            seen.append(entry.copy())

        with patch(
            "augmentedquill.services.llm.llm_http_ops.httpx.AsyncClient",
            return_value=BrokenClient(None),
        ):
            with patch.object(llm_http_ops, "add_llm_log", new=record):
                with self.assertRaises(RuntimeError):
                    await llm_http_ops.logged_request(
                        caller_id="tests.llm_logging.exception_entry",
                        method="GET",
                        url="http://example.invalid",
                        headers={},
                        timeout=httpx.Timeout(1.0),
                    )

        # ensure we recorded at least one entry and its error_detail contains the
        # exception message and a stack trace.
        self.assertGreaterEqual(len(seen), 1)
        err = seen[-1]["response"]["error_detail"]
        self.assertIsInstance(err, str)
        self.assertIn("RuntimeError", err)
        self.assertIn("boom", err)
