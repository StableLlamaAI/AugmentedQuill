# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test chat sessions unit so this responsibility stays isolated, testable, and easy to evolve."""

from augmentedquill.services.chat.chat_session_helpers import (
    delete_chat,
    list_chats,
    load_chat,
    save_chat,
)
from augmentedquill.services.projects.projects import (
    initialize_project_dir,
    select_project,
)

from .api_test_case import ApiTestCase


class TestChatSessionsApi(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.project_name = "test_project"
        self.project_path = self.projects_root / self.project_name
        initialize_project_dir(self.project_path, project_title="Test Project")
        select_project(self.project_name)

    def test_backend_chat_operations(self):
        chat_id = "chat_123"
        chat_data = {
            "id": chat_id,
            "name": "Initial Chat",
            "messages": [{"role": "user", "content": "Hello"}],
        }

        # Save
        save_chat(self.project_path, chat_id, chat_data)
        chats_dir = self.project_path / "chats"
        self.assertTrue((chats_dir / f"{chat_id}.json").exists())

        # List
        chats = list_chats(self.project_path)
        self.assertEqual(len(chats), 1)
        self.assertEqual(chats[0]["id"], chat_id)
        self.assertEqual(chats[0]["name"], "Initial Chat")

        # Load
        loaded = load_chat(self.project_path, chat_id)
        self.assertEqual(loaded["name"], "Initial Chat")
        self.assertEqual(len(loaded["messages"]), 1)

        # Delete
        success = delete_chat(self.project_path, chat_id)
        self.assertTrue(success)
        self.assertFalse((chats_dir / f"{chat_id}.json").exists())
        self.assertEqual(len(list_chats(self.project_path)), 0)

    def test_api_chat_endpoints(self):
        chat_id = "api_chat"
        chat_payload = {
            "name": "API Test Chat",
            "messages": [{"role": "user", "content": "Hello API"}],
        }

        # POST /api/v1/chats/{id}
        resp = self.client.post(f"/api/v1/chats/{chat_id}", json=chat_payload)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])

        # GET /api/v1/chats (list)
        resp = self.client.get("/api/v1/chats")
        self.assertEqual(resp.status_code, 200)
        chats = resp.json()
        self.assertEqual(len(chats), 1)
        self.assertEqual(chats[0]["id"], chat_id)

        # GET /api/v1/chats/{id} (load)
        resp = self.client.get(f"/api/v1/chats/{chat_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["name"], "API Test Chat")

        # DELETE /api/v1/chats/{id}
        resp = self.client.delete(f"/api/v1/chats/{chat_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["ok"])

        # Confirm deleted
        resp = self.client.get("/api/v1/chats")
        self.assertEqual(len(resp.json()), 0)

    def test_chat_save_updates_timestamp(self):
        chat_id = "timestamp_test"
        chat_data = {"name": "Test"}
        save_chat(self.project_path, chat_id, chat_data)

        loaded = load_chat(self.project_path, chat_id)
        self.assertIn("created_at", loaded)
        self.assertIn("updated_at", loaded)

        first_updated = loaded["updated_at"]

        # Save again
        save_chat(self.project_path, chat_id, chat_data)
        loaded_again = load_chat(self.project_path, chat_id)
        self.assertGreaterEqual(loaded_again["updated_at"], first_updated)

    def test_api_load_missing_chat_returns_not_found(self):
        resp = self.client.get("/api/v1/chats/does-not-exist")
        self.assertEqual(resp.status_code, 404)

    def test_api_save_chat_rejects_malformed_json(self):
        resp = self.client.post(
            "/api/v1/chats/bad-json",
            content="{bad",
            headers={"content-type": "application/json"},
        )
        self.assertEqual(resp.status_code, 400)
