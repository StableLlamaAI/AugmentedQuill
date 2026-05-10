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
import type { Book, Chapter } from '../../types/domain';

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

describe('NarrativeView series sorting and grouping', () => {
  it('renders scenes in book/chapter order when books chapter metadata lacks chapter ids', () => {
    const books: Book[] = [
      {
        id: 'book-1',
        title: 'Book 1',
        chapters: [
          { title: 'Book 1 Chapter 1', summary: '', content: '' } as Chapter,
          { title: 'Book 1 Chapter 2', summary: '', content: '' } as Chapter,
        ],
      },
      {
        id: 'book-2',
        title: 'Book 2',
        chapters: [{ title: 'Book 2 Chapter 1', summary: '', content: '' } as Chapter],
      },
    ];

    const chapters: Chapter[] = [
      {
        id: '1',
        title: 'Book 1 Chapter 1',
        summary: '',
        content: '',
        book_id: 'book-1',
      },
      {
        id: '2',
        title: 'Book 1 Chapter 2',
        summary: '',
        content: '',
        book_id: 'book-1',
      },
      {
        id: '3',
        title: 'Book 2 Chapter 1',
        summary: '',
        content: '',
        book_id: 'book-2',
      },
    ];

    const scenes: Scene[] = [
      makeScene({
        id: 'scene-b2-c1-a',
        summary: 'B2C1-A',
        prose_link: {
          scope_type: 'chapter',
          chapter_id: '3',
          book_id: 'book-2',
          start_offset: 0,
          end_offset: 8,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'scene-b1-c2-a',
        summary: 'B1C2-A',
        prose_link: {
          scope_type: 'chapter',
          chapter_id: '2',
          book_id: 'book-1',
          start_offset: 0,
          end_offset: 8,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'scene-b1-c1-a',
        summary: 'B1C1-A',
        prose_link: {
          scope_type: 'chapter',
          chapter_id: '1',
          book_id: 'book-1',
          start_offset: 0,
          end_offset: 8,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'scene-b2-c1-b',
        summary: 'B2C1-B',
        prose_link: {
          scope_type: 'chapter',
          chapter_id: '3',
          book_id: 'book-2',
          start_offset: 10,
          end_offset: 18,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'scene-b1-c1-b',
        summary: 'B1C1-B',
        prose_link: {
          scope_type: 'chapter',
          chapter_id: '1',
          book_id: 'book-1',
          start_offset: 10,
          end_offset: 18,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="series"
          chapters={chapters}
          books={books}
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderedSceneOrder = Array.from(
      container.querySelectorAll('[data-scene-card]')
    ).map((el: Element) => el.textContent?.trim());

    expect(renderedSceneOrder).toEqual([
      'B1C1-A',
      'B1C1-B',
      'B1C2-A',
      'B2C1-A',
      'B2C1-B',
    ]);

    const separators = Array.from(container.querySelectorAll('[aria-label]')).map(
      (el: Element) => el.getAttribute('aria-label')
    );
    expect(separators).toContain('Book: Book 1');
    expect(separators).toContain('Chapter: Book 1 Chapter 1');
    expect(separators).toContain('Chapter: Book 1 Chapter 2');
    expect(separators).toContain('Book: Book 2');
    expect(separators).toContain('Chapter: Book 2 Chapter 1');

    const sequence = separators.filter(
      (label: string | null) =>
        label === 'Book: Book 1' ||
        label === 'Chapter: Book 1 Chapter 1' ||
        label === 'Chapter: Book 1 Chapter 2' ||
        label === 'Book: Book 2' ||
        label === 'Chapter: Book 2 Chapter 1'
    );
    expect(sequence).toEqual([
      'Book: Book 1',
      'Chapter: Book 1 Chapter 1',
      'Chapter: Book 1 Chapter 2',
      'Book: Book 2',
      'Chapter: Book 2 Chapter 1',
    ]);
  });
});

describe('NarrativeView chronological sorting', () => {
  it('sorts by scene_time while allowing flashback ordering independent of prose order', () => {
    const scenes: Scene[] = [
      makeScene({
        id: 'late-prose-early-time',
        summary: 'Flashback',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 100,
          end_offset: 110,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-03-01T12:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
      makeScene({
        id: 'early-prose-late-time',
        summary: 'Present',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 10,
          end_offset: 20,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-03-02T12:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="novel"
          chapters={[]}
          books={[]}
          sortMode="chronological"
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderedSceneOrder = Array.from(
      container.querySelectorAll('[data-scene-card]')
    ).map((el: Element) => el.textContent?.trim());

    expect(renderedSceneOrder).toEqual(['Flashback', 'Present']);
  });

  it('falls back to prose position for scenes without valid scene_time', () => {
    const scenes: Scene[] = [
      makeScene({
        id: 'timed',
        summary: 'Timed',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 5,
          end_offset: 8,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-03-01T10:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
      makeScene({
        id: 'untimed-2',
        summary: 'Untimed B',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 70,
          end_offset: 80,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'untimed-1',
        summary: 'Untimed A',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 30,
          end_offset: 40,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'invalid-time',
        summary: 'Invalid Time',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 50,
          end_offset: 60,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: { temporal_zoned_datetime: 'not-a-valid-temporal-value' },
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="novel"
          chapters={[]}
          books={[]}
          sortMode="chronological"
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderedSceneOrder = Array.from(
      container.querySelectorAll('[data-scene-card]')
    ).map((el: Element) => el.textContent?.trim());

    expect(renderedSceneOrder).toEqual([
      'Timed',
      'Untimed A',
      'Invalid Time',
      'Untimed B',
    ]);
  });

  it('keeps only unlinked and untimed scenes in the Not yet linked section', () => {
    const scenes: Scene[] = [
      makeScene({
        id: 'linked-untimed',
        summary: 'Linked Untimed',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 10,
          end_offset: 20,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'unlinked-timed',
        summary: 'Unlinked Timed',
        prose_link: null,
        scene_time: {
          temporal_zoned_datetime: '2024-02-01T10:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
      makeScene({
        id: 'unlinked-untimed',
        summary: 'Unlinked Untimed',
        prose_link: null,
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="novel"
          chapters={[]}
          books={[]}
          sortMode="chronological"
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderSequence = Array.from(
      container.querySelectorAll('[data-scene-card], [role="separator"]')
    ).map((el: Element) => {
      const separatorLabel = el.getAttribute('aria-label');
      return separatorLabel || el.textContent?.trim() || '';
    });

    const headerIndex = renderSequence.indexOf('Scenes not yet linked to prose');
    expect(headerIndex).toBeGreaterThan(-1);

    const unlinkedTimedIndex = renderSequence.indexOf('Unlinked Timed');
    const unlinkedUntimedIndex = renderSequence.indexOf('Unlinked Untimed');

    expect(unlinkedTimedIndex).toBeGreaterThan(-1);
    expect(unlinkedUntimedIndex).toBeGreaterThan(-1);
    expect(unlinkedTimedIndex).toBeLessThan(headerIndex);
    expect(unlinkedUntimedIndex).toBeGreaterThan(headerIndex);
  });

  it('interleaves a linked untimed scene between timed scenes using prose order', () => {
    const scenes: Scene[] = [
      makeScene({
        id: 'timed-early',
        summary: 'Timed Early',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 10,
          end_offset: 20,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-02-01T10:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
      makeScene({
        id: 'untimed-middle',
        summary: 'Untimed Middle',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 50,
          end_offset: 60,
          content_hash: 'hash',
          is_stale: false,
        },
      }),
      makeScene({
        id: 'timed-late',
        summary: 'Timed Late',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 90,
          end_offset: 100,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-02-01T12:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="novel"
          chapters={[]}
          books={[]}
          sortMode="chronological"
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderedSceneOrder = Array.from(
      container.querySelectorAll('[data-scene-card]')
    ).map((el: Element) => el.textContent?.trim());

    expect(renderedSceneOrder).toEqual(['Timed Early', 'Untimed Middle', 'Timed Late']);
  });

  it('treats invalid scene_time like untimed and places it by prose position', () => {
    const scenes: Scene[] = [
      makeScene({
        id: 'timed-early',
        summary: 'Timed Early',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 10,
          end_offset: 20,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-02-01T10:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
      makeScene({
        id: 'invalid-middle',
        summary: 'Invalid Middle',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 50,
          end_offset: 60,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: { temporal_zoned_datetime: 'not-a-valid-temporal-value' },
      }),
      makeScene({
        id: 'timed-late',
        summary: 'Timed Late',
        prose_link: {
          scope_type: 'story',
          chapter_id: null,
          book_id: null,
          start_offset: 90,
          end_offset: 100,
          content_hash: 'hash',
          is_stale: false,
        },
        scene_time: {
          temporal_zoned_datetime: '2024-02-01T12:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="novel"
          chapters={[]}
          books={[]}
          sortMode="chronological"
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderedSceneOrder = Array.from(
      container.querySelectorAll('[data-scene-card]')
    ).map((el: Element) => el.textContent?.trim());

    expect(renderedSceneOrder).toEqual(['Timed Early', 'Invalid Middle', 'Timed Late']);
  });

  it('keeps an unlinked timed scene out of the Not yet linked section', () => {
    const scenes: Scene[] = [
      makeScene({
        id: 'zz-unlinked-timed',
        summary: 'Unlinked Timed',
        prose_link: null,
        scene_time: {
          temporal_zoned_datetime: '2024-02-01T09:00:00+00:00[UTC][u-ca=gregory]',
        },
      }),
      makeScene({
        id: 'aa-unlinked-untimed',
        summary: 'Unlinked Untimed',
        prose_link: null,
      }),
    ];

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarrativeView
          scenes={scenes}
          projectType="novel"
          chapters={[]}
          books={[]}
          sortMode="chronological"
          primarySelectedSceneId={null}
          onSelectScene={vi.fn()}
          onSelectionChange={vi.fn()}
          onEditScene={vi.fn()}
        />
      </I18nextProvider>
    );

    const renderSequence = Array.from(
      container.querySelectorAll('[data-scene-card], [role="separator"]')
    ).map((el: Element) => {
      const separatorLabel = el.getAttribute('aria-label');
      return separatorLabel || el.textContent?.trim() || '';
    });

    const headerIndex = renderSequence.indexOf('Scenes not yet linked to prose');
    const timedIndex = renderSequence.indexOf('Unlinked Timed');
    const untimedIndex = renderSequence.indexOf('Unlinked Untimed');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(timedIndex).toBeGreaterThan(-1);
    expect(untimedIndex).toBeGreaterThan(-1);
    expect(timedIndex).toBeLessThan(headerIndex);
    expect(untimedIndex).toBeGreaterThan(headerIndex);
  });
});
