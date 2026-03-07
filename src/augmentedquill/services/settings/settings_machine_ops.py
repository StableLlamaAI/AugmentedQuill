# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the settings machine ops unit so this responsibility stays isolated, testable, and easy to evolve."""

from __future__ import annotations

import httpx

from augmentedquill.services.llm.llm_http_ops import logged_request
from augmentedquill.services.llm.llm_completion_ops import _validate_base_url


def auth_headers(api_key: str | None) -> dict[str, str]:
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def parse_connection_payload(payload: dict | None) -> tuple[str, str | None, int]:
    """Parse Connection Payload."""
    base_url = (payload or {}).get("base_url") or ""
    api_key = (payload or {}).get("api_key") or None
    timeout_s = (payload or {}).get("timeout_s")
    try:
        timeout_s = int(timeout_s) if timeout_s is not None else 10
    except Exception:
        timeout_s = 10
    return str(base_url), (str(api_key) if api_key else None), timeout_s


async def list_remote_models(
    *, base_url: str, api_key: str | None, timeout_s: int
) -> tuple[bool, list[str], str | None]:
    """List Remote Models."""
    url = str(base_url or "").strip().rstrip("/") + "/models"
    try:
        # We allow any user-provided URL during the testing phase in settings.
        # This is because the user is explicitly providing this URL, which confirms trust.
        _validate_base_url(base_url, skip_validation=True)
    except ValueError as e:
        return False, [], str(e)

    headers = auth_headers(api_key)

    try:
        timeout_obj = httpx.Timeout(float(timeout_s))
    except Exception:
        timeout_obj = httpx.Timeout(10.0)

    try:
        response = await logged_request(
            method="GET",
            url=url,
            headers=headers,
            timeout=timeout_obj,
            body=None,
            raise_for_status=False,
        )
        if not response.is_success:
            return False, [], f"HTTP {response.status_code}"
        data = response.json()
    except Exception as exc:
        return False, [], str(exc)

    models: list[str] = []
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        for item in data.get("data") or []:
            if isinstance(item, dict):
                model_id = item.get("id")
                if isinstance(model_id, str) and model_id.strip():
                    models.append(model_id.strip())
    elif isinstance(data, dict) and isinstance(data.get("models"), list):
        for item in data.get("models") or []:
            if isinstance(item, str) and item.strip():
                models.append(item.strip())
            elif isinstance(item, dict):
                model_id = item.get("id")
                if isinstance(model_id, str) and model_id.strip():
                    models.append(model_id.strip())

    seen: set[str] = set()
    deduped: list[str] = []
    for model in models:
        if model not in seen:
            seen.add(model)
            deduped.append(model)
    return True, deduped, None


async def remote_model_exists(
    *, base_url: str, api_key: str | None, model_id: str, timeout_s: int
) -> tuple[bool, str | None]:
    """Remote Model Exists."""
    base = str(base_url or "").strip().rstrip("/")
    try:
        # We allow any user-provided URL during the testing phase in settings.
        # This is because the user is explicitly providing this URL, which confirms trust.
        _validate_base_url(base_url, skip_validation=True)
    except ValueError as e:
        return False, str(e)

    model_id = str(model_id or "").strip()
    if not model_id:
        return False, "Missing model_id"

    try:
        timeout_obj = httpx.Timeout(float(timeout_s))
    except Exception:
        timeout_obj = httpx.Timeout(10.0)

    headers = {"Content-Type": "application/json", **auth_headers(api_key)}

    try:
        url1 = f"{base}/models/{model_id}"
        response = await logged_request(
            method="GET",
            url=url1,
            headers=auth_headers(api_key),
            timeout=timeout_obj,
            body=None,
            raise_for_status=False,
        )

        if response.is_success:
            return True, None

        url2 = f"{base}/chat/completions"
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "temperature": 0,
        }

        response2 = await logged_request(
            method="POST",
            url=url2,
            headers=headers,
            timeout=timeout_obj,
            body=payload,
            raise_for_status=False,
        )
        if response2.is_success:
            return True, None

        return False, f"HTTP {response2.status_code}"
    except Exception as exc:
        return False, str(exc)
