# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Unit tests for the settings_machine_ops helpers that exercise caching.

These tests focus on remote_model_exists, which now provides an in-memory
TTL cache and coalesces parallel requests.  The behaviour mirrors the
existing caching in ``verify_model_capabilities`` but is simpler and
focused on existence checks.
"""

import asyncio
import time
from unittest import IsolatedAsyncioTestCase
from unittest.mock import patch

from augmentedquill.services.settings import settings_machine_ops as ops


class SettingsMachineOpsTest(IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        ops._model_exists_cache.clear()
        ops._model_exists_inflight.clear()

    async def test_remote_model_exists_cache_and_ttl(self):
        call_count = 0

        async def fake_probe(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return True, None

        with patch.object(ops, "_remote_model_exists_probe", fake_probe):
            params = {
                "base_url": "https://example.invalid/v1",
                "api_key": "key",
                "model_id": "foo",
                "timeout_s": 1,
            }

            res1 = await ops.remote_model_exists(**params)
            self.assertEqual(res1, (True, None))
            self.assertEqual(call_count, 1)

            # second invocation should hit the cache and not increment
            res2 = await ops.remote_model_exists(**params)
            self.assertEqual(res2, (True, None))
            self.assertEqual(call_count, 1)

            # expire the cache entry and ensure we call probe again
            key = ops._exists_cache_key(
                params["base_url"], params["api_key"], params["model_id"]
            )
            ops._model_exists_cache[key] = (time.monotonic() - 1, True)

            res3 = await ops.remote_model_exists(**params)
            self.assertEqual(res3, (True, None))
            self.assertEqual(call_count, 2)

    async def test_remote_model_exists_coalesces_parallel_requests(self):
        call_count = 0

        async def fake_probe(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.01)
            return True, None

        with patch.object(ops, "_remote_model_exists_probe", fake_probe):
            params = {
                "base_url": "https://example.invalid/v1",
                "api_key": "key",
                "model_id": "bar",
                "timeout_s": 1,
            }

            # fire two concurrent requests; they should share the same probe task
            task1 = asyncio.create_task(ops.remote_model_exists(**params))
            task2 = asyncio.create_task(ops.remote_model_exists(**params))

            result1 = await task1
            result2 = await task2

            self.assertEqual(result1, (True, None))
            self.assertEqual(result2, (True, None))
            self.assertEqual(call_count, 1)
