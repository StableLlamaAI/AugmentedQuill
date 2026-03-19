# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Tests for LLM completion ops: _prepare_llm_request and _resolve_temperature_max_tokens."""

import os
import tempfile
from pathlib import Path
from unittest import TestCase

from augmentedquill.services.llm.llm_completion_ops import (
    _prepare_llm_request,
    _resolve_temperature_max_tokens,
)


class PrepareRequestTest(TestCase):
    def test_basic_request_structure(self):
        url, headers, body = _prepare_llm_request(
            base_url="http://fake/v1",
            api_key=None,
            model_id="gpt-4o",
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.7,
            max_tokens=256,
        )
        assert url == "http://fake/v1/chat/completions"
        assert body["model"] == "gpt-4o"
        assert body["temperature"] == 0.7
        assert body["max_tokens"] == 256
        assert body["messages"] == [{"role": "user", "content": "hi"}]
        assert "Content-Type" in headers

    def test_api_key_adds_authorization_header(self):
        _, headers, _ = _prepare_llm_request(
            base_url="http://fake/v1",
            api_key="sk-test",
            model_id="m",
            messages=[],
            temperature=1.0,
            max_tokens=None,
        )
        assert headers.get("Authorization") == "Bearer sk-test"

    def test_no_api_key_no_authorization_header(self):
        _, headers, _ = _prepare_llm_request(
            base_url="http://fake/v1",
            api_key=None,
            model_id="m",
            messages=[],
            temperature=1.0,
            max_tokens=None,
        )
        assert "Authorization" not in headers

    def test_max_tokens_none_omitted_from_body(self):
        _, _, body = _prepare_llm_request(
            base_url="http://fake/v1",
            api_key=None,
            model_id="m",
            messages=[],
            temperature=1.0,
            max_tokens=None,
        )
        assert "max_tokens" not in body

    def test_extra_body_merged_into_body(self):
        _, _, body = _prepare_llm_request(
            base_url="http://fake/v1",
            api_key=None,
            model_id="m",
            messages=[],
            temperature=0.5,
            max_tokens=100,
            extra_body={"top_p": 0.9, "stream": True},
        )
        assert body["top_p"] == 0.9
        assert body["stream"] is True

    def test_trailing_slash_stripped_from_base_url(self):
        url, _, _ = _prepare_llm_request(
            base_url="http://fake/v1/",
            api_key=None,
            model_id="m",
            messages=[],
            temperature=1.0,
            max_tokens=None,
        )
        assert url == "http://fake/v1/chat/completions"


class ResolveTemperatureMaxTokensTest(TestCase):
    def test_both_provided_uses_those_values(self):
        temp, max_tok = _resolve_temperature_max_tokens(0.5, 512)
        assert temp == 0.5
        assert max_tok == 512

    def test_model_cfg_fallback_when_none(self):
        temp, max_tok = _resolve_temperature_max_tokens(
            None, None, model_cfg={"temperature": "0.3", "max_tokens": "128"}
        )
        assert temp == 0.3
        assert max_tok == 128

    def test_temperature_provided_max_tokens_from_model_cfg(self):
        temp, max_tok = _resolve_temperature_max_tokens(
            0.9, None, model_cfg={"max_tokens": "200"}
        )
        assert temp == 0.9
        assert max_tok == 200

    def test_invalid_model_cfg_values_ignored(self):
        # Should not raise — bad values are swallowed and fall back to story config
        td = tempfile.TemporaryDirectory()
        story_cfg = Path(td.name) / "story.json"
        story_cfg.write_text(
            '{"metadata":{"version":2},"project_title":"T","format":"markdown","llm_prefs":{"temperature":0.6,"max_tokens":300}}',
            encoding="utf-8",
        )
        os.environ["AUGQ_USER_DATA_DIR"] = td.name
        try:
            temp, max_tok = _resolve_temperature_max_tokens(
                None, None, model_cfg={"temperature": "invalid", "max_tokens": "bad"}
            )
            # Must return numeric values, not raise
            assert isinstance(temp, float)
            assert max_tok is None or isinstance(max_tok, int)
        finally:
            os.environ.pop("AUGQ_USER_DATA_DIR", None)
            td.cleanup()

    def test_partial_override_temperature_only(self):
        temp, _ = _resolve_temperature_max_tokens(0.1, None, model_cfg=None)
        assert temp == 0.1
