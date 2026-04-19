// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Maps LLM tool call names to SessionMutation factory functions.
 *
 * When the backend calls a tool that mutates story data, we produce a
 * SessionMutation badge so the user can see (and undo) what changed.
 * Add new mutation-producing tools here instead of growing any if-chain
 * inside App.tsx or useChatExecution.
 */

import { SessionMutation } from './components/MutationTags';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type MutCallResult = { args: Record<string, unknown>; result: Record<string, unknown> };
type MutFactory = (res: MutCallResult) => SessionMutation | SessionMutation[] | null;

/** Build sourcebook mutation. */
function buildSourcebookMutation(
  args: Record<string, unknown>,
  result: Record<string, unknown>
): SessionMutation {
  const id = result.id || args.name_or_id || args.name;
  const label = (result.name ||
    args.name ||
    (id ? `SB: ${id}` : 'Sourcebook')) as string;
  return {
    id: `sb-${Date.now()}-${Math.random()}`,
    type: 'sourcebook',
    label,
    targetId: id as string | undefined,
  };
}

/** Build chapter mutation. */
function buildChapterMutation(
  args: Record<string, unknown>,
  result: Record<string, unknown>
): SessionMutation {
  const chapId = result.chap_id || args.chap_id;
  return {
    id: `chap-${Date.now()}-${Math.random()}`,
    type: 'chapter',
    label: chapId ? `Chapter ${chapId}` : 'Chapter prose',
    targetId: chapId ? String(chapId) : undefined,
  };
}

/** Build metadata fields. */
export function buildMetadataFields(
  args: Record<string, unknown>,
  forceSummary: boolean
): SessionMutation[] {
  const changedFields: Array<'summary' | 'notes' | 'private' | 'conflicts'> = [];
  if (forceSummary || args.summary !== undefined) changedFields.push('summary');
  if (args.notes !== undefined) changedFields.push('notes');
  if (args.private_notes !== undefined) changedFields.push('private');
  if (args.conflicts !== undefined) changedFields.push('conflicts');
  if (changedFields.length === 0) changedFields.push('summary');
  return changedFields.map(
    (subType: 'summary' | 'notes' | 'conflicts' | 'private') => ({
      id: `meta-${Date.now()}-${Math.random()}`,
      type: 'metadata' as const,
      label: subType.charAt(0).toUpperCase() + subType.slice(1),
      subType,
    })
  );
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Maps each mutation-producing tool name to a factory that turns the raw
 * `{ args, result }` pair into one or more `SessionMutation` objects.
 */
export const MUTATION_TOOL_REGISTRY: Record<string, MutFactory> = {
  // --- Sourcebook tools ---
  create_sourcebook_entry: ({ args, result }: MutCallResult) =>
    buildSourcebookMutation(args, result),
  update_sourcebook_entry: ({ args, result }: MutCallResult) =>
    buildSourcebookMutation(args, result),
  delete_sourcebook_entry: ({ args, result }: MutCallResult) =>
    buildSourcebookMutation(args, result),

  add_sourcebook_relation: ({ args }: MutCallResult) => {
    const sourceId = args.source_id || args.sourceId || args.name_or_id || args.name;
    const targetId = args.target_id || args.targetId;
    const label = sourceId
      ? `SB: ${sourceId}`
      : targetId
        ? `SB: ${targetId}`
        : 'Sourcebook';
    return {
      id: `sb-${Date.now()}-${Math.random()}`,
      type: 'sourcebook',
      label,
      targetId: (sourceId || targetId) as string | undefined,
    };
  },

  remove_sourcebook_relation: ({ args }: MutCallResult) => {
    const sourceId = args.source_id || args.sourceId || args.name_or_id || args.name;
    const targetId = args.target_id || args.targetId;
    const label = sourceId
      ? `SB: ${sourceId}`
      : targetId
        ? `SB: ${targetId}`
        : 'Sourcebook';
    return {
      id: `sb-${Date.now()}-${Math.random()}`,
      type: 'sourcebook',
      label,
      targetId: (sourceId || targetId) as string | undefined,
    };
  },

  // --- Metadata tools (one badge per changed field) ---
  update_story_metadata: ({ args }: MutCallResult) => buildMetadataFields(args, false),
  update_chapter_metadata: ({ args }: MutCallResult) =>
    buildMetadataFields(args, false),
  update_book_metadata: ({ args }: MutCallResult) => buildMetadataFields(args, false),
  set_story_tags: () => buildMetadataFields({}, true),
  set_story_summary: () => buildMetadataFields({}, true),
  sync_story_summary: () => buildMetadataFields({}, true),
  write_story_summary: () => buildMetadataFields({}, true),

  // --- Chapter prose tools ---
  write_chapter_content: ({ args, result }: MutCallResult) =>
    buildChapterMutation(args, result),
  replace_text_in_chapter: ({ args, result }: MutCallResult) =>
    buildChapterMutation(args, result),
  apply_chapter_replacements: ({ args, result }: MutCallResult) =>
    buildChapterMutation(args, result),
  write_chapter: ({ args, result }: MutCallResult) =>
    buildChapterMutation(args, result),

  // --- Story prose tools ---
  write_story_content: () => ({
    id: `story-${Date.now()}-${Math.random()}`,
    type: 'story',
    label: 'Story prose',
  }),
  call_editing_assistant: () => ({
    id: `story-${Date.now()}-${Math.random()}`,
    type: 'story',
    label: 'Story prose',
  }),
  call_writing_llm: () => ({
    id: `story-${Date.now()}-${Math.random()}`,
    type: 'story',
    label: 'Story prose',
  }),

  // --- Book tools ---
  write_book_content: ({ args, result }: MutCallResult) => {
    const bookId = result.book_id || args.book_id;
    return {
      id: `book-${Date.now()}-${Math.random()}`,
      type: 'book',
      label: 'Book',
      targetId: bookId as string | undefined,
    };
  },
};
