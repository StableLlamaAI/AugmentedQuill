# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test request body unit so this responsibility stays isolated, testable, and easy to evolve."""

from unittest import IsolatedAsyncioTestCase

from fastapi import HTTPException

from augmentedquill.api.v1.request_body import parse_json_object_body


class _DummyRequest:
    def __init__(self, payload=None, err: Exception | None = None):
        self._payload = payload
        self._err = err

    async def json(self):
        if self._err is not None:
            raise self._err
        return self._payload


class RequestBodyTest(IsolatedAsyncioTestCase):
    async def test_parse_json_object_body_returns_dict(self):
        request = _DummyRequest(payload={"a": 1})
        parsed = await parse_json_object_body(request)  # type: ignore[arg-type]
        self.assertEqual(parsed, {"a": 1})

    async def test_parse_json_object_body_normalizes_non_object_payload(self):
        request = _DummyRequest(payload=[1, 2, 3])
        parsed = await parse_json_object_body(request)  # type: ignore[arg-type]
        self.assertEqual(parsed, {})

    async def test_parse_json_object_body_raises_http_400_by_default(self):
        request = _DummyRequest(err=ValueError("bad-json"))
        with self.assertRaises(HTTPException) as ctx:
            await parse_json_object_body(request)  # type: ignore[arg-type]
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(str(ctx.exception.detail), "Invalid JSON body")

    async def test_parse_json_object_body_uses_custom_error_factory(self):
        class BodyError(RuntimeError):
            pass

        request = _DummyRequest(err=ValueError("bad-json"))
        with self.assertRaises(BodyError):
            await parse_json_object_body(
                request,  # type: ignore[arg-type]
                error_factory=lambda _exc: BodyError("custom invalid body"),
            )
