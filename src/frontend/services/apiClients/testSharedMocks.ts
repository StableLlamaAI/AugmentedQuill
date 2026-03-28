// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines shared API client test mocks so repeated vitest mock plumbing stays centralized and consistent.
 */

import { afterEach, vi } from 'vitest';

export const registerSharedApiMockCleanup = (): void => {
  afterEach(() => {
    vi.clearAllMocks();
  });
};
