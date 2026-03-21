// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Test URL sanitization helpers used by WYSIWYG link/image commands.
 */

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { isSafeImageUrl, isSafeLinkUrl } from './Editor';

describe('isSafeLinkUrl', () => {
  it('allows safe HTTP, HTTPS, FTP, mailto and relative paths', () => {
    expect(isSafeLinkUrl('http://example.com')).toBe(true);
    expect(isSafeLinkUrl('https://example.com')).toBe(true);
    expect(isSafeLinkUrl('ftp://example.com')).toBe(true);
    expect(isSafeLinkUrl('mailto:user@example.com')).toBe(true);
    expect(isSafeLinkUrl('/local/path')).toBe(true);
    expect(isSafeLinkUrl('./relative/path')).toBe(true);
    expect(isSafeLinkUrl('../parent/path')).toBe(true);
  });

  it('rejects dangerous protocols and malformed URLs', () => {
    expect(isSafeLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeLinkUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeLinkUrl('   javascript:foo')).toBe(false);
    expect(isSafeLinkUrl('http://')).toBe(false);
  });

  it('rejects URL-like values not on allowlist', () => {
    expect(isSafeLinkUrl('file://C:/path')).toBe(false);
    expect(isSafeLinkUrl('//example.com')).toBe(false);
    expect(isSafeLinkUrl('example.com')).toBe(false);
    expect(isSafeLinkUrl('')).toBe(false);
  });
});

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
