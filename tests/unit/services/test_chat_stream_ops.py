# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Unit tests for chat stream injection logic."""

from unittest import TestCase
from augmentedquill.services.chat.chat_api_stream_ops import inject_chat_user_context


class TestChatStreamOps(TestCase):
    def test_inject_chat_user_context_full(self):
        req_messages = [{"role": "user", "content": "Hello AI"}]
        payload = {
            "current_chapter": {"id": 1, "title": "Introduction", "is_empty": False}
        }
        inject_chat_user_context(req_messages, payload)

        content = req_messages[0]["content"]
        self.assertIn('[Current Chapter Context: ID=1, Title="Introduction"]', content)
        self.assertIn("Hello AI", content)

    def test_inject_chat_user_context_empty_title(self):
        req_messages = [{"role": "user", "content": "Hello AI"}]
        payload = {"current_chapter": {"id": 2, "title": "", "is_empty": False}}
        inject_chat_user_context(req_messages, payload)

        content = req_messages[0]["content"]
        self.assertIn("[Current Chapter Context: ID=2]", content)
        self.assertNotIn("Title=", content)
        self.assertIn("Hello AI", content)

    def test_inject_chat_user_context_is_empty(self):
        req_messages = [{"role": "user", "content": "Hello AI"}]
        payload = {
            "current_chapter": {"id": 3, "title": "Empty Chapter", "is_empty": True}
        }
        inject_chat_user_context(req_messages, payload)

        content = req_messages[0]["content"]
        self.assertIn(
            '[Current Chapter Context: ID=3, Title="Empty Chapter", (Empty)]', content
        )
        self.assertIn("Hello AI", content)

    def test_inject_chat_user_context_no_chapter(self):
        req_messages = [{"role": "user", "content": "Hello AI"}]
        payload = {}
        inject_chat_user_context(req_messages, payload)

        self.assertEqual(req_messages[0]["content"], "Hello AI")
