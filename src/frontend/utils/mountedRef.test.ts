// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines mountedRef.test unit to guard against StrictMode lifecycle regressions.
 */

import { describe, expect, it } from 'vitest';

import { setupMountedRefLifecycle } from './mountedRef';

describe('setupMountedRefLifecycle', () => {
  it('re-arms mounted state on remount after cleanup', () => {
    const mountedRef = { current: false };

    const firstCleanup = setupMountedRefLifecycle(mountedRef);
    expect(mountedRef.current).toBe(true);

    // React StrictMode in development runs cleanup and setup again.
    firstCleanup();
    expect(mountedRef.current).toBe(false);

    const secondCleanup = setupMountedRefLifecycle(mountedRef);
    expect(mountedRef.current).toBe(true);

    secondCleanup();
    expect(mountedRef.current).toBe(false);
  });
});
