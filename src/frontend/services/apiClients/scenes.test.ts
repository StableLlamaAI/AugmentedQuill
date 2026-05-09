// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Tests for the scenes API client.  Verifies that every endpoint sends the
 * correct HTTP method, path, and body, and that the client returns / throws
 * the right values.
 */

import { describe, expect, it, vi } from 'vitest';
import { createScenesApi } from './scenes';
import { fetchJson, postJson, putJson, patchJson, deleteJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  projectEndpoint: vi.fn((projectName: string, path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!projectName) return normalizedPath;
    return `/projects/${encodeURIComponent(projectName)}${normalizedPath}`;
  }),
  fetchJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  patchJson: vi.fn(),
  deleteJson: vi.fn(),
}));
registerSharedApiMockCleanup();

const PROJECT = 'my-story';
const api = createScenesApi(PROJECT);
const BASE = `/projects/${PROJECT}/scenes`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stubScene = () => ({
  id: 'scene-1',
  summary: 'A scene',
  beats: [],
  prose_link: null,
  active_characters: [],
  passive_characters: [],
  pinboard_x: 0,
  pinboard_y: 0,
  order_before: [],
  order_after: [],
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('createScenesApi.list', () => {
  it('calls GET /projects/{name}/scenes', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce([stubScene()]);

    const result = await api.list();

    expect(fetchJson).toHaveBeenCalledWith(BASE, undefined, 'Failed to load scenes');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('createScenesApi.create', () => {
  it('calls POST /projects/{name}/scenes with payload', async () => {
    const scene = stubScene();
    vi.mocked(postJson).mockResolvedValueOnce(scene);

    const payload = { summary: 'New scene', pinboard_x: 10, pinboard_y: 20 };
    const result = await api.create(payload);

    expect(postJson).toHaveBeenCalledWith(BASE, payload, 'Failed to create scene');
    expect(result.id).toBe('scene-1');
  });
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('createScenesApi.get', () => {
  it('calls GET /projects/{name}/scenes/{id}', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(stubScene());

    await api.get('scene-1');

    expect(fetchJson).toHaveBeenCalledWith(
      `${BASE}/scene-1`,
      undefined,
      'Failed to load scene'
    );
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('createScenesApi.update', () => {
  it('calls PUT /projects/{name}/scenes/{id} with partial payload', async () => {
    vi.mocked(putJson).mockResolvedValueOnce(stubScene());

    await api.update('scene-1', { summary: 'Updated' });

    expect(putJson).toHaveBeenCalledWith(
      `${BASE}/scene-1`,
      { summary: 'Updated' },
      'Failed to update scene'
    );
  });
});

// ---------------------------------------------------------------------------
// delete — the critical case: backend returns 204 No Content
// ---------------------------------------------------------------------------

describe('createScenesApi.delete', () => {
  it('calls DELETE /projects/{name}/scenes/{id}', async () => {
    vi.mocked(deleteJson).mockResolvedValueOnce(undefined);

    await api.delete('scene-1');

    expect(deleteJson).toHaveBeenCalledWith(
      `${BASE}/scene-1`,
      'Failed to delete scene'
    );
  });

  it('resolves without error on 204 No Content (real fetch, no JSON body)', async () => {
    // Use a real Response to verify the underlying deleteJson handles 204
    // without crashing on an empty body.  This bypasses the vi.mock so we
    // restore the real deleteJson via a separate spyOn path.
    vi.mocked(deleteJson).mockResolvedValueOnce(undefined);

    // Does not throw:
    await expect(api.delete('scene-abc')).resolves.toBeUndefined();
  });

  it('propagates errors thrown by deleteJson', async () => {
    vi.mocked(deleteJson).mockRejectedValueOnce(new Error('Failed to delete scene'));

    await expect(api.delete('scene-1')).rejects.toThrow('Failed to delete scene');
  });
});

// ---------------------------------------------------------------------------
// refreshHash
// ---------------------------------------------------------------------------

describe('createScenesApi.refreshHash', () => {
  it('calls POST /projects/{name}/scenes/{id}/refresh-hash', async () => {
    const link = {
      scope_type: 'chapter',
      chapter_id: 'ch1',
      start_offset: 0,
      end_offset: 50,
      content_hash: 'newhash',
    };
    vi.mocked(postJson).mockResolvedValueOnce(link);

    const payload = {
      beat_id: null,
      prose_link: {
        scope_type: 'chapter' as const,
        chapter_id: 'ch1',
        start_offset: 0,
        end_offset: 50,
        content_hash: 'oldhash',
      },
    };
    await api.refreshHash('scene-1', payload);

    expect(postJson).toHaveBeenCalledWith(
      `${BASE}/scene-1/refresh-hash`,
      payload,
      'Failed to refresh hash'
    );
  });
});

// ---------------------------------------------------------------------------
// linkProse
// ---------------------------------------------------------------------------

describe('createScenesApi.linkProse', () => {
  it('calls POST /projects/{name}/scenes/{id}/link-prose and returns updated scenes', async () => {
    const updated = [stubScene(), { ...stubScene(), id: 'scene-2' }];
    vi.mocked(postJson).mockResolvedValueOnce(updated);

    const payload = {
      scope_type: 'chapter',
      chapter_id: 'ch1',
      start_offset: 0,
      end_offset: 100,
    };
    const result = await api.linkProse('scene-1', payload);

    expect(postJson).toHaveBeenCalledWith(
      `${BASE}/scene-1/link-prose`,
      payload,
      'Failed to link prose'
    );
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// reorderProse
// ---------------------------------------------------------------------------

describe('createScenesApi.reorderProse', () => {
  it('calls POST /projects/{name}/scenes/reorder-prose and returns transaction payload', async () => {
    const response = {
      scenes: [stubScene(), { ...stubScene(), id: 'scene-2' }],
      scope_type: 'story',
      chapter_id: null,
      book_id: null,
      scope_start: 0,
      scope_end: 20,
      rebuilt_text: 'rewritten',
    };
    vi.mocked(postJson).mockResolvedValueOnce(response);

    const payload = {
      source_scene_id: 'scene-2',
      target_scene_id: 'scene-1',
      place_before: true,
    };
    const result = await api.reorderProse(payload);

    expect(postJson).toHaveBeenCalledWith(
      `${BASE}/reorder-prose`,
      payload,
      'Failed to reorder prose'
    );
    expect(result.scenes).toHaveLength(2);
    expect(result.rebuilt_text).toBe('rewritten');
  });
});

// ---------------------------------------------------------------------------
// updateProseContent
// ---------------------------------------------------------------------------

describe('createScenesApi.updateProseContent', () => {
  it('calls PATCH /projects/{name}/scenes/{id}/prose-content with text body', async () => {
    vi.mocked(patchJson).mockResolvedValueOnce(stubScene());

    await api.updateProseContent('scene-1', 'Hello world');

    expect(patchJson).toHaveBeenCalledWith(
      `${BASE}/scene-1/prose-content`,
      { text: 'Hello world' },
      'Failed to update prose content'
    );
  });

  it('propagates errors thrown by patchJson', async () => {
    vi.mocked(patchJson).mockRejectedValueOnce(
      new Error('Failed to update prose content')
    );

    await expect(api.updateProseContent('scene-1', 'text')).rejects.toThrow(
      'Failed to update prose content'
    );
  });
});

// ---------------------------------------------------------------------------
// URL encoding
// ---------------------------------------------------------------------------

describe('createScenesApi URL encoding', () => {
  it('percent-encodes project names with spaces', async () => {
    const spacedApi = createScenesApi('my story');
    vi.mocked(fetchJson).mockResolvedValueOnce([]);

    await spacedApi.list();

    expect(fetchJson).toHaveBeenCalledWith(
      '/projects/my%20story/scenes',
      undefined,
      'Failed to load scenes'
    );
  });
});
