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

import { buildMetadataFields, MUTATION_TOOL_REGISTRY } from './mutationToolRegistry';
import type { SessionMutation } from './components/MutationTags';

describe('mutationToolRegistry', () => {
  it('produces sensible mutations for replace_in_project change_locations', () => {
    const factory = MUTATION_TOOL_REGISTRY.replace_in_project;
    expect(factory).toBeDefined();

    const mutations = factory({
      args: {},
      result: {
        change_locations: [
          {
            type: 'metadata',
            target_id: '1',
            field: 'summary',
            label: 'Chapter 1: The Dusty Discovery summary',
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
    }) as SessionMutation[];

    expect(Array.isArray(mutations)).toBe(true);
    expect(mutations).toHaveLength(3);
    expect(mutations[0]).toMatchObject({
      type: 'metadata',
      targetId: '1',
      subType: 'summary',
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
    }) as SessionMutation[];

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

describe('buildMetadataFields', () => {
  it('detects patch variants as changed fields', () => {
    const mutations = buildMetadataFields(
      {
        conflicts_patch: { operations: [{ op: 'update', index: 0, updates: {} }] },
      },
      false
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ type: 'metadata', subType: 'conflicts' });
  });

  it('detects summary_patch and notes_patch', () => {
    const mutations = buildMetadataFields(
      {
        summary_patch: { operation: 'append', value: ' extra' },
        notes_patch: { operation: 'replace', value: 'new' },
      },
      false
    );
    expect(mutations).toHaveLength(2);
    expect(mutations[0]).toMatchObject({ subType: 'summary' });
    expect(mutations[1]).toMatchObject({ subType: 'notes' });
  });

  it('does not duplicate fields when both direct and patch args are present', () => {
    const mutations = buildMetadataFields(
      { conflicts: [], conflicts_patch: {} },
      false
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({ subType: 'conflicts' });
  });

  it('attaches chapter target id for update_chapter_metadata mutations', () => {
    const factory = MUTATION_TOOL_REGISTRY.update_chapter_metadata;
    const mutations = factory({
      args: {
        chap_id: 2,
        conflicts_patch: { operations: [{ op: 'update', index: 0, updates: {} }] },
      },
      result: {},
    }) as SessionMutation[];

    expect(Array.isArray(mutations)).toBe(true);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      type: 'metadata',
      subType: 'conflicts',
      targetId: '2',
      label: 'Chapter 2 Conflicts',
    });
  });

  it('uses changed_fields from tool result and suppresses no-op tags', () => {
    const factory = MUTATION_TOOL_REGISTRY.update_chapter_metadata;

    const changed = factory({
      args: {
        chap_id: 2,
        summary_patch: { operation: 'append', value: 'x' },
        notes_patch: { operation: 'append', value: 'y' },
      },
      result: {
        changed_fields: ['notes'],
      },
    }) as SessionMutation[];

    expect(Array.isArray(changed)).toBe(true);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      type: 'metadata',
      subType: 'notes',
      targetId: '2',
      label: 'Chapter 2 Notes',
    });

    const noOp = factory({
      args: {
        chap_id: 2,
        summary_patch: { operation: 'append', value: '' },
      },
      result: {
        changed_fields: [],
      },
    }) as SessionMutation[];

    expect(Array.isArray(noOp)).toBe(true);
    expect(noOp).toHaveLength(0);
  });
});
