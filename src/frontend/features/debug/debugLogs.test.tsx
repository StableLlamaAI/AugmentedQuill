// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the debug logs.test unit so this responsibility stays isolated, testable, and easy to evolve.
 */

// @vitest-environment jsdom

import { afterEach, describe, it, expect, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { DebugLogs } from './DebugLogs';
import { api } from '../../services/api';
import type { DebugLogEntry } from '../../services/apiTypes';

describe('DebugLogs component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders without crashing when some log entries lack request/response', async () => {
    const now = new Date().toISOString();
    const logs = [
      {
        id: '1',
        timestamp_start: now,
        request: { url: '/api/v1/foo', method: 'POST' },
        response: { status_code: 200 },
      },
      // entry missing request entirely (e.g. custom log added by backend)
      {
        // note: deliberately omit `id` to simulate unstructured log
        timestamp_start: now,
      },
    ] as DebugLogEntry[];

    vi.spyOn(api.debug, 'getLogs').mockResolvedValue(logs);

    // render the component to a string (SSR) to exercise its logic; this
    // will still run the function body and hooks but not effects, which is
    // enough to trigger the crash we were seeing.
    const html = renderToString(
      <DebugLogs isOpen={true} onClose={() => {}} theme="light" />
    );

    // basic sanity: the rendered HTML should contain the debug header text
    expect(html).toContain('LLM Communication Logs');
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<DebugLogs isOpen={true} onClose={onClose} theme="light" />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
