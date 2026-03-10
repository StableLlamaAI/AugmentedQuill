# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Verifies LLM capability caching and parallel request coalescing behavior."""

import asyncio
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from augmentedquill.utils import llm_utils


class LlmUtilsTest(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        llm_utils._clear_model_capabilities_cache_for_tests()

    async def test_verify_model_capabilities_uses_ttl_cache(self):
        mocked_probe = AsyncMock(
            return_value={"is_multimodal": True, "supports_function_calling": False}
        )

        with patch.object(llm_utils, "_probe_model_capabilities", mocked_probe):
            result_one = await llm_utils.verify_model_capabilities(
                base_url="https://example.invalid/v1",
                api_key="secret",
                model_id="gpt-demo",
                timeout_s=5,
                cache_ttl_s=3600,
            )
            result_two = await llm_utils.verify_model_capabilities(
                base_url="https://example.invalid/v1",
                api_key="secret",
                model_id="gpt-demo",
                timeout_s=5,
                cache_ttl_s=3600,
            )

        self.assertEqual(result_one, result_two)
        self.assertEqual(mocked_probe.await_count, 1)

    async def test_verify_model_capabilities_coalesces_parallel_calls(self):
        async def slow_probe(**kwargs):
            await asyncio.sleep(0.05)
            return {"is_multimodal": False, "supports_function_calling": True}

        mocked_probe = AsyncMock(side_effect=slow_probe)

        with patch.object(llm_utils, "_probe_model_capabilities", mocked_probe):
            results = await asyncio.gather(
                llm_utils.verify_model_capabilities(
                    base_url="https://example.invalid/v1",
                    api_key="secret",
                    model_id="gpt-demo",
                    timeout_s=5,
                    cache_ttl_s=0,
                ),
                llm_utils.verify_model_capabilities(
                    base_url="https://example.invalid/v1",
                    api_key="secret",
                    model_id="gpt-demo",
                    timeout_s=5,
                    cache_ttl_s=0,
                ),
                llm_utils.verify_model_capabilities(
                    base_url="https://example.invalid/v1",
                    api_key="secret",
                    model_id="gpt-demo",
                    timeout_s=5,
                    cache_ttl_s=0,
                ),
            )

        self.assertEqual(mocked_probe.await_count, 1)
        self.assertTrue(all(result == results[0] for result in results))

    async def test_verify_model_capabilities_without_cache_reprobes(self):
        mocked_probe = AsyncMock(
            return_value={"is_multimodal": False, "supports_function_calling": False}
        )

        with patch.object(llm_utils, "_probe_model_capabilities", mocked_probe):
            await llm_utils.verify_model_capabilities(
                base_url="https://example.invalid/v1",
                api_key="secret",
                model_id="gpt-demo",
                timeout_s=5,
                cache_ttl_s=0,
            )
            await llm_utils.verify_model_capabilities(
                base_url="https://example.invalid/v1",
                api_key="secret",
                model_id="gpt-demo",
                timeout_s=5,
                cache_ttl_s=0,
            )

        self.assertEqual(mocked_probe.await_count, 2)
