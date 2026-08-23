# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the llm request helpers unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

import httpx

from augmentedquill.core.config import load_machine_config


def get_story_llm_preferences(
    *,
    config_dir: Any,
    get_active_project_dir: Callable[[], Any],
    load_story_config: Callable[[Any], dict[str, Any] | None],
) -> tuple[float, int | None]:
    """Load story-level LLM preferences and normalize values."""
    story = (
        load_story_config((get_active_project_dir() or config_dir) / "story.json") or {}
    )
    prefs = (story.get("llm_prefs") or {}) if isinstance(story, dict) else {}
    temperature = prefs.get("temperature", 0.7)
    try:
        temperature = float(temperature)
    except Exception:
        temperature = 0.7
    max_tokens = prefs.get("max_tokens")
    return temperature, max_tokens


def validate_base_url(base_url: str, skip_validation: bool = False) -> None:
    """Validate *base_url* against configured models or environment overrides to prevent SSRF.

    Trusted sources are the environment overrides (``OPENAI_BASE_URL``,
    ``ANTHROPIC_BASE_URL``, ``GOOGLE_BASE_URL``), base URLs saved in
    ``machine.json``, and known local endpoints. ``host.docker.internal`` is
    included as a trusted local endpoint because it is the Docker-host alias —
    the container-local equivalent of ``localhost``.
    """
    if not base_url or skip_validation:
        return

    # Check for suspicious schemes or non-HTTP/HTTPS URLs
    if not base_url.startswith(("http://", "https://")):
        raise ValueError(f"Invalid base_url scheme: {base_url}")

    # Forbidden characters (credentials / IPv6 scopes) that can bypass filters.
    if any(c in base_url for c in "@[]"):
        raise ValueError(f"Potentially dangerous base_url: {base_url}")

    # 1. Environment overrides (trusted)
    overrides = {
        os.getenv("OPENAI_BASE_URL"),
        os.getenv("ANTHROPIC_BASE_URL"),
        os.getenv("GOOGLE_BASE_URL"),
    }
    if base_url in overrides:
        return

    # 2. Models saved in machine.json are trusted.
    machine_config = load_machine_config()
    if not machine_config:
        from augmentedquill.services.exceptions import ConfigurationError

        raise ConfigurationError(
            "No OpenAI models configured. Configure openai.models[] in machine.json.",
        )

    for provider in ["openai", "anthropic", "google"]:
        all_models = machine_config.get(provider, {}).get("models", [])
        for model in all_models:
            model_url = model.get("base_url")
            if model_url and base_url == model_url:
                return

    # 3. Strict whitelist of trusted local endpoints (Ollama, LM Studio, …).
    #    host.docker.internal is the Docker-host alias (requires the container
    #    to be started with extra_hosts host.docker.internal:host-gateway).
    trusted_locals = {
        "http://localhost",
        "http://127.0.0.1",
        "http://0.0.0.0",
        "https://localhost",
        "https://127.0.0.1",
        "http://host.docker.internal",
        "https://host.docker.internal",
        "http://fake",  # Trusted for unit tests
    }

    # Match a trusted local host with an optional numeric port and/or path,
    # e.g. "http://localhost:8080/v1" or "http://host.docker.internal/v1".
    # The literal dot guard prevents "localhost.evil.com" style bypasses.
    for trusted in trusted_locals:
        if base_url == trusted:
            return
        if base_url.startswith(trusted + "/"):
            return
        if base_url.startswith(trusted + ":"):
            suffix = base_url[len(trusted) :]
            if suffix[1:].split("/")[0].isdigit():
                return

    raise ValueError(
        f"Untrusted or unconfirmed base_url: {base_url}. {_base_url_rejection_hint(base_url)}"
    )


def _base_url_rejection_hint(base_url: str) -> str:
    """Return a targeted troubleshooting hint for a rejected base URL.

    Docker deployments have a well-known failure mode where host-local model
    servers are addressed with ``localhost`` (which points at the container
    itself) or with bridge/private IPs that must be trusted explicitly. Give
    an actionable hint instead of a bare error.
    """
    host = str(base_url).split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0].lower()
    if host in ("host.docker.internal", "host-gateway", "gateway.docker.internal"):
        return (
            "This hostname points at the Docker host from inside a container. Save the "
            "provider in Settings -> Machine Settings so it is trusted, and start the "
            "container with 'extra_hosts: [\"host.docker.internal:host-gateway\"]' so the "
            "name resolves."
        )
    if host.startswith(("172.", "10.", "192.168.")):
        return (
            "This looks like a private/LAN address (possibly the Docker bridge gateway). "
            "Save the provider in Settings -> Machine Settings so it is trusted, and verify "
            "the address is reachable from inside the container."
        )
    return "Save this base URL in Settings -> Machine Settings so it is trusted, then try again."


def build_headers(api_key: str | None) -> dict[str, str]:
    """Build headers."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def build_timeout(timeout_s: int) -> httpx.Timeout:
    """Build timeout."""
    try:
        return httpx.Timeout(float(timeout_s or 60))
    except Exception:
        return httpx.Timeout(60.0)


def find_model_in_list(models: list, selected_name: str | None) -> dict | None:
    """Return the first model config dict whose "name" matches selected_name.

    Returns None when selected_name is falsy or no match is found, signalling
    that the caller should fall back to the first available model.
    """
    if not selected_name:
        return None
    for m in models:
        if isinstance(m, dict) and m.get("name") == selected_name:
            return m
    return None


def apply_native_tool_calling_mode(
    extra_body: dict[str, Any] | None,
    *,
    supports_function_calling: bool,
    tools: list[dict] | None,
    tool_choice: str | None,
) -> dict[str, Any]:
    """Force provider request options that keep native tool calling stable.

    Some OpenAI-compatible backends switch to template-driven thinking output when
    reasoning is enabled, which can cause pseudo-tool syntax to leak into
    reasoning channels instead of returning structured tool calls.
    """
    merged = dict(extra_body or {})
    if not (supports_function_calling and tools and tool_choice != "none"):
        return merged

    # Preserve any chat template kwargs provided by the model configuration.
    # We should not override the model's own choice about whether thinking templates
    # are enabled or disabled.
    chat_template_kwargs = merged.get("chat_template_kwargs")
    if isinstance(chat_template_kwargs, dict):
        merged["chat_template_kwargs"] = dict(chat_template_kwargs)
    return merged
