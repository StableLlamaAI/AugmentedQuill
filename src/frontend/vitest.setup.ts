// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Vitest setup file for initializing i18n and mocking DOM APIs.
 */

import './features/app/i18n';

// Mock getClientRects for CodeMirror tests in jsdom
Object.defineProperty(Range.prototype, 'getClientRects', {
  value: function () {
    return [];
  },
  writable: true,
});

// Mock getBoundingClientRect for elements
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  value: function () {
    return {
      width: 100,
      height: 20,
      top: 0,
      left: 0,
      bottom: 20,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  },
  writable: true,
});
