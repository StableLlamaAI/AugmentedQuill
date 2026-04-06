# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

import pytest
from unittest.mock import patch
from augmentedquill.services.story.story_api_stream_ops import (
    stream_unified_chat_content,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_stream_unified_chat_content_multi_round():
    # Setup mock for llm.unified_chat_stream
    # Round 1: Returns a tool call
    # Round 2: Returns final content

    mock_chunks_round_1 = [
        {
            "tool_calls": [
                {
                    "index": 0,
                    "id": "call_1",
                    "function": {
                        "name": "update_story_metadata",
                        "arguments": '{"title": "New Title"}',
                    },
                }
            ]
        }
    ]
    mock_chunks_round_2 = [{"content": "Story updated."}]

    with (
        patch("augmentedquill.services.llm.llm.unified_chat_stream") as mock_stream,
        patch(
            "augmentedquill.services.story.story_api_stream_ops.execute_registered_tool"
        ) as mock_exec,
    ):

        # Configure mock stream to return chunks for two rounds
        async def side_effect(*args, **kwargs):
            messages = kwargs.get("messages", [])
            if len(messages) == 1:  # Initial call
                for chunk in mock_chunks_round_1:
                    yield chunk
            else:  # Second call after tool execution
                for chunk in mock_chunks_round_2:
                    yield chunk

        mock_stream.side_effect = side_effect
        mock_exec.return_value = {"ok": True}

        messages = [{"role": "user", "content": "Update title"}]
        results = []
        async for chunk in stream_unified_chat_content(
            messages=messages,
            base_url="http://fake",
            api_key="key",
            model_id="model",
            timeout_s=60,
        ):
            results.append(chunk)

        assert len(results) == 2
        assert results[0] == mock_chunks_round_1[0]
        assert results[1] == mock_chunks_round_2[0]

        # Verify tool was executed
        mock_exec.assert_called_once()
        args, kwargs = mock_exec.call_args
        assert args[0] == "update_story_metadata"
        assert args[1] == {"title": "New Title"}
