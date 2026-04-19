# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Defines the test sourcebook keyword generation flow unit so this responsibility stays isolated, testable, and easy to evolve."""

import os
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from augmentedquill.services.projects.projects import select_project
from augmentedquill.services.sourcebook.sourcebook_helpers import (
    sourcebook_create_entry,
    sourcebook_generate_keywords_with_editing_model,
    sourcebook_generate_missing_keywords,
)


class SourcebookKeywordGenerationFlowTest(TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.projects_root = Path(self.td.name) / "projects"
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.registry_path = Path(self.td.name) / "projects.json"

        os.environ["AUGQ_PROJECTS_ROOT"] = str(self.projects_root)
        os.environ["AUGQ_PROJECTS_REGISTRY"] = str(self.registry_path)

        ok, msg = select_project("test_kw_flow")
        self.assertTrue(ok, msg)

    def tearDown(self):
        os.environ.pop("AUGQ_PROJECTS_ROOT", None)
        os.environ.pop("AUGQ_PROJECTS_REGISTRY", None)

    def test_keyword_generation_uses_writing_model_and_request_limits(self):
        payload = {"model_name": "unit-test"}

        async def _run():
            with (
                patch.dict(os.environ, {"PYTEST_CURRENT_TEST": ""}),
                patch(
                    "augmentedquill.services.llm.llm.resolve_openai_credentials",
                    return_value=(
                        "http://localhost:8080/v1",
                        "key",
                        "model-id",
                        15,
                        "unit-test",
                    ),
                ) as mocked_resolve,
                patch(
                    "augmentedquill.services.llm.llm.unified_chat_complete",
                    new=AsyncMock(
                        return_value={"content": '{"keywords": ["alpha", "beta"]}'}
                    ),
                ) as mocked_complete,
            ):
                result = await sourcebook_generate_keywords_with_editing_model(
                    name="Anne",
                    description="Short description.",
                    synonyms=["slave"],
                    payload=payload,
                )

                self.assertEqual(result, ["alpha", "beta"])
                mocked_resolve.assert_called_once_with(payload, model_type="WRITING")
                kwargs = mocked_complete.await_args.kwargs
                self.assertEqual(kwargs["model_type"], "WRITING")
                self.assertEqual(kwargs["max_tokens"], 256)
                self.assertEqual(kwargs["temperature"], 0.2)
                self.assertEqual(kwargs["timeout_s"], 90)

        self._run_async(_run())

    def test_keyword_generation_timeout_bounds_upper(self):
        async def _run():
            with (
                patch.dict(os.environ, {"PYTEST_CURRENT_TEST": ""}),
                patch(
                    "augmentedquill.services.llm.llm.resolve_openai_credentials",
                    return_value=(
                        "http://localhost:8080/v1",
                        "key",
                        "model-id",
                        999,
                        "unit-test",
                    ),
                ),
                patch(
                    "augmentedquill.services.llm.llm.unified_chat_complete",
                    new=AsyncMock(return_value={"content": '{"keywords": ["alpha"]}'}),
                ) as mocked_complete,
            ):
                await sourcebook_generate_keywords_with_editing_model(
                    name="Anne",
                    description="Short description.",
                    synonyms=["slave"],
                    payload={},
                )
                kwargs = mocked_complete.await_args.kwargs
                self.assertEqual(kwargs["timeout_s"], 300)

        self._run_async(_run())

    def test_generate_missing_keywords_only_refreshes_entries_without_keywords(self):
        sourcebook_create_entry(
            name="Needs Keywords",
            description="Keyword generation target.",
            category="Character",
            keywords=[],
        )
        sourcebook_create_entry(
            name="Has Keywords",
            description="Already covered.",
            category="Character",
            keywords=["covered"],
        )

        async def _run():
            with patch(
                "augmentedquill.services.sourcebook.sourcebook_keyword_service.sourcebook_refresh_entry_keywords",
                new=AsyncMock(return_value={}),
            ) as mocked_refresh:
                await sourcebook_generate_missing_keywords(payload={"k": "v"})
                mocked_refresh.assert_awaited_once_with(
                    "Needs Keywords", payload={"k": "v"}
                )

        self._run_async(_run())

    def _run_async(self, coro):
        import asyncio

        return asyncio.run(coro)
