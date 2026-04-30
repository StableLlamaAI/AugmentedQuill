// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Validate mutation tool registry mappings for chat tool events.
 */

import { describe, expect, it } from 'vitest';

import { MUTATION_TOOL_REGISTRY } from './mutationToolRegistry';

describe('mutationToolRegistry', () => {
  it('produces sensible mutations for replace_in_project change_locations', () => {
    const factory = MUTATION_TOOL_REGISTRY.replace_in_project;
    expect(factory).toBeDefined();

    const mutations = factory({
      args: {},
      result: {
        change_locations: [
          {
            type: 'chapter',
            target_id: '1',
            field: 'summary',
            label: 'Chapter 1 summary',
          },
          {
            type: 'sourcebook',
            target_id: 'Fred',
            field: 'description',
            label: "Sourcebook 'Fred' Description",
          },
          {
            type: 'metadata',
            target_id: 'story',
            field: 'story_summary',
            label: 'Story summary',
          },
        ],
      },
    });

    expect(Array.isArray(mutations)).toBe(true);
    expect(mutations).toHaveLength(3);
    expect(mutations[0]).toMatchObject({
      type: 'chapter',
      targetId: '1',
      label: 'Chapter 1 summary',
    });
    expect(mutations[1]).toMatchObject({
      type: 'sourcebook',
      targetId: 'Fred',
      label: "Sourcebook 'Fred' Description",
    });
    expect(mutations[2]).toMatchObject({
      type: 'metadata',
      label: 'Story summary',
      subType: 'summary',
    });
  });

  it('falls back to changed_sections when change_locations are unavailable', () => {
    const factory = MUTATION_TOOL_REGISTRY.replace_in_project;
    const mutations = factory({
      args: {},
      result: {
        changed_sections: [
          'Chapter 1: The Dusty Discovery summary',
          "Sourcebook 'Fred' Description",
          'Story summary',
        ],
      },
    });

    expect(Array.isArray(mutations)).toBe(true);
    expect(mutations).toHaveLength(3);
    expect(mutations[0]).toMatchObject({
      type: 'chapter',
      targetId: '1',
      label: 'Chapter 1: The Dusty Discovery summary',
    });
    expect(mutations[1]).toMatchObject({
      type: 'sourcebook',
      targetId: 'Fred',
      label: "Sourcebook 'Fred' Description",
    });
    expect(mutations[2]).toMatchObject({
      type: 'metadata',
      label: 'Story summary',
      subType: 'summary',
    });
  });
});
