// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Test URL sanitization helpers used by image insertion.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { isSafeImageUrl } from './Editor';

describe('isSafeImageUrl', () => {
  it('allows safe HTTP/HTTPS and relative paths', () => {
    expect(isSafeImageUrl('http://example.com/image.png')).toBe(true);
    expect(isSafeImageUrl('https://example.com/image.png')).toBe(true);
    expect(isSafeImageUrl('/images/foo.png')).toBe(true);
    expect(isSafeImageUrl('./images/foo.png')).toBe(true);
    expect(isSafeImageUrl('../images/foo.png')).toBe(true);
  });

  it('rejects dangerous protocols and malformed URLs', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafeImageUrl('vbscript:foo')).toBe(false);
    expect(isSafeImageUrl('https://')).toBe(false);
  });

  it('rejects disallowed url forms and blank input', () => {
    expect(isSafeImageUrl('ftp://example.com/foo.png')).toBe(false);
    expect(isSafeImageUrl('//example.com/foo.png')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
  });
});
