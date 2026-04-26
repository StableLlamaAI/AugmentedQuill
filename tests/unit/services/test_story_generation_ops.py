# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test story generation ops unit so this responsibility stays isolated, testable, and easy to evolve."""

import pytest
from unittest.mock import patch

from augmentedquill.core.config import load_story_config, save_story_config
from augmentedquill.services.projects.projects import (
    get_active_project_dir,
    select_project,
)
from augmentedquill.api.v1.story_routes.generation_streaming import (
    _create_gen_source,
)
from augmentedquill.services.story.story_api_stream_ops import (
    stream_unified_chat_content,
)
from augmentedquill.services.story.story_generation_common import (
    prepare_ai_action_generation,
)
from augmentedquill.services.story.story_generation_ops import (
    generate_chapter_summary,
    generate_story_summary,
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


@pytest.mark.anyio
async def test_prepare_ai_action_summary_rewrite_blanks_original_summary_for_tool_calls():
    ok, msg = select_project("rewrite_summary_action")
    assert ok, msg

    project_dir = get_active_project_dir()
    assert project_dir is not None

    story_path = project_dir / "story.json"
    story = load_story_config(story_path)
    story["project_type"] = "novel"
    story["chapters"] = [
        {"title": "Chapter 1", "summary": "Old chapter summary", "filename": "0001.txt"}
    ]
    save_story_config(story_path, story)

    chapters_dir = project_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)
    chapter_file = chapters_dir / "0001.txt"
    chapter_file.write_text("A hero explores the unknown.", encoding="utf-8")

    async def fake_unified_chat_stream(*args, **kwargs):
        current = load_story_config(story_path)
        assert current.get("chapters", [])[0].get("summary", "") == ""
        yield {"content": "Rewritten chapter summary."}

    payload = {
        "target": "summary",
        "action": "rewrite",
        "chap_id": 1,
        "scope": "chapter",
        "current_text": "Notes about the chapter.",
        "source": "notes",
    }

    with patch(
        "augmentedquill.services.llm.llm.unified_chat_stream",
        side_effect=fake_unified_chat_stream,
    ):
        prepared = prepare_ai_action_generation(payload)
        assert prepared.get("_summary_rewrite_backup") is not None

        async for _ in _create_gen_source(prepared):
            pass

    final_story = load_story_config(story_path)
    assert final_story.get("chapters", [])[0].get("summary") == "Old chapter summary"


@pytest.mark.anyio
async def test_generate_story_summary_discard_clears_existing_summary_before_llm_call():
    ok, msg = select_project("discard_story_summary")
    assert ok, msg

    project_dir = get_active_project_dir()
    assert project_dir is not None

    story_path = project_dir / "story.json"
    story = load_story_config(story_path)
    story["project_type"] = "short-story"
    story["story_summary"] = "Outdated summary"
    save_story_config(story_path, story)

    content_path = project_dir / "content.md"
    content_path.write_text("Once upon a time.", encoding="utf-8")

    async def fake_unified_chat_complete(*args, **kwargs):
        current = load_story_config(story_path)
        assert current.get("story_summary", "") == ""
        return {"content": "New story summary"}

    with patch(
        "augmentedquill.services.llm.llm.unified_chat_complete",
        side_effect=fake_unified_chat_complete,
    ):
        result = await generate_story_summary(mode="discard")

    assert result["summary"] == "New story summary"
    final_story = load_story_config(story_path)
    assert final_story["story_summary"] == "New story summary"


@pytest.mark.anyio
async def test_generate_chapter_summary_discard_clears_existing_summary_before_llm_call():
    ok, msg = select_project("discard_chapter_summary")
    assert ok, msg

    project_dir = get_active_project_dir()
    assert project_dir is not None

    # Create a single chapter file with text so chapter summary can be generated.
    chapters_dir = project_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)
    chapter_file = chapters_dir / "0001.txt"
    chapter_file.write_text("A lonely hero walks through the woods.", encoding="utf-8")

    story_path = project_dir / "story.json"
    story = load_story_config(story_path)
    story["chapters"] = [{"title": "Chapter 1", "summary": "Old chapter summary"}]
    save_story_config(story_path, story)

    async def fake_unified_chat_complete(*args, **kwargs):
        current = load_story_config(story_path)
        assert current.get("chapters", [])[0].get("summary", "") == ""
        return {"content": "New chapter summary"}

    with patch(
        "augmentedquill.services.llm.llm.unified_chat_complete",
        side_effect=fake_unified_chat_complete,
    ):
        result = await generate_chapter_summary(chap_id=1, mode="discard")

    assert result["summary"] == "New chapter summary"
    final_story = load_story_config(story_path)
    assert final_story.get("chapters", [])[0].get("summary") == "New chapter summary"


def test_prepare_ai_action_chapter_rewrite_uses_imposed_heading_prefix():
    ok, msg = select_project("rewrite_heading_prefix")
    assert ok, msg

    project_dir = get_active_project_dir()
    assert project_dir is not None

    story_path = project_dir / "story.json"
    story = load_story_config(story_path)
    story["project_type"] = "novel"
    story["chapters"] = [
        {
            "title": "My chapter title",
            "summary": "Chapter summary",
            "filename": "0001.txt",
        }
    ]
    save_story_config(story_path, story)

    chapters_dir = project_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)
    (chapters_dir / "0001.txt").write_text(
        "Existing chapter content.", encoding="utf-8"
    )

    prepared = prepare_ai_action_generation(
        {
            "target": "chapter",
            "action": "rewrite",
            "chap_id": 1,
            "scope": "chapter",
            "current_text": "This text should be ignored for rewrite.",
        }
    )

    assert prepared["existing_content"] == "This text should be ignored for rewrite."
    assert prepared["response_prefill"] == "# My chapter title\n\n"
    assert prepared["extra_body"] == {
        "chat_template_kwargs": {
            "continue_final_message": True,
            "enable_thinking": False,
        }
    }


def test_prepare_ai_action_chapter_extend_prefills_full_draft_with_heading():
    ok, msg = select_project("extend_full_prefill")
    assert ok, msg

    project_dir = get_active_project_dir()
    assert project_dir is not None

    story_path = project_dir / "story.json"
    story = load_story_config(story_path)
    story["project_type"] = "novel"
    story["chapters"] = [
        {
            "title": "My chapter title",
            "summary": "Chapter summary",
            "filename": "0001.txt",
        }
    ]
    save_story_config(story_path, story)

    chapters_dir = project_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)
    (chapters_dir / "0001.txt").write_text(
        "Existing chapter content.", encoding="utf-8"
    )

    prepared = prepare_ai_action_generation(
        {
            "target": "chapter",
            "action": "extend",
            "chap_id": 1,
            "scope": "chapter",
            "current_text": "Existing chapter content.",
        }
    )

    assert prepared["existing_content"] == "Existing chapter content."
    assert (
        prepared["response_prefill"]
        == "# My chapter title\n\nExisting chapter content."
    )
    assert prepared["extra_body"] == {
        "chat_template_kwargs": {
            "continue_final_message": True,
            "enable_thinking": False,
        }
    }
