"""
Centralized prompts configuration for LLM interactions.

This module contains all system messages and user prompt templates used throughout the application.
Prompts can be overridden on a per-model basis through the settings.
"""

from typing import Dict, Any, Optional
import json as _json


# Default system messages
DEFAULT_SYSTEM_MESSAGES = {
    "story_writer": "You are a skilled novelist. Write compelling, coherent prose in the voice and style of the project.",
    "story_continuer": "You are a helpful writing assistant. Continue the chapter, matching tone, characters, and style.",
    "chapter_summarizer": "You are an expert story editor. Write a concise summary capturing plot, characters, tone, and open threads.",
    "story_summarizer": (
        "You are an expert story editor. Write a comprehensive summary of the entire story "
        "based on the chapter summaries provided. Capture the overall plot, main characters, "
        "themes, tone, and narrative arc."
    ),
    "chat_llm": (
        "You are an AI writing assistant specialized in creative story writing. "
        "When helping users write stories, follow this structured process:\n\n"
        "1. **First**: Set appropriate tags for style and create a comprehensive story summary that "
        "captures the overall plot, main characters, themes, and narrative arc.\n\n"
        "2. **Second**: Create chapters with meaningful titles and detailed summaries for each chapter.\n\n"
        "3. **Third**: Generate the full chapter texts based on the summaries.\n\n"
        "Always maintain consistency in tone, characters, and style throughout the story. "
        "Use the available tools to manage story structure and content. "
        "Stop after each step and ask the user whether to continue or refine the last step."
    ),
}


# User prompt templates
DEFAULT_USER_PROMPTS = {
    "chapter_summary_new": "Chapter text:\n\n{chapter_text}\n\nTask: Write a new summary (5-10 sentences).",
    "chapter_summary_update": (
        "Existing summary:\n\n{existing_summary}\n\nChapter text:\n\n{chapter_text}\n\n"
        "Task: Update the summary to accurately reflect the chapter, keeping style and brevity."
    ),
    "write_chapter": (
        "Project: {project_title}\nTitle: {chapter_title}\n\nSummary:\n\n{chapter_summary}\n\n"
        "Task: Write the full chapter as continuous prose. Maintain voice and pacing."
    ),
    "continue_chapter": (
        "Title: {chapter_title}\n\nSummary:\n{chapter_summary}\n\nExisting chapter text (do not change):\n\n{existing_text}\n\n"
        "Task: Continue the chapter from where it stops to advance the summary coherently."
    ),
    "story_summary_new": "Chapter summaries:\n\n{chapter_summaries}\n\nTask: Write a comprehensive story summary (10-20 sentences).",
    "story_summary_update": (
        "Existing story summary:\n\n{existing_summary}\n\nChapter summaries:\n\n{chapter_summaries}\n\n"
        "Task: Update the story summary to accurately reflect all chapters, keeping style and comprehensiveness."
    ),
}


def get_system_message(message_type: str, model_overrides: Optional[Dict[str, Any]] = None) -> str:
    """
    Get a system message, checking for model-specific overrides first.

    Args:
        message_type: The type of system message (e.g., 'story_writer', 'chat_llm')
        model_overrides: Dictionary of model-specific prompt overrides

    Returns:
        The system message string
    """
    if model_overrides and message_type in model_overrides:
        return model_overrides[message_type]

    return DEFAULT_SYSTEM_MESSAGES.get(message_type, "")


def get_user_prompt(prompt_type: str, **kwargs) -> str:
    """
    Get a formatted user prompt template.

    Args:
        prompt_type: The type of user prompt
        **kwargs: Variables to format into the prompt

    Returns:
        The formatted user prompt string
    """
    template = DEFAULT_USER_PROMPTS.get(prompt_type, "")
    if not template:
        return ""

    try:
        return template.format(**kwargs)
    except KeyError as e:
        raise ValueError(f"Missing required parameter for prompt {prompt_type}: {e}")


def load_model_prompt_overrides(machine_config: Dict[str, Any], selected_model: Optional[str] = None) -> Dict[str, str]:
    """
    Load prompt overrides for a specific model from machine config.

    Args:
        machine_config: The machine configuration dictionary
        selected_model: The selected model name

    Returns:
        Dictionary of prompt overrides for the model
    """
    if not selected_model:
        return {}

    openai_cfg = machine_config.get("openai", {})
    models = openai_cfg.get("models", [])

    for model in models:
        if isinstance(model, dict) and model.get("name") == selected_model:
            return model.get("prompt_overrides", {})

    return {}