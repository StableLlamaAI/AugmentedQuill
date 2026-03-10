# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the chapter tools unit so this responsibility stays isolated, testable, and easy to evolve."""

import json as _json

from pydantic import BaseModel, Field

from augmentedquill.core.config import load_story_config
from augmentedquill.services.chapters.chapter_helpers import (
    _chapter_by_id_or_404,
    _get_chapter_metadata_entry,
    _scan_chapter_files,
)
from augmentedquill.services.chat.chat_tool_decorator import chat_tool
from augmentedquill.services.projects.project_helpers import (
    _chapter_content_slice,
    _project_overview,
)
from augmentedquill.services.story.story_generation_ops import (
    continue_chapter_from_summary,
    generate_chapter_summary,
    write_chapter_from_summary,
)
from augmentedquill.services.projects.projects import (
    create_new_chapter as _create_new_chapter,
    get_active_project_dir,
    update_chapter_metadata as _update_chapter_metadata,
    write_chapter_content as _write_chapter_content,
    write_chapter_summary as _write_chapter_summary,
    write_chapter_title,
)


def _overview_chapters():
    """Overview Chapters."""
    ov = _project_overview()
    chapters = []
    if ov.get("project_type") == "series":
        for book in ov.get("books", []):
            chapters.extend(book.get("chapters", []))
    else:
        chapters = ov.get("chapters", [])
    return ov, chapters


# ============================================================================
# Tool Parameter Models
# ============================================================================


class GetChapterMetadataParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to get metadata for")


class UpdateChapterMetadataParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to update metadata for")
    title: str | None = Field(None, description="The chapter title")
    summary: str | None = Field(None, description="The chapter summary")
    notes: str | None = Field(None, description="Public notes about the chapter")
    private_notes: str | None = Field(
        None, description="Private notes about the chapter"
    )
    conflicts: list | str | None = Field(
        None, description="List of conflicts in the chapter (can be JSON string)"
    )


class GetChapterSummariesParams(BaseModel):
    pass


class GetChapterContentParams(BaseModel):
    chap_id: int | None = Field(
        None,
        description="The chapter ID to get content for. If not provided, uses active chapter.",
    )
    start: int = Field(0, description="The starting character position")
    max_chars: int = Field(8000, description="Maximum characters to return (1-8000)")


class WriteChapterContentParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to write content to")
    content: str = Field(..., description="The content to write")


class ReplaceTextInChapterParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to edit")
    old_text: str = Field(..., description="The exact literal text to replace")
    new_text: str = Field(..., description="The new text to insert instead")


class WriteChapterSummaryParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to write summary to")
    summary: str = Field(..., description="The summary to write")


class SyncSummaryParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to generate summary for")
    mode: str = Field(
        "",
        description="The mode for summary generation (e.g., 'detailed', 'brief')",
    )


class WriteChapterParams(BaseModel):
    chap_id: int = Field(
        ..., description="The chapter ID to write full chapter content for"
    )


class ContinueChapterParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to continue writing")


class CreateNewChapterParams(BaseModel):
    title: str = Field("", description="The title for the new chapter")
    book_id: str | None = Field(
        None, description="The book ID (UUID) if project is a series"
    )


class GetChapterHeadingParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to get heading for")


class WriteChapterHeadingParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to write heading to")
    heading: str = Field(..., description="The heading to write")


class GetChapterSummaryParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to get summary for")


class DeleteChapterParams(BaseModel):
    chap_id: int = Field(..., description="The chapter ID to delete")
    confirm: bool = Field(False, description="Set to true to confirm deletion")


# ============================================================================
# Tool Implementations
# ============================================================================


@chat_tool(
    description="Get metadata for a specific chapter including title, summary, notes, and conflicts."
)
async def get_chapter_metadata(
    params: GetChapterMetadataParams, payload: dict, mutations: dict
):
    """Get Chapter Metadata."""
    active = get_active_project_dir()
    story = load_story_config((active / "story.json") if active else None) or {}
    _, path, _ = _chapter_by_id_or_404(params.chap_id)
    meta = _get_chapter_metadata_entry(story, params.chap_id, path) or {}
    return {
        "title": meta.get("title", "") or path.name,
        "summary": meta.get("summary", ""),
        "notes": meta.get("notes", ""),
        "conflicts": meta.get("conflicts") or [],
    }


@chat_tool(
    description="Update metadata for a specific chapter (title, summary, notes, private_notes, conflicts)."
)
async def update_chapter_metadata(
    params: UpdateChapterMetadataParams, payload: dict, mutations: dict
):
    """Update Chapter Metadata."""
    conflicts = params.conflicts
    if isinstance(conflicts, str):
        try:
            conflicts = _json.loads(conflicts)
        except Exception:
            conflicts = None

    _update_chapter_metadata(
        params.chap_id,
        title=params.title,
        summary=params.summary,
        notes=params.notes,
        private_notes=params.private_notes,
        conflicts=conflicts,
    )
    mutations["story_changed"] = True
    return {"ok": True}


@chat_tool(
    description="Get summaries for all chapters in the project (across all books if series)."
)
async def get_chapter_summaries(
    params: GetChapterSummariesParams, payload: dict, mutations: dict
):
    """Get Chapter Summaries."""
    ov = _project_overview()
    p_type = ov.get("project_type", "novel")

    all_chapters = []
    if p_type == "series":
        for book in ov.get("books", []):
            all_chapters.extend(book.get("chapters", []))
    else:
        all_chapters = ov.get("chapters", [])

    summaries = []
    for chapter in all_chapters:
        if isinstance(chapter, dict):
            chap_id = chapter.get("id")
            title = chapter.get("title", "").strip() or f"Chapter {chap_id}"
            summary = chapter.get("summary", "").strip()
            if summary:
                summaries.append(
                    {"chapter_id": chap_id, "title": title, "summary": summary}
                )
    return {"chapter_summaries": summaries}


@chat_tool(description="Get content from a specific chapter with pagination support.")
async def get_chapter_content(
    params: GetChapterContentParams, payload: dict, mutations: dict
):
    """Get Chapter Content."""
    chap_id = params.chap_id
    if chap_id is None:
        ac = payload.get("active_chapter_id")
        if isinstance(ac, int):
            chap_id = ac
    if not isinstance(chap_id, int):
        return {"error": "chap_id is required"}

    start = max(0, params.start)
    max_chars = max(1, min(8000, params.max_chars))
    data = _chapter_content_slice(chap_id, start=start, max_chars=max_chars)
    return data


@chat_tool(description="Write content to a specific chapter.")
async def write_chapter_content(
    params: WriteChapterContentParams, payload: dict, mutations: dict
):
    _write_chapter_content(params.chap_id, params.content)
    mutations["story_changed"] = True
    return {"message": f"Content written to chapter {params.chap_id} successfully"}


@chat_tool(
    description="Replace an exact literal string in a chapter with a new string. Better for small edits to avoid JSON truncation errors."
)
async def replace_text_in_chapter(
    params: ReplaceTextInChapterParams, payload: dict, mutations: dict
):
    # Retrieve current text
    _, path, _pos = _chapter_by_id_or_404(params.chap_id)
    text = path.read_text(encoding="utf-8")

    if params.old_text not in text:
        return {
            "error": "The exact old_text was not found in the chapter. Please ensure it matches exactly or use get_chapter_content to verify the exact string."
        }

    occurrences = text.count(params.old_text)
    if occurrences > 1:
        return {
            "error": f"The old_text was found {occurrences} times. Please provide a more specific old_text to ensure only one instance is replaced, or replace them one by one."
        }

    new_content = text.replace(params.old_text, params.new_text, 1)
    _write_chapter_content(params.chap_id, new_content)
    mutations["story_changed"] = True
    return {"message": f"Successfully replaced text in chapter {params.chap_id}"}


@chat_tool(description="Write summary to a specific chapter.")
async def write_chapter_summary(
    params: WriteChapterSummaryParams, payload: dict, mutations: dict
):
    _write_chapter_summary(params.chap_id, params.summary)
    mutations["story_changed"] = True
    return {"message": f"Summary written to chapter {params.chap_id} successfully"}


@chat_tool(
    description="Generate a chapter summary from its content using AI. Optionally specify a mode for generation style."
)
async def sync_summary(params: SyncSummaryParams, payload: dict, mutations: dict):
    mode = str(params.mode).lower()
    data = await generate_chapter_summary(chap_id=params.chap_id, mode=mode)
    mutations["story_changed"] = True
    return data


@chat_tool(description="Write a full chapter from its summary using AI.")
async def write_chapter(params: WriteChapterParams, payload: dict, mutations: dict):
    data = await write_chapter_from_summary(chap_id=params.chap_id)
    mutations["story_changed"] = True
    return data


@chat_tool(description="Continue writing a chapter from its summary using AI.")
async def continue_chapter(
    params: ContinueChapterParams, payload: dict, mutations: dict
):
    data = await continue_chapter_from_summary(chap_id=params.chap_id)
    mutations["story_changed"] = True
    return data


@chat_tool(description="Create a new chapter with an optional title and book_id.")
async def create_new_chapter(
    params: CreateNewChapterParams, payload: dict, mutations: dict
):
    """Create New Chapter."""
    active = get_active_project_dir()
    if not active:
        return {"error": "No active project"}

    title = params.title.strip()
    chap_id = _create_new_chapter(title, book_id=params.book_id)
    mutations["story_changed"] = True
    return {
        "chap_id": chap_id,
        "title": title,
        "message": f"New chapter {chap_id} created successfully",
    }


@chat_tool(description="Get the heading (title) of a specific chapter.")
async def get_chapter_heading(
    params: GetChapterHeadingParams, payload: dict, mutations: dict
):
    """Get Chapter Heading."""
    _chapter_by_id_or_404(params.chap_id)
    _, chapters = _overview_chapters()
    chapter = next((c for c in chapters if c["id"] == params.chap_id), None)
    heading = chapter.get("title", "") if chapter else ""
    return {"heading": heading}


@chat_tool(description="Write the heading (title) of a specific chapter.")
async def write_chapter_heading(
    params: WriteChapterHeadingParams, payload: dict, mutations: dict
):
    """Write Chapter Heading."""
    heading = params.heading.strip()
    write_chapter_title(params.chap_id, heading)
    mutations["story_changed"] = True
    return {
        "heading": heading,
        "message": f"Heading for chapter {params.chap_id} updated successfully",
    }


@chat_tool(description="Get the summary of a specific chapter.")
async def get_chapter_summary(
    params: GetChapterSummaryParams, payload: dict, mutations: dict
):
    """Get Chapter Summary."""
    _chapter_by_id_or_404(params.chap_id)
    _, chapters = _overview_chapters()
    chapter = next((c for c in chapters if c["id"] == params.chap_id), None)
    summary = chapter.get("summary", "") if chapter else ""
    return {"summary": summary}


@chat_tool(
    description="Delete a specific chapter. Requires confirmation by setting confirm=true."
)
async def delete_chapter(params: DeleteChapterParams, payload: dict, mutations: dict):
    """Delete Chapter."""
    if not params.confirm:
        return {
            "status": "confirmation_required",
            "message": "This operation deletes the chapter. Call again with confirm=true to proceed.",
        }

    active = get_active_project_dir()
    files = _scan_chapter_files()
    match = next(((idx, p) for (idx, p) in files if idx == params.chap_id), None)
    if not match:
        return {"error": "Chapter not found"}

    _, path = match
    if path.exists():
        path.unlink()

    story_path = active / "story.json"
    story = load_story_config(story_path) or {}
    chapters = story.get("chapters", [])
    if params.chap_id < len(chapters):
        idx_to_remove = params.chap_id - 1
        if 0 <= idx_to_remove < len(chapters):
            chapters.pop(idx_to_remove)
            story["chapters"] = chapters
            with open(story_path, "w", encoding="utf-8") as f:
                _json.dump(story, f, indent=2, ensure_ascii=False)

    mutations["story_changed"] = True
    return {"ok": True, "message": "Chapter deleted"}


class CallWritingLlmParams(BaseModel):
    instruction: str = Field(
        ...,
        description="The task for the WRITING LLM (e.g. 'Rewrite this paragraph to be more descriptive').",
    )
    context: str = Field(
        ..., description="The text context the WRITING LLM needs to operate on."
    )


@chat_tool(
    description="Delegate a creative writing or rewriting task to the WRITING LLM. Useful when the editor needs new content generated."
)
async def call_writing_llm(
    params: CallWritingLlmParams, payload: dict, mutations: dict
):
    from augmentedquill.services.llm import llm

    base_url, api_key, model_id, timeout_s, model_name = llm.resolve_openai_credentials(
        payload, model_type="WRITING"
    )

    messages = [
        {
            "role": "system",
            "content": "You are a skilled novelist. Provide the exact text requested without explanations.",
        },
        {
            "role": "user",
            "content": f"Instruction:\n{params.instruction}\n\nContext:\n{params.context}",
        },
    ]

    response = await llm.unified_chat_complete(
        caller_id="chat_tools.call_writing_llm",
        model_type="WRITING",
        messages=messages,
        base_url=base_url,
        api_key=api_key,
        model_id=model_id,
        timeout_s=timeout_s,
        model_name=model_name,
    )
    return {"generated_text": response.get("content", "")}


class CallEditingAssistantParams(BaseModel):
    task: str = Field(
        ...,
        description="The task the user wants the editor to perform (e.g., 'Fix the grammar in Chapter 1', 'Rewrite paragraph 2 to be more descriptive').",
    )


@chat_tool(
    description="Delegate a complex story editing, text revision, or structural task to the EDITING LLM. Use this whenever the user asks for direct editing, fixing, rewriting or evaluating."
)
async def call_editing_assistant(
    params: CallEditingAssistantParams, payload: dict, mutations: dict
):
    from augmentedquill.services.llm import llm
    from augmentedquill.services.chat.chat_tool_decorator import (
        execute_registered_tool,
        get_registered_tool_schemas,
    )
    from augmentedquill.core.prompts import (
        load_model_prompt_overrides,
        get_system_message,
    )
    from augmentedquill.core.config import load_machine_config, BASE_DIR
    import json

    # Resolve EDITING model
    base_url, api_key, model_id, timeout_s, model_name = llm.resolve_openai_credentials(
        payload, model_type="EDITING"
    )

    machine_config = load_machine_config(BASE_DIR / "config" / "machine.json") or {}
    model_overrides = load_model_prompt_overrides(machine_config, model_name)
    sys_msg = get_system_message("editing_llm", model_overrides, language="en")

    messages = [
        {"role": "system", "content": sys_msg},
        {
            "role": "user",
            "content": f"Please perform the following editing task:\n{params.task}",
        },
    ]

    all_tools = get_registered_tool_schemas()
    tools = [
        t
        for t in all_tools
        if t.get("function", {}).get("name") != "call_editing_assistant"
    ]

    final_output = ""
    for _ in range(7):  # max 7 steps
        try:
            res = await llm.unified_chat_complete(
                caller_id="chat_tools.call_editing_assistant",
                model_type="EDITING",
                messages=messages,
                base_url=base_url,
                api_key=api_key,
                model_id=model_id,
                timeout_s=timeout_s,
                model_name=model_name,
                tools=tools,
            )
        except Exception as e:
            # Llama.cpp and some endpoints return 500 when tool call JSON is malformed
            # Catching it gives the subagent a chance to adjust (e.g. use smaller chunk sizes)
            err_msg = str(e)
            messages.append(
                {
                    "role": "user",
                    "content": f"System Warning: Your previous attempt failed with an API/parsing error ({err_msg}). This typically occurs if your output was truncated due to length limits or formed invalid JSON. Please try again using smaller operations, shorter text chunks, or a different approach.",
                }
            )
            continue

        tool_calls = res.get("tool_calls", [])
        content = res.get("content", "")

        assistant_msg = {"role": "assistant"}
        if content:
            assistant_msg["content"] = content
        if tool_calls:
            assistant_msg["tool_calls"] = tool_calls

        messages.append(assistant_msg)

        if not tool_calls:
            final_output = content
            break

        for tcall in tool_calls:
            func = tcall.get("function", {})
            f_name = func.get("name")
            f_args = func.get("arguments", "{}")
            if isinstance(f_args, str):
                try:
                    f_args = json.loads(f_args)
                except Exception:
                    f_args = {}
            tcall_id = tcall.get("id")

            tool_res = await execute_registered_tool(
                f_name, f_args, tcall_id, payload, mutations
            )
            if "role" not in tool_res:
                tool_res = {
                    "role": "tool",
                    "tool_call_id": tcall_id,
                    "name": f_name,
                    "content": json.dumps(tool_res),
                }
            messages.append(tool_res)

    if not final_output:
        final_output = "Task completed using tools."

    return {"message": "Editing Assistant finished", "response": final_output}
