# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Pydantic models for machine/settings API requests and responses.

These models define the transport contract between the backend settings
endpoints and the frontend.  Moving them here means FastAPI will include
them in the generated OpenAPI schema so the frontend can import
auto-generated TypeScript types instead of maintaining hand-written copies.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Machine model configuration (a single LLM provider entry)
# ---------------------------------------------------------------------------


class MachineModelConfig(BaseModel):
    """Configuration for a single LLM provider / model entry."""

    name: str
    base_url: str
    api_key: Optional[str] = None
    model: str
    timeout_s: Optional[int] = None
    context_window_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    stop: Optional[list[str]] = None
    seed: Optional[int] = None
    top_k: Optional[int] = None
    min_p: Optional[float] = None
    extra_body: Optional[str] = None
    preset_id: Optional[str] = None
    writing_warning: Optional[str] = None
    is_multimodal: Optional[bool] = None
    supports_function_calling: Optional[bool] = None
    suggest_loop_guard_enabled: Optional[bool] = None
    suggest_loop_guard_ngram: Optional[int] = None
    suggest_loop_guard_min_repeats: Optional[int] = None
    suggest_loop_guard_max_regens: Optional[int] = None
    prompt_overrides: Optional[dict[str, str]] = None


class MachineOpenAIConfig(BaseModel):
    """The ``openai`` section of the machine config."""

    models: Optional[list[MachineModelConfig]] = None
    selected: Optional[str] = None
    selected_chat: Optional[str] = None
    selected_writing: Optional[str] = None
    selected_editing: Optional[str] = None


class MachineConfigResponse(BaseModel):
    """Response body for ``GET /api/v1/machine``."""

    gui_language: Optional[str] = None
    openai: Optional[MachineOpenAIConfig] = None


# ---------------------------------------------------------------------------
# Model presets
# ---------------------------------------------------------------------------


class ModelPresetWarning(BaseModel):
    """Warnings that should be surfaced to the user for a preset."""

    writing: Optional[str] = None


class ModelPresetParameters(BaseModel):
    """Typed parameters for a model preset."""

    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    seed: Optional[int] = None
    top_k: Optional[int] = None
    min_p: Optional[float] = None
    stop: Optional[list[str]] = None
    extra_body: Optional[str] = None


class ModelPresetEntry(BaseModel):
    """A single model-preset entry as loaded from *model_presets.json*.

    ``preset_type`` distinguishes two flavours:

    * ``"absolute"`` (default) – replaces **all** sampling parameters on the
      provider and locks manual editing.  Suitable for a named full profile
      tied to a specific model family.
    * ``"delta"`` – applies **only the non-null fields** in ``parameters`` on
      top of whatever is already configured.  Does not lock the provider or
      change ``preset_id``.  Suitable for cross-model tweaks such as "more
      creative" or "factual focus".
    """

    id: str
    name: str
    description: str
    model_id_patterns: list[str]
    preset_type: Literal["absolute", "delta"] = "absolute"
    parameters: ModelPresetParameters
    warnings: Optional[ModelPresetWarning] = None


class MachinePresetsResponse(BaseModel):
    """Response body for ``GET /api/v1/machine/presets``."""

    presets: list[ModelPresetEntry]


# ---------------------------------------------------------------------------
# Machine test / test-model responses
# ---------------------------------------------------------------------------


class MachineTestResponse(BaseModel):
    """Response body for ``POST /api/v1/machine/test``."""

    ok: bool
    models: list[str] = []
    detail: Optional[str] = None


class ModelCapabilities(BaseModel):
    """Subset of capabilities detected for a model (optional fields)."""

    multimodal: Optional[bool] = None
    function_calling: Optional[bool] = None


class MachineTestModelResponse(BaseModel):
    """Response body for ``POST /api/v1/machine/test_model``."""

    ok: bool
    model_ok: bool
    models: list[str] = []
    detail: Optional[str] = None
    capabilities: Optional[ModelCapabilities] = None


# ---------------------------------------------------------------------------
# Shared simple responses
# ---------------------------------------------------------------------------


class OkResponse(BaseModel):
    """Generic success response used by endpoints that return ``{ok: true}``."""

    ok: bool
    detail: Optional[str] = None


class OkSelectedResponse(BaseModel):
    """Response for ``PUT /api/v1/machine`` – returns the new selected model name."""

    ok: bool
    selected: Optional[str] = None
    detail: Optional[str] = None


class StorySummaryResponse(BaseModel):
    """Response for ``PUT /api/v1/story/summary``."""

    ok: bool
    story_summary: Optional[str] = None
    detail: Optional[str] = None


class StoryTagsResponse(BaseModel):
    """Response for ``PUT /api/v1/story/tags``."""

    ok: bool
    tags: Optional[list[str]] = None
    detail: Optional[str] = None


class PromptsResponse(BaseModel):
    """Response for ``GET /api/v1/prompts``."""

    ok: bool
    system_messages: Optional[dict[str, str]] = None
    user_prompts: Optional[dict[str, str]] = None
    languages: Optional[list[str]] = None
    project_language: Optional[str] = None
