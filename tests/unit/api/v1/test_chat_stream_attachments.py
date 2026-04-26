# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines chat stream attachment tests so OpenAI-format content parts stay correct."""

from __future__ import annotations

import base64
from unittest.mock import patch

from .chat_stream_test_base import ChatStreamTestBase


class TestChatStreamAttachments(ChatStreamTestBase):
    def test_stream_injects_text_attachment_as_content_part(self) -> None:
        captured: dict = {}

        async def fake_stream(**kwargs):
            captured.update(kwargs)
            yield {"content": "ok"}

        payload = {
            "messages": [{"role": "user", "content": "Please analyze"}],
            "attachments": [
                {
                    "name": "scene_notes.md",
                    "type": "text/markdown",
                    "size": 12,
                    "encoding": "utf-8",
                    "content": "# Notes\nA",
                }
            ],
            "model_type": "CHAT",
        }

        with patch(
            "augmentedquill.api.v1.chat.llm.unified_chat_stream",
            side_effect=fake_stream,
        ):
            response = self.client.post("/api/v1/chat/stream", json=payload)

        self.assertEqual(response.status_code, 200, response.text)
        last_user = captured["messages"][-1]
        self.assertEqual(last_user["role"], "user")
        self.assertIsInstance(last_user["content"], list)
        self.assertEqual(
            last_user["content"][0], {"type": "text", "text": "Please analyze"}
        )
        self.assertEqual(last_user["content"][1]["type"], "text")
        self.assertIn(
            "[Attached file: scene_notes.md]", last_user["content"][1]["text"]
        )

    def test_stream_injects_image_attachment_as_image_url_part(self) -> None:
        captured: dict = {}

        async def fake_stream(**kwargs):
            captured.update(kwargs)
            yield {"content": "ok"}

        encoded = base64.b64encode(b"image").decode("ascii")
        payload = {
            "messages": [{"role": "user", "content": "Describe image"}],
            "attachments": [
                {
                    "name": "cover.png",
                    "type": "image/png",
                    "size": 5,
                    "encoding": "base64",
                    "content": encoded,
                }
            ],
            "model_type": "CHAT",
        }

        with patch(
            "augmentedquill.api.v1.chat.llm.unified_chat_stream",
            side_effect=fake_stream,
        ):
            response = self.client.post("/api/v1/chat/stream", json=payload)

        self.assertEqual(response.status_code, 200, response.text)
        parts = captured["messages"][-1]["content"]
        self.assertEqual(parts[1]["type"], "image_url")
        self.assertEqual(
            parts[1]["image_url"]["url"], f"data:image/png;base64,{encoded}"
        )

    def test_stream_rejects_non_image_binary_attachment(self) -> None:
        payload = {
            "messages": [{"role": "user", "content": "Analyze"}],
            "attachments": [
                {
                    "name": "draft.pdf",
                    "type": "application/pdf",
                    "size": 3,
                    "encoding": "base64",
                    "content": "QUJD",
                }
            ],
            "model_type": "CHAT",
        }

        response = self.client.post("/api/v1/chat/stream", json=payload)

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("not a supported image type", response.text)

    def test_stream_rejects_invalid_base64_image_attachment(self) -> None:
        payload = {
            "messages": [{"role": "user", "content": "Analyze"}],
            "attachments": [
                {
                    "name": "bad.png",
                    "type": "image/png",
                    "size": 3,
                    "encoding": "base64",
                    "content": "%%%",
                }
            ],
            "model_type": "CHAT",
        }

        response = self.client.post("/api/v1/chat/stream", json=payload)

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("invalid base64", response.text)
