# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test openai models proxy unit so this responsibility stays isolated, testable, and easy to evolve."""

from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from augmentedquill.main import app


class OpenAiModelsProxyApiTest(IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_openai_models_rejects_invalid_json(self):
        resp = self.client.post(
            "/api/v1/openai/models",
            content="{bad",
            headers={"content-type": "application/json"},
        )
        self.assertEqual(resp.status_code, 400)

    def test_openai_models_forwards_to_proxy(self):
        with patch(
            "augmentedquill.api.v1.chat.proxy_openai_models",
            new=AsyncMock(
                return_value=JSONResponse(status_code=200, content={"data": []})
            ),
        ) as mocked_proxy:
            resp = self.client.post(
                "/api/v1/openai/models",
                json={"base_url": "https://example.invalid/v1", "api_key": "k"},
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"data": []})
        mocked_proxy.assert_awaited_once()
