from __future__ import annotations

import subprocess
from pathlib import Path

from app.config import _deep_merge, _interpolate_env, load_json_file


def run_story_config_update(
    *,
    base_dir: Path,
    config_dir: Path,
    story_path: Path | None,
    current_schema_version: int,
) -> tuple[bool, str]:
    target_story_path = story_path or (config_dir / "story.json")

    defaults = {}
    json_config = load_json_file(target_story_path)
    json_config = _interpolate_env(json_config)
    merged = _deep_merge(defaults, json_config)

    version = merged.get("metadata", {}).get("version", 0)
    if version >= current_schema_version:
        return True, "Already up to date"

    update_script = (
        base_dir
        / "app"
        / "updates"
        / f"update_v{version}_to_v{current_schema_version}.py"
    )
    if not update_script.exists():
        return (
            False,
            f"No update script found for version {version} to {current_schema_version}",
        )

    python_exe = base_dir / "venv" / "bin" / "python"
    result = subprocess.run(
        [str(python_exe), str(update_script), str(target_story_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False, f"Update failed: {result.stderr}"

    return True, result.stdout.strip()
