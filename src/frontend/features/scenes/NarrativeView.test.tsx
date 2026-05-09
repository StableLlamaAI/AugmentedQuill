// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Drag and drop interaction tests for NarrativeView.
 */

// @vitest-environment jsdom

import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import i18n from '../app/i18n';
import { NarrativeView } from './NarrativeView';
import type { Scene } from '../../types';

const { selectionState } = vi.hoisted(() => ({
  selectionState: {
    selectedSceneIds: new Set<string>(),
    activeSceneId: null as string | null,
    causeIds: new Set<string>(),
    effectIds: new Set<string>(),
    handleCardSelect: vi.fn(),
  },
}));

vi.mock('../layout/ThemeContext', () => ({
  useThemeClasses: () => ({ bg: '' }),
  useTheme: () => ({ isLight: true }),
}));

vi.mock('./ConstraintArrows', () => ({
  CauseArrows: () => null,
}));

vi.mock('./useSceneSelection', () => ({
  useSceneSelection: () => selectionState,
}));

vi.mock('./SceneCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SceneCard: ({ scene }: any) => <div data-scene-card={scene.id}>{scene.summary}</div>,
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  selectionState.selectedSceneIds = new Set<string>();
  selectionState.activeSceneId = null;
});

function makeScene(overrides: Partial<Scene>): Scene {
  return {
    id: 'scene-1',
    summary: 'Scene',
    beats: [],
    prose_link: {
      scope_type: 'story',
      chapter_id: null,
      book_id: null,
      start_offset: 0,
      end_offset: 5,
      content_hash: 'hash',
      is_stale: false,
    },
    active_characters: [],
    passive_characters: [],
    location: null,
    time: null,
    color_tag: null,
    status: 'active',
    pinboard_x: 0,
    pinboard_y: 0,
    order_before: [],
    order_after: [],
    ...overrides,
  };
}

function makeDataTransfer(): DataTransfer {
  const bag = new Map<string, string>();
  return {
    effectAllowed: 'all',
    dropEffect: 'move',
    files: {} as FileList,
    items: {} as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format) {
        bag.delete(format);
      } else {
        bag.clear();
      }
    },
    getData: (format: string) => bag.get(format) ?? '',
    setData: (format: string, data: string) => {
      bag.set(format, data);
    },
    setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

describe('NarrativeView drag reorder interactions', () => {
  it.each([
    {
      label: 'no affected scenes selected and no active scene',
      selectedSceneIds: new Set<string>(),
      activeSceneId: null,
    },
    {
      label: 'some affected scenes selected with active scene',
      selectedSceneIds: new Set<string>(['a']),
      activeSceneId: 'a',
    },
    {
      label: 'all affected scenes selected with no active scene',
      selectedSceneIds: new Set<string>(['a', 'b']),
      activeSceneId: null,
    },
  ])(
    'calls onReorderScene when dragging one scene onto another ($label)',
    async ({
      selectedSceneIds,
      activeSceneId,
    }: {
      label: string;
      selectedSceneIds: Set<string>;
      activeSceneId: string | null;
    }) => {
      selectionState.selectedSceneIds = selectedSceneIds;
      selectionState.activeSceneId = activeSceneId;

      const onReorderScene = vi.fn(async () => undefined);
      const sceneA = makeScene({ id: 'a', summary: 'A' });
      const sceneB = makeScene({ id: 'b', summary: 'B' });

      const { getByText } = render(
        <I18nextProvider i18n={i18n}>
          <NarrativeView
            scenes={[sceneA, sceneB]}
            projectType="novel"
            chapters={[]}
            books={[]}
            primarySelectedSceneId={null}
            onSelectScene={vi.fn()}
            onSelectionChange={vi.fn()}
            onEditScene={vi.fn()}
            onReorderScene={onReorderScene}
          />
        </I18nextProvider>
      );

      const sourceWrapper = getByText('A').parentElement as HTMLDivElement;
      const targetWrapper = getByText('B').parentElement as HTMLDivElement;
      const transfer = makeDataTransfer();

      vi.spyOn(targetWrapper, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 100,
        width: 200,
        height: 80,
        top: 100,
        left: 0,
        right: 200,
        bottom: 180,
        toJSON: () => ({}),
      });

      fireEvent.dragStart(sourceWrapper, { dataTransfer: transfer });
      fireEvent.dragOver(targetWrapper, { dataTransfer: transfer, clientY: 110 });
      fireEvent.drop(targetWrapper, { dataTransfer: transfer, clientY: 110 });

      await waitFor(() => {
        expect(onReorderScene).toHaveBeenCalledWith('a', 'b', expect.any(Boolean));
      });
    }
  );

  it('does not call onReorderScene when dropped onto the same scene', async () => {
    const onReorderScene = vi.fn(async () => undefined);
    const sceneA = makeScene({ id: 'a', summary: 'A' });

    const { getByText } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={[sceneA]}
          projectType="novel"
          chapters={[]}
          books={[]}
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
          onReorderScene={onReorderScene}
        />
      </I18nextProvider>
    );

    const wrapper = getByText('A').parentElement as HTMLDivElement;
    const transfer = makeDataTransfer();

    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 100,
      width: 200,
      height: 80,
      top: 100,
      left: 0,
      right: 200,
      bottom: 180,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(wrapper, { dataTransfer: transfer });
    fireEvent.dragOver(wrapper, { dataTransfer: transfer, clientY: 110 });
    fireEvent.drop(wrapper, { dataTransfer: transfer, clientY: 110 });

    await waitFor(() => {
      expect(onReorderScene).not.toHaveBeenCalled();
    });
  });
});
