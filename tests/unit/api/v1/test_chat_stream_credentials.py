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

    def test_llm_resolve_credentials_by_role_selection(self):
        from augmentedquill.services.llm import llm

        cfg = {
            "openai": {
                "models": [
                    {
                        "name": "Write Mode",
                        "base_url": "http://writing",
                        "api_key": "write-key",
                        "model": "write-model",
                    },
                    {
                        "name": "Edit Mode",
                        "base_url": "http://editing",
                        "api_key": "edit-key",
                        "model": "edit-model",
                    },
                    {
                        "name": "Chat Mode",
                        "base_url": "http://chat",
                        "api_key": "chat-key",
                        "model": "chat-model",
                    },
                ],
                "selected_writing": "Write Mode",
                "selected_editing": "Edit Mode",
                "selected_chat": "Chat Mode",
                "selected": "Chat Mode",
            }
        }

        with patch(
            "augmentedquill.services.llm.llm.load_machine_config", return_value=cfg
        ):
            url, key, mod, _, _ = llm.resolve_openai_credentials(
                {}, model_type="writing"
            )
            self.assertEqual(url, "http://writing")
            self.assertEqual(key, "write-key")
            self.assertEqual(mod, "write-model")

            url, key, mod, _, _ = llm.resolve_openai_credentials(
                {}, model_type="editing"
            )
            self.assertEqual(url, "http://editing")
            self.assertEqual(key, "edit-key")
            self.assertEqual(mod, "edit-model")

            url, key, mod, _, _ = llm.resolve_openai_credentials({}, model_type="CHAT")
            self.assertEqual(url, "http://chat")
            self.assertEqual(key, "chat-key")
            self.assertEqual(mod, "chat-model")

    def test_llm_resolve_credentials_payload_overrides_config(self):
        from augmentedquill.services.llm import llm

        cfg = {
            "openai": {
                "models": [
                    {
                        "name": "Write Mode",
                        "base_url": "http://writing",
                        "api_key": "write-key",
                        "model": "write-model",
                        "timeout_s": 10,
                    }
                ],
                "selected_writing": "Write Mode",
            }
        }

        payload = {
            "base_url": "http://override",
            "api_key": "override-key",
            "model": "override-model",
            "timeout_s": 20,
        }

        with patch(
            "augmentedquill.services.llm.llm.load_machine_config", return_value=cfg
        ):
            url, key, mod, timeout_s, _ = llm.resolve_openai_credentials(
                payload, model_type="WRITING"
            )
            self.assertEqual(url, "http://override")
            self.assertEqual(key, "override-key")
            self.assertEqual(mod, "override-model")
            self.assertEqual(timeout_s, 20)

    def test_llm_resolve_credentials_with_provider_specific_model_name(self):
        from augmentedquill.services.llm import llm

        cfg = {
            "openai": {
                "selected": "model-a",
                "models": [
                    {
                        "name": "model-a",
                        "base_url": "http://openai",
                        "api_key": "ka",
                        "model": "gpt-a",
                    }
                ],
            },
            "anthropic": {
                "models": [
                    {
                        "name": "Anthropic Edit",
                        "base_url": "http://anthropic",
                        "api_key": "kb",
                        "model": "claude-3",
                    }
                ]
            },
        }

        with patch(
            "augmentedquill.services.llm.llm.load_machine_config", return_value=cfg
        ):
            url, key, mod, _, _ = llm.resolve_openai_credentials(
                {"model_name": "Anthropic Edit"}, model_type="EDITING"
            )
            self.assertEqual(url, "http://anthropic")
            self.assertEqual(key, "kb")
            self.assertEqual(mod, "claude-3")

    def test_stream_resolve_stream_model_context_normalizes_model_type(self):
        from augmentedquill.services.chat.chat_api_stream_ops import (
            resolve_stream_model_context,
        )

        machine = {
            "openai": {
                "models": [
                    {
                        "name": "Write Mode",
                        "base_url": "http://writing",
                        "api_key": "write-key",
                        "model": "write-model",
                    }
                ],
                "selected_writing": "Write Mode",
            }
        }

        payload = {"model_type": "writing"}
        ctx = resolve_stream_model_context(payload, machine)
        self.assertEqual(ctx["model_type"], "WRITING")
        self.assertEqual(ctx["base_url"], "http://writing")
        self.assertEqual(ctx["model_id"], "write-model")

    def test_stream_resolve_stream_model_context_with_provider_specific_model_name(
        self,
    ):
        from augmentedquill.services.chat.chat_api_stream_ops import (
            resolve_stream_model_context,
        )

        machine = {
            "openai": {
                "models": [
                    {
                        "name": "OpenAI Chat",
                        "base_url": "http://openai",
                        "api_key": "ka",
                        "model": "gpt-chat",
                    }
                ],
                "selected": "OpenAI Chat",
            },
            "google": {
                "models": [
                    {
                        "name": "Google Writer",
                        "base_url": "http://google",
                        "api_key": "kb",
                        "model": "gemini-2",
                    }
                ],
            },
        }

        payload = {"model_type": "writing", "model_name": "Google Writer"}
        ctx = resolve_stream_model_context(payload, machine)
        self.assertEqual(ctx["model_type"], "WRITING")
        self.assertEqual(ctx["base_url"], "http://google")
        self.assertEqual(ctx["model_id"], "gemini-2")
