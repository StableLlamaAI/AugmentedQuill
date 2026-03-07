// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import { describe, it, expect } from 'vitest';
import { computeSyncUpdates } from './metadataSync';

interface Params {
  title?: string;
  summary?: string;
  notes?: string;
  private_notes?: string;
}

const base: Params = {
  title: 'T',
  summary: 'S',
  notes: 'N',
  private_notes: 'P',
};

function copy(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

describe('computeSyncUpdates', () => {
  it('returns empty when nothing changed', () => {
    const prev = copy(base);
    const cur = copy(base);
    const local = copy(base);
    expect(computeSyncUpdates(prev, cur, local)).toEqual({});
  });

  it('applies external change when no local edits', () => {
    const prev = copy(base);
    const cur = { ...base, summary: 'S2' };
    const local = copy(base);
    expect(computeSyncUpdates(prev, cur, local)).toEqual({ summary: 'S2' });
  });

  it('does not overwrite dirty local field', () => {
    const prev = copy(base);
    const cur = { ...base, summary: 'S2' };
    const local = { ...base, summary: 'S+dirty' };
    expect(computeSyncUpdates(prev, cur, local)).toEqual({});
  });

  it('handles multiple fields independently', () => {
    const prev = copy(base);
    const cur = { ...base, title: 'T2', notes: 'N2' };
    const local = { ...base, notes: 'dirty' };
    // title should update, notes skip
    expect(computeSyncUpdates(prev, cur, local)).toEqual({ title: 'T2' });
  });
});
