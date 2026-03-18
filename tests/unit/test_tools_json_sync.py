# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Ensure tools.json matches the canonical chat tool registry.

This prevents drift between the schema used for LLM function calling and the
actual implementation of the tools.
"""

import json
import subprocess
from pathlib import Path

from augmentedquill.services.chat.chat_tool_decorator import get_registered_tool_schemas


def _sorted_tools(tools: list[dict]) -> list[dict]:
    return sorted(tools, key=lambda t: t.get("function", {}).get("name", ""))


def test_tools_json_generator_matches_registry():
    """Ensure the generator produces schema matching the canonical registry."""

    expected = _sorted_tools(get_registered_tool_schemas(None))

    import sys

    # Run the generator script and capture the path it wrote to.
    result = subprocess.run(
        [
            sys.executable,
            "tools/generate_tools_json.py",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    # The script prints a line like: "Wrote N tools to /tmp/augmentedquill-tools-XXXX.json"
    out = result.stdout.strip().splitlines()[-1]
    assert out.startswith("Wrote"), f"Unexpected generator output: {out}"
    path = out.split(" to ", 1)[-1].strip()

    actual = json.loads(Path(path).read_text(encoding="utf-8"))

    assert expected == _sorted_tools(actual)

    # Clean up the temp file for hygiene.
    Path(path).unlink(missing_ok=True)
