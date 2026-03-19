# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test chat api session ops unit so this responsibility stays isolated, testable, and easy to evolve."""

from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from augmentedquill.services.chat.chat_api_session_ops import (
    delete_active_chat,
    delete_all_active_chats,
    list_active_chats,
    load_active_chat,
    save_active_chat,
)
from augmentedquill.services.exceptions import NotFoundError


class ChatApiSessionOpsTest(TestCase):
    def test_list_active_chats_returns_empty_without_active_project(self):
        with patch(
            "augmentedquill.services.chat.chat_api_session_ops.get_active_project_dir",
            return_value=None,
        ):
            self.assertEqual(list_active_chats(), [])

    def test_load_active_chat_raises_without_project(self):
        with patch(
            "augmentedquill.services.chat.chat_api_session_ops.get_active_project_dir",
            return_value=None,
        ):
            with self.assertRaises(NotFoundError):
                load_active_chat("chat-1")

    def test_load_active_chat_raises_when_missing(self):
        with (
            patch(
                "augmentedquill.services.chat.chat_api_session_ops.get_active_project_dir",
                return_value=Path("/tmp/project"),
            ),
            patch(
                "augmentedquill.services.chat.chat_api_session_ops.load_chat",
                return_value=None,
            ),
        ):
            with self.assertRaises(NotFoundError):
                load_active_chat("chat-1")

    def test_save_active_chat_injects_chat_id(self):
        with (
            patch(
                "augmentedquill.services.chat.chat_api_session_ops.get_active_project_dir",
                return_value=Path("/tmp/project"),
            ),
            patch(
                "augmentedquill.services.chat.chat_api_session_ops.save_chat",
            ) as mocked_save,
        ):
            save_active_chat("chat-1", {"name": "Test"})

        mocked_save.assert_called_once()
        _, _, payload = mocked_save.call_args.args
        self.assertEqual(payload["id"], "chat-1")
        self.assertEqual(payload["name"], "Test")

    def test_delete_active_chat_raises_when_not_found(self):
        with (
            patch(
                "augmentedquill.services.chat.chat_api_session_ops.get_active_project_dir",
                return_value=Path("/tmp/project"),
            ),
            patch(
                "augmentedquill.services.chat.chat_api_session_ops.delete_chat",
                return_value=False,
            ),
        ):
            with self.assertRaises(NotFoundError):
                delete_active_chat("chat-1")

    def test_delete_all_active_chats_raises_without_project(self):
        with patch(
            "augmentedquill.services.chat.chat_api_session_ops.get_active_project_dir",
            return_value=None,
        ):
            with self.assertRaises(NotFoundError):
                delete_all_active_chats()
