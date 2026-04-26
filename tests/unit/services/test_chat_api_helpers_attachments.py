# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines attachment-focused chat api helper tests so content-part behavior remains reliable."""

from __future__ import annotations

import asyncio
import base64
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from augmentedquill.services.chat.chat_api_helpers import (
    inject_chat_attachments,
    inject_project_images,
    normalize_chat_messages,
)


class ChatApiHelpersAttachmentsTest(TestCase):
    def test_normalize_chat_messages_preserves_content_parts(self) -> None:
        messages = normalize_chat_messages(
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "hello"},
                        {
                            "type": "image_url",
                            "image_url": {"url": "data:image/png;base64,AAA="},
                        },
                    ],
                }
            ]
        )

        self.assertIsInstance(messages[0]["content"], list)
        self.assertEqual(messages[0]["content"][0]["type"], "text")
        self.assertEqual(messages[0]["content"][1]["type"], "image_url")

    def test_inject_chat_attachments_adds_text_attachment_part(self) -> None:
        messages = [{"role": "user", "content": "Please summarize"}]

        inject_chat_attachments(
            messages,
            [
                {
                    "name": "notes.txt",
                    "type": "text/plain",
                    "size": 7,
                    "encoding": "utf-8",
                    "content": "chapter",
                }
            ],
        )

        content = messages[0]["content"]
        self.assertIsInstance(content, list)
        self.assertEqual(content[0], {"type": "text", "text": "Please summarize"})
        self.assertEqual(content[1]["type"], "text")
        self.assertIn("[Attached file: notes.txt]", content[1]["text"])
        self.assertIn("Encoding: utf-8", content[1]["text"])
        self.assertTrue(content[1]["text"].endswith("\n\nchapter"))

    def test_inject_chat_attachments_adds_image_attachment_part(self) -> None:
        messages = [{"role": "user", "content": "Describe this image"}]
        encoded = base64.b64encode(b"img-bytes").decode("ascii")

        inject_chat_attachments(
            messages,
            [
                {
                    "name": "scene.png",
                    "type": "image/png",
                    "size": 9,
                    "encoding": "base64",
                    "content": encoded,
                }
            ],
        )

        content = messages[0]["content"]
        self.assertEqual(content[1]["type"], "image_url")
        self.assertEqual(
            content[1]["image_url"]["url"],
            f"data:image/png;base64,{encoded}",
        )

    def test_inject_chat_attachments_creates_user_message_when_missing(self) -> None:
        messages = [{"role": "system", "content": "You are helpful."}]

        inject_chat_attachments(
            messages,
            [
                {
                    "name": "notes.txt",
                    "type": "text/plain",
                    "encoding": "utf-8",
                    "content": "hello",
                }
            ],
        )

        self.assertEqual(messages[-1]["role"], "user")
        self.assertIsInstance(messages[-1]["content"], list)

    def test_inject_chat_attachments_rejects_invalid_shape(self) -> None:
        with self.assertRaisesRegex(ValueError, "attachments must be an array"):
            inject_chat_attachments([{"role": "user", "content": "x"}], "nope")

    def test_inject_chat_attachments_rejects_unknown_encoding(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported encoding"):
            inject_chat_attachments(
                [{"role": "user", "content": "x"}],
                [
                    {
                        "name": "sample.txt",
                        "type": "text/plain",
                        "encoding": "utf16",
                        "content": "abc",
                    }
                ],
            )

    def test_inject_chat_attachments_rejects_invalid_base64(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid base64"):
            inject_chat_attachments(
                [{"role": "user", "content": "x"}],
                [
                    {
                        "name": "bad.png",
                        "type": "image/png",
                        "encoding": "base64",
                        "content": "!!!",
                    }
                ],
            )

    def test_inject_chat_attachments_rejects_non_image_binary(self) -> None:
        with self.assertRaisesRegex(ValueError, "not a supported image type"):
            inject_chat_attachments(
                [{"role": "user", "content": "x"}],
                [
                    {
                        "name": "paper.pdf",
                        "type": "application/pdf",
                        "encoding": "base64",
                        "content": "QUJD",
                    }
                ],
            )

    def test_inject_project_images_supports_text_parts_content(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            project_dir = Path(td)
            images_dir = project_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            (images_dir / "cover.png").write_bytes(b"img")

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Please use cover.png"},
                        {"type": "text", "text": "in the teaser."},
                    ],
                }
            ]

            async def run_case() -> None:
                with patch(
                    "augmentedquill.services.chat.chat_api_helpers.get_active_project_dir",
                    return_value=project_dir,
                ):
                    await inject_project_images(messages)

            asyncio.run(run_case())

            content = messages[0]["content"]
            self.assertIsInstance(content, list)
            self.assertEqual(content[0]["type"], "text")
            self.assertEqual(content[1]["type"], "text")
            self.assertEqual(content[2]["type"], "image_url")
            self.assertTrue(
                content[2]["image_url"]["url"].startswith("data:image/png;base64,")
            )
