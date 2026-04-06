# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for the machine settings API endpoints: /machine/test, /machine/presets, /machine/test_model, PUT /machine."""

from unittest.mock import AsyncMock, patch

from .api_test_case import ApiTestCase


class MachinTestEndpointsTest(ApiTestCase):
    # ------------------------------------------------------------------
    # POST /machine/test
    # ------------------------------------------------------------------

    def test_machine_test_missing_base_url_returns_not_ok(self):
        resp = self.client.post("/api/v1/machine/test", json={})
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert "base_url" in body.get("detail", "").lower()

    def test_machine_test_empty_base_url_returns_not_ok(self):
        resp = self.client.post("/api/v1/machine/test", json={"base_url": ""})
        assert resp.status_code == 200
        assert resp.json()["ok"] is False

    def test_machine_test_success(self):
        with patch(
            "augmentedquill.api.v1.settings.list_remote_models",
            new=AsyncMock(return_value=(True, ["gpt-4o", "gpt-3.5-turbo"], None)),
        ):
            resp = self.client.post(
                "/api/v1/machine/test",
                json={"base_url": "https://api.openai.com/v1", "api_key": "sk-test"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert "gpt-4o" in body["models"]

    def test_machine_test_failure_propagates_detail(self):
        with patch(
            "augmentedquill.api.v1.settings.list_remote_models",
            new=AsyncMock(return_value=(False, [], "Connection refused")),
        ):
            resp = self.client.post(
                "/api/v1/machine/test",
                json={"base_url": "https://api.openai.com/v1"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["detail"] == "Connection refused"

    # ------------------------------------------------------------------
    # GET /machine/presets
    # ------------------------------------------------------------------

    def test_machine_presets_returns_list(self):
        resp = self.client.get("/api/v1/machine/presets")
        assert resp.status_code == 200
        body = resp.json()
        assert "presets" in body
        assert isinstance(body["presets"], list)

    # ------------------------------------------------------------------
    # POST /machine/test_model
    # ------------------------------------------------------------------

    def test_machine_test_model_missing_base_url(self):
        resp = self.client.post(
            "/api/v1/machine/test_model", json={"model_id": "gpt-4o"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["model_ok"] is False

    def test_machine_test_model_missing_model_id(self):
        resp = self.client.post(
            "/api/v1/machine/test_model",
            json={"base_url": "https://api.openai.com/v1"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["model_ok"] is False

    def test_machine_test_model_success(self):
        with (
            patch(
                "augmentedquill.api.v1.settings.remote_model_exists",
                new=AsyncMock(return_value=(True, None)),
            ),
            patch(
                "augmentedquill.api.v1.settings.verify_model_capabilities",
                new=AsyncMock(return_value={"vision": False, "function_calling": True}),
            ),
        ):
            resp = self.client.post(
                "/api/v1/machine/test_model",
                json={
                    "base_url": "https://api.openai.com/v1",
                    "model_id": "gpt-4o",
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["model_ok"] is True
        assert "gpt-4o" in body["models"]

    def test_machine_test_model_not_found(self):
        with (
            patch(
                "augmentedquill.api.v1.settings.remote_model_exists",
                new=AsyncMock(return_value=(False, "model not found")),
            ),
            patch(
                "augmentedquill.api.v1.settings.verify_model_capabilities",
                new=AsyncMock(return_value=None),
            ),
        ):
            resp = self.client.post(
                "/api/v1/machine/test_model",
                json={
                    "base_url": "https://api.openai.com/v1",
                    "model_id": "does-not-exist",
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["model_ok"] is False

    # ------------------------------------------------------------------
    # PUT /machine
    # ------------------------------------------------------------------

    def test_machine_put_valid_config(self):
        payload = {
            "openai": {
                "models": [
                    {
                        "name": "My GPT",
                        "base_url": "https://api.openai.com/v1",
                        "model": "gpt-4o",
                    }
                ]
            }
        }
        resp = self.client.put("/api/v1/machine", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_machine_put_preserves_other_provider_sections(self):
        from augmentedquill.core.config import DEFAULT_MACHINE_CONFIG_PATH

        payload = {
            "openai": {
                "models": [
                    {
                        "name": "My GPT",
                        "base_url": "https://api.openai.com/v1",
                        "model": "gpt-4o",
                    }
                ]
            },
            "google": {
                "models": [
                    {
                        "name": "Gemini",
                        "base_url": "https://api.generative.google/v1",
                        "model": "gemini-2",
                    }
                ]
            },
        }
        resp = self.client.put("/api/v1/machine", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        written = DEFAULT_MACHINE_CONFIG_PATH.read_text(encoding="utf-8")
        assert "google" in written
        assert "Gemini" in written
        assert "gpt-4o" in written

    def test_settings_post_preserves_other_provider_sections(self):
        from augmentedquill.core.config import DEFAULT_MACHINE_CONFIG_PATH

        payload = {
            "story": {},
            "machine": {
                "openai": {
                    "models": [
                        {
                            "name": "My GPT",
                            "base_url": "https://api.openai.com/v1",
                            "model": "gpt-4o",
                        }
                    ]
                },
                "anthropic": {
                    "models": [
                        {
                            "name": "Claude",
                            "base_url": "https://api.anthropic.com/v1",
                            "model": "claude-3",
                        }
                    ]
                },
            },
        }
        resp = self.client.post("/api/v1/settings", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        written = DEFAULT_MACHINE_CONFIG_PATH.read_text(encoding="utf-8")
        assert "anthropic" in written
        assert "Claude" in written
        assert "gpt-4o" in written

    def test_machine_put_empty_body_still_ok(self):
        resp = self.client.put("/api/v1/machine", json={})
        # Empty body is legitimately invalid (400) — must not be a 500
        assert resp.status_code in (200, 400)
