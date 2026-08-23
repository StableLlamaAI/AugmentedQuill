// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Regression tests for the global accessibility CSS in index.css.
 *
 * jsdom cannot compute styles or match pseudo-classes like :focus-visible, so
 * these tests guard the static rules that implement two core accessibility
 * behaviours:
 *   1. prefers-reduced-motion support (disables animations/transitions).
 *   2. A visible keyboard focus indicator for the CodeMirror editor (which
 *      suppresses its own outline).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Vitest runs from the frontend package root (where vitest.config.ts lives),
// so index.css is a direct sibling of this test file.
const css = readFileSync(resolve(process.cwd(), 'index.css'), 'utf8');

describe('global accessibility CSS', () => {
  it('honours prefers-reduced-motion by disabling animations and transitions', () => {
    const match = css.match(
      /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*{([^}]*)}/s
    );
    expect(match, 'expected a prefers-reduced-motion media block').toBeTruthy();
    const body = match?.[1] ?? '';

    // The universal selector block must neutralise motion for all elements.
    expect(body).toMatch(/\*/);
    expect(body).toMatch(/animation-duration\s*:/);
    expect(body).toMatch(/transition-duration\s*:/);
    // Prevents animated smooth scrolling inside the app.
    expect(body).toMatch(/scroll-behavior\s*:\s*auto/);
  });

  it('provides a visible keyboard focus indicator for the CodeMirror editor', () => {
    const match = css.match(/\.cm-content\s*:focus-visible\s*{([^}]*)}/);
    expect(
      match,
      'expected a .cm-content:focus-visible rule so keyboard focus into the editor is visible'
    ).toBeTruthy();
    const body = match?.[1] ?? '';
    expect(body).toMatch(/outline\s*:/);
    expect(body).toMatch(/outline-offset\s*:/);
  });
});
