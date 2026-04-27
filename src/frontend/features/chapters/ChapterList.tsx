// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the chapter list unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Chapter, Book, AppTheme } from '../../types';
import { MetadataParams } from '../story/metadataSync';
import { useConfirm } from '../layout/ConfirmDialogContext';
import { useThemeClasses } from '../layout/ThemeContext';
import { MetadataEditorDialog } from '../story/MetadataEditorDialog';
import { api } from '../../services/api';
import { diff_match_patch } from 'diff-match-patch';
import {
  Plus,
  Trash2,
  FileText,
  Folder,
  FolderOpen,
  Book as BookIcon,
  Edit,
} from 'lucide-react';

interface ChapterListProps {
  chapters: Chapter[];
  books?: Book[];
  projectType?: 'short-story' | 'novel' | 'series';
  currentChapterId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateChapter?: (
    id: string,
    updates: Partial<Chapter>,
    sync?: boolean,
    pushHistory?: boolean
  ) => void;
  onUpdateBook?: (id: string, updates: Partial<Book>) => void;
  onCreate: (bookId?: string) => void;
  onBookCreate?: (title: string) => void;
  onBookDelete?: (id: string) => void;
  onReorderChapters?: (chapterIds: number[], bookId?: string) => void;
  onReorderBooks?: (bookIds: string[]) => void;
  onAiAction?: (
    type: 'chapter' | 'book',
    id: string,
    action: 'write' | 'update' | 'rewrite',
    onProgress?: (text: string) => void,
    currentText?: string,
    onThinking?: (thinking: string) => void
  ) => Promise<string | undefined>;
  isAiAvailable?: boolean;
  theme?: AppTheme;
  onOpenImages?: () => void;
  languages?: string[];
  language?: string;
  baselineChapters?: Chapter[];
  spellCheck?: boolean;
}

export const ChapterList: React.FC<ChapterListProps> = React.memo(
  ({
    chapters,
    books = [],
    projectType = 'novel',
    currentChapterId,
    onSelect,
    onDelete,
    onUpdateChapter,
    onUpdateBook,
    onCreate,
    onBookCreate,
    onBookDelete,
    onReorderChapters,
    onReorderBooks,
    onAiAction,
    isAiAvailable = true,
    theme = 'mixed',
    onOpenImages,
    languages = [],
    language,
    baselineChapters = [],
    spellCheck = true,
  }: ChapterListProps) => {
    const { isLight } = useThemeClasses();
    const { t } = useTranslation();
    const confirm = useConfirm();
    const [expandedBooks, setExpandedBooks] = useState<Record<string, boolean>>({});
    const [newBookTitle, setNewBookTitle] = useState('');
    const [isCreatingBook, setIsCreatingBook] = useState(false);

    // Keep transient drag state local so failed reorder requests do not corrupt source props.
    const [draggedItem, setDraggedItem] = useState<{
      type: 'chapter' | 'book';
      id: string;
      bookId?: string;
      originalIndex: number;
    } | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [dragOverBookId, setDragOverBookId] = useState<string | null>(null);
    const [optimisticChapters, setOptimisticChapters] = useState<Chapter[] | null>(
      null
    );
    const [optimisticBooks, setOptimisticBooks] = useState<Book[] | null>(null);

    // Server-confirmed props always win over optimistic previews.
    useEffect(() => {
      if (optimisticChapters !== null) {
        setOptimisticChapters(null);
      }
    }, [chapters, optimisticChapters]);

    useEffect(() => {
      if (optimisticBooks !== null) {
        setOptimisticBooks(null);
      }
    }, [books, optimisticBooks]);

    // Shared array move helper for optimistic drag previews.
    const moveInArray = <T,>(arr: T[], from: number, to: number): T[] => {
      if (from === to || from === -1 || to === -1) return arr;
      const result = [...arr];
      const [removed] = result.splice(from, 1);
      result.splice(to, 0, removed);
      return result;
    };

    let displayChapters = optimisticChapters || chapters;
    let displayBooks = optimisticBooks || books;

    if (draggedItem && dragOverIndex !== null) {
      if (draggedItem.type === 'chapter') {
        if (projectType === 'series') {
          const targetBookId = dragOverBookId || draggedItem.bookId;
          if (targetBookId === draggedItem.bookId) {
            const bookChapters = chapters.filter(
              (c: Chapter) => c.book_id === draggedItem.bookId
            );
            const reordered = moveInArray(
              bookChapters,
              draggedItem.originalIndex,
              dragOverIndex
            );
            displayChapters = chapters.map((c: Chapter) => {
              if (c.book_id !== draggedItem.bookId) return c;
              const subIdx = bookChapters.findIndex((sc: Chapter) => sc.id === c.id);
              return reordered[subIdx];
            });
          } else {
            // Cross-book preview keeps chapter context visible before persistence.
            const sourceChapters = chapters.filter(
              (c: Chapter) => c.book_id === draggedItem.bookId
            );
            const targetChapters = chapters.filter(
              (c: Chapter) => c.book_id === targetBookId
            );

            const movingChapter = sourceChapters[draggedItem.originalIndex];

            if (movingChapter) {
              const newSourceChapters = [...sourceChapters];
              newSourceChapters.splice(draggedItem.originalIndex, 1);

              const newTargetChapters = [...targetChapters];
              newTargetChapters.splice(dragOverIndex, 0, {
                ...movingChapter,
                book_id: targetBookId,
              });

              displayChapters = chapters
                .filter(
                  (c: Chapter) =>
                    c.book_id !== draggedItem.bookId && c.book_id !== targetBookId
                )
                .concat(newSourceChapters)
                .concat(newTargetChapters);
            }
          }
        } else {
          displayChapters = moveInArray(
            chapters,
            draggedItem.originalIndex,
            dragOverIndex
          );
        }
      } else if (draggedItem.type === 'book') {
        displayBooks = moveInArray(books, draggedItem.originalIndex, dragOverIndex);
      }
    }

    // Drag handlers coordinate optimistic UI and final persistence callbacks.
    const handleDragStart = (
      e: React.DragEvent,
      type: 'chapter' | 'book',
      id: string,
      index: number,
      bookId?: string
    ) => {
      setDraggedItem({ type, id, bookId, originalIndex: index });
      e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (index: number, bookId?: string) => {
      if (dragOverIndex !== index || (bookId && dragOverBookId !== bookId)) {
        setDragOverIndex(index);
        if (bookId) setDragOverBookId(bookId);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const targetIdx = dragOverIndex;
      const dragged = draggedItem;

      if (!dragged || targetIdx === null) {
        setDragOverIndex(null);
        setDraggedItem(null);
        return;
      }

      if (dragged.type === 'chapter') {
        if (projectType === 'series') {
          const targetBookId = dragOverBookId || dragged.bookId;

          // Skip no-op drops to avoid unnecessary reorder writes.
          if (targetBookId === dragged.bookId && targetIdx === dragged.originalIndex) {
            setDragOverIndex(null);
            setDraggedItem(null);
            setDragOverBookId(null);
            return;
          }

          if (targetBookId && onReorderChapters) {
            const bookChaptersFinal = displayChapters.filter(
              (c: Chapter) => c.book_id === targetBookId
            );
            const chapterIds = bookChaptersFinal.map((c: Chapter) => parseInt(c.id));
            setOptimisticChapters(displayChapters);
            onReorderChapters(chapterIds, targetBookId);
          }
        } else {
          if (onReorderChapters) {
            const chapterIds = displayChapters.map((c: Chapter) => parseInt(c.id));
            setOptimisticChapters(displayChapters);
            onReorderChapters(chapterIds);
          }
        }
      } else if (dragged.type === 'book') {
        if (onReorderBooks) {
          const bookIds = displayBooks.map((b: Book) => b.id);
          setOptimisticBooks(displayBooks);
          onReorderBooks(bookIds);
        }
      }

      setDragOverIndex(null);
      setDragOverBookId(null);
      setDraggedItem(null);
    };

    const handleDragEnd = () => {
      setDraggedItem(null);
      setDragOverIndex(null);
      setDragOverBookId(null);
    };

    const toggleBook = (id: string) => {
      setExpandedBooks((prev: Record<string, boolean>) => ({
        ...prev,
        [id]: !prev[id],
      }));
    };

    const bgClass = isLight
      ? 'bg-brand-gray-50 border-brand-gray-200'
      : 'bg-brand-gray-900 border-brand-gray-800';
    const textHeader = isLight ? 'text-brand-gray-500' : 'text-brand-gray-400';
    const btnHover = isLight
      ? 'hover:bg-brand-gray-200 text-brand-gray-500 hover:text-brand-gray-700'
      : 'hover:bg-brand-gray-800 text-brand-gray-500 hover:text-brand-gray-300';

    const itemActive = isLight
      ? 'bg-brand-gray-50 border-brand-400 shadow-sm'
      : 'bg-brand-gray-800/50 border-brand-800 shadow-sm';
    const itemInactive = isLight
      ? 'bg-transparent border-transparent hover:bg-brand-gray-100'
      : 'bg-transparent border-transparent hover:bg-brand-gray-800/50';
    const titleActive = isLight ? 'text-brand-700' : 'text-brand-300';
    const titleInactive = isLight ? 'text-brand-gray-700' : 'text-brand-gray-400';

    const [editingMetadata, setEditingMetadata] = useState<{
      type: 'chapter' | 'book';
      id: string;
    } | null>(null);
    const [pendingMetadataUpdate, setPendingMetadataUpdate] = useState<{
      id: string;
      data: {
        title?: string;
        summary?: string;
        notes?: string;
        private_notes?: string;
        conflicts?: Chapter['conflicts'];
      };
    } | null>(null);

    const activeEditingData = useMemo(() => {
      if (!editingMetadata) return null;
      if (editingMetadata.type === 'chapter') {
        return displayChapters.find((c: Chapter) => c.id === editingMetadata.id);
      } else {
        return displayBooks.find((b: Book) => b.id === editingMetadata.id);
      }
    }, [editingMetadata, displayChapters, displayBooks]);

    const handleEditChapterMetadata = (e: React.MouseEvent, chapter: Chapter) => {
      e.stopPropagation();
      setEditingMetadata({ type: 'chapter', id: chapter.id });
    };

    const handleEditBookMetadata = (e: React.MouseEvent, book: Book) => {
      e.stopPropagation();
      setEditingMetadata({ type: 'book', id: book.id });
    };

    const saveMetadata = async (data: {
      title?: string;
      summary?: string;
      notes?: string;
      private_notes?: string;
      conflicts?: Chapter['conflicts'];
    }) => {
      if (!editingMetadata || !activeEditingData) return;
      try {
        if (editingMetadata.type === 'chapter') {
          const id = parseInt(editingMetadata.id, 10);
          await api.chapters.updateMetadata(id, {
            summary: data.summary,
            notes: data.notes,
            private_notes: data.private_notes,
            conflicts: data.conflicts,
          });

          if (onUpdateChapter) {
            onUpdateChapter(editingMetadata.id, data, false, false);
            setPendingMetadataUpdate({ id: editingMetadata.id, data });
          } else {
            if (data.title !== activeEditingData.title) {
              await api.chapters.updateTitle(id, data.title || '');
            }
          }
        } else {
          const id = editingMetadata.id;
          await api.books.updateBookMetadata(id, {
            title: data.title,
            summary: data.summary,
            notes: data.notes,
            private_notes: data.private_notes,
          });
          onUpdateBook?.(id, data);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const renderChapter = (chapter: Chapter, index: number) => {
      const isDragging =
        draggedItem?.type === 'chapter' && draggedItem.id === chapter.id;

      const baselineChapter = baselineChapters.find(
        (c: Chapter) => String(c.id) === String(chapter.id)
      );
      const baselineSummary = baselineChapter?.summary || '';

      const renderSummary = () => {
        const summary = chapter.summary || t('No summary available...');
        if (!baselineSummary || baselineSummary === summary) {
          return <Fragment>{summary}</Fragment>;
        }

        const diffs = new diff_match_patch().diff_main(baselineSummary, summary);
        new diff_match_patch().diff_cleanupSemantic(diffs);

        return diffs.map(([op, text]: import('diff-match-patch').Diff, i: number) => {
          if (op === 0) return <Fragment key={i}>{text}</Fragment>;
          if (op === 1) {
            return (
              <span
                key={i}
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  borderBottom: '1px solid rgba(34, 197, 94, 0.4)',
                }}
              >
                {text}
              </span>
            );
          }
          return (
            <span
              key={i}
              style={{
                textDecoration: 'line-through',
                opacity: 0.5,
              }}
            >
              {text}
            </span>
          );
        });
      };

      return (
        <div
          key={chapter.id}
          className={`group relative p-3 rounded-lg transition-all duration-150 border ${
            currentChapterId === chapter.id ? itemActive : itemInactive
          } ${
            isDragging
              ? 'opacity-20 grayscale border-dashed border-brand-gray-500/50'
              : 'opacity-100'
          }`}
        >
          <button
            type="button"
            className="flex flex-col w-full text-left cursor-pointer"
            draggable
            onDragStart={(e: React.DragEvent<HTMLButtonElement>) =>
              handleDragStart(e, 'chapter', chapter.id, index, chapter.book_id)
            }
            onDragEnter={() => {
              if (draggedItem?.type === 'chapter' && !isDragging) {
                handleDragEnter(index, chapter.book_id);
              }
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onClick={() => onSelect(chapter.id)}
            aria-current={currentChapterId === chapter.id ? 'true' : undefined}
          >
            <div className="flex justify-between items-start w-full">
              <div className="flex items-center gap-2">
                <h3
                  className={`font-medium text-sm mb-1 ${
                    currentChapterId === chapter.id ? titleActive : titleInactive
                  }`}
                >
                  {chapter.title || t('Untitled Chapter')}
                </h3>
                {chapter.conflicts && chapter.conflicts.length > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                    {chapter.conflicts.length}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 text-xs text-brand-gray-500 line-clamp-2">
              {renderSummary()}
            </div>
          </button>
          <div className="absolute top-2 right-2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) =>
                handleEditChapterMetadata(e, chapter)
              }
              className="p-1 text-brand-gray-400 hover:text-blue-500"
              title={t('Edit Metadata')}
            >
              <Edit size={14} />
            </button>
            <button
              onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                e.stopPropagation();
                onDelete(chapter.id);
              }}
              className="p-1 text-brand-gray-400 hover:text-red-500"
              title={t('Delete Chapter')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      );
    };

    return (
      <div
        id="chapter-list"
        className={`flex flex-col flex-1 min-h-0 border-r relative ${bgClass}`}
      >
        {editingMetadata && activeEditingData && (
          <MetadataEditorDialog
            type={editingMetadata.type}
            language={language}
            spellCheck={spellCheck}
            title={
              editingMetadata.type === 'chapter'
                ? t('Edit Chapter: {{title}}', { title: activeEditingData.title })
                : t('Edit Book: {{title}}', { title: activeEditingData.title })
            }
            initialData={activeEditingData}
            baseline={
              editingMetadata.type === 'chapter'
                ? baselineChapters.find(
                    (c: Chapter) => String(c.id) === String(editingMetadata.id)
                  )
                : undefined
            }
            onSave={saveMetadata as (data: MetadataParams) => Promise<void>}
            onClose={() => {
              if (
                pendingMetadataUpdate &&
                pendingMetadataUpdate.id === editingMetadata.id
              ) {
                const currentChapter = displayChapters.find(
                  (c: Chapter) => c.id === pendingMetadataUpdate.id
                );
                const isDifferent =
                  currentChapter &&
                  Object.entries(pendingMetadataUpdate.data).some(
                    ([key, value]: [
                      string,
                      string | import('../../types').Conflict[],
                    ]) => {
                      if (value === undefined) return false;
                      return (
                        JSON.stringify(value) !==
                        JSON.stringify(
                          (currentChapter as unknown as Record<string, unknown>)[key]
                        )
                      );
                    }
                  );
                if (isDifferent) {
                  onUpdateChapter?.(
                    pendingMetadataUpdate.id,
                    pendingMetadataUpdate.data,
                    false,
                    true
                  );
                }
              }
              setPendingMetadataUpdate(null);
              setEditingMetadata(null);
            }}
            theme={theme}
            aiDisabledReason={
              !isAiAvailable
                ? t(
                    'Summary AI is unavailable because no working EDITING model is configured.'
                  )
                : undefined
            }
            primarySourceLabel={
              editingMetadata.type === 'chapter' ? t('Chapter') : undefined
            }
            primarySourceAvailable={
              editingMetadata.type === 'chapter' &&
              activeEditingData &&
              'content' in activeEditingData
                ? !!activeEditingData.content?.trim()
                : undefined
            }
            onAiGenerate={
              onAiAction && editingMetadata
                ? (
                    action: 'update' | 'rewrite' | 'write',
                    onProgress: ((text: string) => void) | undefined,
                    currentText: string | undefined,
                    onThinking: ((thinking: string) => void) | undefined
                  ) =>
                    onAiAction(
                      editingMetadata.type,
                      editingMetadata.id,
                      action,
                      onProgress,
                      currentText,
                      onThinking
                    )
                : undefined
            }
            languages={languages}
          />
        )}
        <div
          className={`p-4 border-b flex justify-between items-center sticky top-0 z-10 ${bgClass} ${
            isLight ? 'border-brand-gray-200' : 'border-brand-gray-800'
          }`}
        >
          {/* title with inline create button so it hugs the header text */}
          <div className="flex items-center gap-1.5 min-w-0">
            <h2
              className={`text-sm font-semibold uppercase tracking-wider ${textHeader}`}
            >
              {projectType === 'series' ? t('Books & Chapters') : t('Chapters')}
            </h2>
            {projectType === 'novel' && (
              <button
                onClick={() => onCreate()}
                className={`p-1 rounded-full transition-colors ${btnHover}`}
                title={t('New Chapter')}
              >
                <Plus size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {projectType === 'series' ? (
            <div className="space-y-4">
              {displayBooks.map((book: Book, bIdx: number) => {
                const bookChapters = displayChapters.filter(
                  (c: Chapter) => c.book_id === book.id
                );
                const isExpanded = expandedBooks[book.id] ?? true;
                const isBookDragging =
                  draggedItem?.type === 'book' && draggedItem.id === book.id;

                return (
                  <div key={book.id} className="space-y-1">
                    <div
                      className={`flex flex-col p-2 rounded transition-all duration-150 group ${
                        isLight
                          ? 'hover:bg-brand-gray-200/50'
                          : 'hover:bg-brand-gray-800/50'
                      } ${
                        isBookDragging
                          ? 'opacity-20 grayscale border-dashed border-brand-gray-500/50'
                          : 'opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full text-left">
                        <button
                          className="flex items-center space-x-2 font-bold text-sm cursor-row-resize"
                          style={{ cursor: 'row-resize' }}
                          draggable
                          onDragStart={(e: React.DragEvent<HTMLButtonElement>) =>
                            handleDragStart(e, 'book', book.id, bIdx)
                          }
                          onDragEnter={() => {
                            if (draggedItem?.type === 'book' && !isBookDragging) {
                              handleDragEnter(bIdx);
                            } else if (draggedItem?.type === 'chapter') {
                              handleDragEnter(0, book.id);
                            }
                          }}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onDragEnd={handleDragEnd}
                          onClick={() => toggleBook(book.id)}
                          aria-expanded={isExpanded}
                          aria-label={t('Toggle book {{title}}', { title: book.title })}
                        >
                          <div className="flex items-center space-x-2 font-bold text-sm pointer-events-none">
                            {isExpanded ? (
                              <FolderOpen size={16} />
                            ) : (
                              <Folder size={16} />
                            )}
                            <span>{book.title}</span>
                            <span className="text-xs opacity-50 font-normal">
                              ({bookChapters.length})
                            </span>
                          </div>
                        </button>
                        <div className="flex items-center">
                          <div className="flex items-center">
                            <button
                              onClick={(
                                e: React.MouseEvent<HTMLButtonElement, MouseEvent>
                              ) => handleEditBookMetadata(e, book)}
                              className={`p-1 opacity-0 group-hover:opacity-100 hover:text-blue-500 ${textHeader}`}
                              title={t('Edit Book Metadata')}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={(
                                e: React.MouseEvent<HTMLButtonElement, MouseEvent>
                              ) => {
                                e.stopPropagation();
                                onCreate(book.id);
                              }}
                              className={`p-1 opacity-0 group-hover:opacity-100 ${btnHover}`}
                              title={t('Add Chapter to Book')}
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={async (
                                e: React.MouseEvent<HTMLButtonElement, MouseEvent>
                              ) => {
                                e.stopPropagation();
                                if (
                                  await confirm(t('Delete Book and all its chapters?'))
                                ) {
                                  onBookDelete?.(book.id);
                                }
                              }}
                              className="text-brand-gray-400 hover:text-red-500 p-1"
                              title={t('Delete Book')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="pl-6 mt-1.5 w-full">
                        <p
                          className={`text-xs line-clamp-2 pointer-events-none ${
                            isLight ? 'text-brand-gray-500' : 'text-brand-gray-500'
                          }`}
                        >
                          {book.summary || t('No summary available...')}
                        </p>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pl-3 space-y-2 border-l ml-3 border-brand-gray-700/30">
                        {bookChapters.map(renderChapter)}
                        <button
                          type="button"
                          aria-label={t('Add Chapter')}
                          className={`w-full text-left text-xs p-2 rounded flex items-center space-x-2 opacity-60 hover:opacity-100 ${titleInactive}`}
                          onClick={() => {
                            onCreate(book.id);
                          }}
                        >
                          <Plus size={14} /> <span>{t('Add Chapter')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* New Book UI */}
              <div className="mt-4 pt-4 border-t border-dashed border-gray-700/30">
                {isCreatingBook ? (
                  <div className="flex flex-col gap-2 p-2">
                    <input
                      className="bg-transparent border rounded p-1 text-sm outline-none focus:border-brand-500"
                      lang={language || undefined}
                      spellCheck={spellCheck}
                      placeholder={t('Book Title')}
                      value={newBookTitle}
                      onChange={(
                        e: React.ChangeEvent<HTMLInputElement, HTMLInputElement>
                      ) => setNewBookTitle(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          onBookCreate?.(newBookTitle);
                          setNewBookTitle('');
                          setIsCreatingBook(false);
                        }
                        if (e.key === 'Escape') setIsCreatingBook(false);
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label={t('Cancel create book')}
                        onClick={() => setIsCreatingBook(false)}
                        className="text-xs opacity-50"
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('Create book')}
                        onClick={() => {
                          onBookCreate?.(newBookTitle);
                          setNewBookTitle('');
                          setIsCreatingBook(false);
                        }}
                        className="text-xs font-bold text-brand-500"
                      >
                        {t('Create')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={t('Start creating a new book')}
                    onClick={() => setIsCreatingBook(true)}
                    className={`w-full flex items-center justify-center gap-2 p-2 rounded border border-dashed text-sm opacity-60 hover:opacity-100 ${
                      isLight ? 'border-brand-gray-300' : 'border-brand-gray-700'
                    }`}
                  >
                    <BookIcon size={16} /> <span>{t('Add Book')}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            // Non-series projects render as a flat chapter list.
            <>
              {displayChapters.map(renderChapter)}
              {displayChapters.length === 0 && (
                <div className="text-center py-10 text-brand-gray-500">
                  <FileText className="mx-auto mb-2 opacity-30" size={32} />
                  <p className="text-sm">{t('No chapters yet.')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);
