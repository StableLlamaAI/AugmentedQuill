# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines focused credential resolution tests used by chat stream integration coverage."""

from unittest.mock import patch

from .chat_stream_test_base import ChatStreamTestBase


class TestChatStreamCredentials(ChatStreamTestBase):
    def test_llm_resolve_credentials_with_name(self):
        from augmentedquill.services.llm import llm

        cfg = {
            "openai": {
                "selected": "model-a",
                "models": [
                    {
                        "name": "model-a",
                        "base_url": "http://a",
                        "api_key": "ka",
                        "model": "gpt-a",
                    },
                    {
                        "name": "model-b",
                        "base_url": "http://b",
                        "api_key": "kb",
                        "model": "gpt-b",
                    },
                ],
            }
        }

        with patch(
            "augmentedquill.services.llm.llm.load_machine_config", return_value=cfg
        ):
            url, _key, mod, _to, _ = llm.resolve_openai_credentials(
                {}, model_type="CHAT"
            )
            self.assertEqual(url, "http://a")
            self.assertEqual(mod, "gpt-a")

            url, _key, mod, _to, _ = llm.resolve_openai_credentials(
                {"model_name": "model-b"}, model_type="CHAT"
            )
            self.assertEqual(url, "http://b")
            self.assertEqual(mod, "gpt-b")
