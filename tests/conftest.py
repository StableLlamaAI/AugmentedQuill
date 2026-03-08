# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the conftest unit so this responsibility stays isolated, testable, and easy to evolve."""

import os
import tempfile
from pathlib import Path

import pytest

# Global temporary directory for the whole test session.
# This is configured at import time so path constants in imported modules
# resolve to temp locations during test collection.
_SESSION_TEMP_DIR = tempfile.TemporaryDirectory(prefix="augq_test_session_")
_SESSION_ROOT = Path(_SESSION_TEMP_DIR.name)
_SESSION_DATA_DIR = _SESSION_ROOT / "data"
_SESSION_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Provide a default machine config for tests so that SSRF validation
# and model-related services don't fail by default.
_SESSION_CONFIG_DIR = _SESSION_ROOT / "config"
_SESSION_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
_SESSION_MACHINE_JSON = _SESSION_CONFIG_DIR / "machine.json"
_SESSION_MACHINE_JSON.write_text(
    """
{
  "openai": {
    "models": [
      {
        "name": "gpt-4o",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o"
      }
    ]
  }
}
"""
)

_ORIG_USER_DATA_DIR = os.environ.get("AUGQ_USER_DATA_DIR")
_ORIG_PROJECTS_ROOT = os.environ.get("AUGQ_PROJECTS_ROOT")
_ORIG_PROJECTS_REGISTRY = os.environ.get("AUGQ_PROJECTS_REGISTRY")
_ORIG_MACHINE_CONFIG_PATH = os.environ.get("AUGQ_MACHINE_CONFIG_PATH")

os.environ["AUGQ_USER_DATA_DIR"] = str(_SESSION_DATA_DIR)
os.environ["AUGQ_PROJECTS_ROOT"] = str(_SESSION_ROOT / "projects")
os.environ["AUGQ_PROJECTS_REGISTRY"] = str(_SESSION_ROOT / "projects.json")
os.environ["AUGQ_MACHINE_CONFIG_PATH"] = str(_SESSION_MACHINE_JSON)


@pytest.fixture(scope="session", autouse=True)
def session_temp_env():
    temp_data = Path(os.environ["AUGQ_USER_DATA_DIR"])
    temp_data.mkdir(parents=True, exist_ok=True)
    temp_projects = Path(os.environ["AUGQ_PROJECTS_ROOT"])
    temp_projects.mkdir(parents=True, exist_ok=True)

    yield

    # Clean up
    if _SESSION_TEMP_DIR:
        _SESSION_TEMP_DIR.cleanup()

    # Restore originals if they were there
    if _ORIG_USER_DATA_DIR is not None:
        os.environ["AUGQ_USER_DATA_DIR"] = _ORIG_USER_DATA_DIR
    else:
        os.environ.pop("AUGQ_USER_DATA_DIR", None)

    if _ORIG_PROJECTS_ROOT is not None:
        os.environ["AUGQ_PROJECTS_ROOT"] = _ORIG_PROJECTS_ROOT
    else:
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)

    if _ORIG_PROJECTS_REGISTRY is not None:
        os.environ["AUGQ_PROJECTS_REGISTRY"] = _ORIG_PROJECTS_REGISTRY
    else:
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    if _ORIG_MACHINE_CONFIG_PATH is not None:
        os.environ["AUGQ_MACHINE_CONFIG_PATH"] = _ORIG_MACHINE_CONFIG_PATH
    else:
        os.environ.pop("AUGQ_MACHINE_CONFIG_PATH", None)
