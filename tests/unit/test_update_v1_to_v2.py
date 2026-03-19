# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test update v1 to v2 unit so this responsibility stays isolated, testable, and easy to evolve."""

from unittest import TestCase

from augmentedquill.updates.update_v1_to_v2 import update_story_config_v1_to_v2


class UpdateV1ToV2Test(TestCase):
    def test_updates_metadata_version_when_present(self):
        cfg = {"metadata": {"version": 1}, "project_title": "P"}
        out = update_story_config_v1_to_v2(cfg)
        self.assertEqual(out["metadata"]["version"], 2)

    def test_leaves_config_unchanged_when_metadata_missing(self):
        cfg = {"project_title": "P"}
        out = update_story_config_v1_to_v2(cfg)
        self.assertEqual(out, {"project_title": "P"})
