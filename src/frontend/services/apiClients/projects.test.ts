// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines projects API client tests so frontend/backend endpoint contracts stay explicit and verifiable.
 */

import { describe, expect, it, vi } from 'vitest';

import { projectsApi } from './projects';
import { fetchBlob, fetchJson, postJson } from './shared';
import { registerSharedApiMockCleanup } from './testSharedMocks';

vi.mock('./shared', () => ({
  fetchJson: vi.fn(),
  postJson: vi.fn(),
  fetchBlob: vi.fn(),
}));
registerSharedApiMockCleanup();

describe('projectsApi', () => {
  it('calls GET /projects', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ available: [] });

    await projectsApi.list();

    expect(fetchJson).toHaveBeenCalledWith(
      '/projects',
      undefined,
      'Failed to list projects'
    );
  });

  it('calls project mutation endpoints', async () => {
    vi.mocked(postJson).mockResolvedValue({ ok: true });

    await projectsApi.select('demo');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/select',
      { name: 'demo' },
      'Failed to select project'
    );

    await projectsApi.create('demo', 'novel');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/create',
      { name: 'demo', type: 'novel' },
      'Failed to create project'
    );

    // language parameter should be forwarded when supplied
    await projectsApi.create('demo', 'novel', 'es');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/create',
      { name: 'demo', type: 'novel', language: 'es' },
      'Failed to create project'
    );

    await projectsApi.convert('series');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/convert',
      { new_type: 'series' },
      'Failed to convert project'
    );

    await projectsApi.delete('demo');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/delete',
      { name: 'demo' },
      'Failed to delete project'
    );
  });

  it('calls export endpoints with and without name', async () => {
    const blob = new Blob(['x']);
    vi.mocked(fetchBlob).mockResolvedValue(blob);

    await projectsApi.export();
    expect(fetchBlob).toHaveBeenCalledWith(
      '/projects/export',
      undefined,
      'Failed to export project'
    );

    await projectsApi.export('My Project');
    expect(fetchBlob).toHaveBeenCalledWith(
      '/projects/export?name=My%20Project',
      undefined,
      'Failed to export project'
    );

    await projectsApi.exportEpub();
    expect(fetchBlob).toHaveBeenCalledWith(
      '/projects/export/epub',
      undefined,
      'Failed to export project as EPUB'
    );

    await projectsApi.exportEpub('My Project');
    expect(fetchBlob).toHaveBeenCalledWith(
      '/projects/export/epub?name=My%20Project',
      undefined,
      'Failed to export project as EPUB'
    );
  });

  it('calls multipart import and upload image endpoints', async () => {
    vi.mocked(fetchJson).mockResolvedValue({ ok: true });

    const file = new File(['content'], 'demo.txt', { type: 'text/plain' });

    await projectsApi.import(file);
    expect(fetchJson).toHaveBeenCalledWith(
      '/projects/import',
      {
        method: 'POST',
        body: expect.any(FormData),
      },
      'Failed to import project'
    );

    await projectsApi.uploadImage(file);
    expect(fetchJson).toHaveBeenCalledWith(
      '/projects/images/upload',
      {
        method: 'POST',
        body: expect.any(FormData),
      },
      'Failed to upload image'
    );

    await projectsApi.uploadImage(file, 'cover image.png');
    expect(fetchJson).toHaveBeenCalledWith(
      '/projects/images/upload?target_name=cover%20image.png',
      {
        method: 'POST',
        body: expect.any(FormData),
      },
      'Failed to upload image'
    );
  });

  it('calls image metadata/list/delete endpoints', async () => {
    vi.mocked(postJson).mockResolvedValue({ ok: true });
    vi.mocked(fetchJson).mockResolvedValueOnce({ images: [] });

    await projectsApi.updateImage('img.png', 'desc', 'title');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/images/update_description',
      { filename: 'img.png', description: 'desc', title: 'title' },
      'Failed to update image metadata'
    );

    await projectsApi.createImagePlaceholder('desc', 'title');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/images/create_placeholder',
      { description: 'desc', title: 'title' },
      'Failed to create placeholder'
    );

    await projectsApi.listImages();
    expect(fetchJson).toHaveBeenCalledWith(
      '/projects/images/list',
      undefined,
      'Failed to list images'
    );

    await projectsApi.deleteImage('img.png');
    expect(postJson).toHaveBeenCalledWith(
      '/projects/images/delete',
      { filename: 'img.png' },
      'Failed to delete image'
    );
  });
});
