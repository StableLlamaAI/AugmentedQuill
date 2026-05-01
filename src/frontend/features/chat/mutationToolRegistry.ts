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

type ReplaceChangeLocation = {
  type: string;
  target_id?: string;
  field?: string;
  label: string;
};

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
    (
      subType: 'summary' | 'notes' | 'conflicts' | 'private'
    ): {
      id: string;
      type: 'metadata';
      label: string;
      subType: 'summary' | 'notes' | 'private' | 'conflicts';
    } => ({
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
  create_sourcebook_entry: ({ args, result }: MutCallResult): SessionMutation =>
    buildSourcebookMutation(args, result),
  update_sourcebook_entry: ({ args, result }: MutCallResult): SessionMutation =>
    buildSourcebookMutation(args, result),
  delete_sourcebook_entry: ({ args, result }: MutCallResult): SessionMutation =>
    buildSourcebookMutation(args, result),

  add_sourcebook_relation: ({
    args,
  }: MutCallResult): {
    id: string;
    type: 'sourcebook';
    label: string;
    targetId: string | undefined;
  } => {
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

  remove_sourcebook_relation: ({
    args,
  }: MutCallResult): {
    id: string;
    type: 'sourcebook';
    label: string;
    targetId: string | undefined;
  } => {
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
  update_story_metadata: ({ args }: MutCallResult): SessionMutation[] =>
    buildMetadataFields(args, false),
  update_chapter_metadata: ({ args }: MutCallResult): SessionMutation[] =>
    buildMetadataFields(args, false),
  update_book_metadata: ({ args }: MutCallResult): SessionMutation[] =>
    buildMetadataFields(args, false),
  set_story_tags: (): SessionMutation[] => buildMetadataFields({}, true),
  set_story_summary: (): SessionMutation[] => buildMetadataFields({}, true),
  sync_story_summary: (): SessionMutation[] => buildMetadataFields({}, true),
  write_story_summary: (): SessionMutation[] => buildMetadataFields({}, true),

  // --- Chapter prose tools ---
  write_chapter_content: ({ args, result }: MutCallResult): SessionMutation =>
    buildChapterMutation(args, result),
  replace_text_in_chapter: ({ args, result }: MutCallResult): SessionMutation =>
    buildChapterMutation(args, result),
  apply_chapter_replacements: ({ args, result }: MutCallResult): SessionMutation =>
    buildChapterMutation(args, result),
  write_chapter: ({ args, result }: MutCallResult): SessionMutation =>
    buildChapterMutation(args, result),

  // --- Story prose tools ---
  write_story_content: (): { id: string; type: 'story'; label: string } => ({
    id: `story-${Date.now()}-${Math.random()}`,
    type: 'story',
    label: 'Story prose',
  }),
  call_editing_assistant: (): { id: string; type: 'story'; label: string } => ({
    id: `story-${Date.now()}-${Math.random()}`,
    type: 'story',
    label: 'Story prose',
  }),
  call_writing_llm: (): { id: string; type: 'story'; label: string } => ({
    id: `story-${Date.now()}-${Math.random()}`,
    type: 'story',
    label: 'Story prose',
  }),

  // --- Book tools ---
  write_book_content: ({
    args,
    result,
  }: MutCallResult): {
    id: string;
    type: 'book';
    label: string;
    targetId: string | undefined;
  } => {
    const bookId = result.book_id || args.book_id;
    return {
      id: `book-${Date.now()}-${Math.random()}`,
      type: 'book',
      label: 'Book',
      targetId: bookId as string | undefined,
    };
  },

  replace_in_project: ({ result }: MutCallResult) => {
    const changeLocations = Array.isArray(result.change_locations)
      ? result.change_locations
      : [];
    const changedSections = Array.isArray(result.changed_sections)
      ? result.changed_sections.map(String)
      : [];

    const parseMetadataSubType = (
      field: string
    ): SessionMutation['subType'] | undefined => {
      const normalized = field.toLowerCase();
      if (normalized.endsWith('summary')) return 'summary';
      if (normalized.endsWith('notes')) return 'notes';
      if (normalized.endsWith('private_notes') || normalized.endsWith('private notes'))
        return 'private';
      if (normalized.includes('conflict')) return 'conflicts';
      return undefined;
    };

    const mutations = changeLocations.map((location: ReplaceChangeLocation) => {
      const targetId = location.target_id;
      switch (location.type) {
        case 'chapter':
          return {
            id: `chap-replace-${targetId ?? 'unknown'}-${Date.now()}-${Math.random()}`,
            type: 'chapter' as const,
            label: location.label,
            targetId: targetId as string | undefined,
          };
        case 'sourcebook':
          return {
            id: `sb-replace-${targetId ?? 'unknown'}-${Date.now()}-${Math.random()}`,
            type: 'sourcebook' as const,
            label: location.label,
            targetId: targetId as string | undefined,
          };
        case 'book':
          return {
            id: `book-replace-${targetId ?? 'unknown'}-${Date.now()}-${Math.random()}`,
            type: 'book' as const,
            label: location.label,
            targetId: targetId as string | undefined,
          };
        case 'metadata': {
          const subType = location.field
            ? parseMetadataSubType(location.field)
            : parseMetadataSubType(location.label);
          return {
            id: `meta-replace-${Date.now()}-${Math.random()}`,
            type: 'metadata' as const,
            label: location.label,
            targetId: location.target_id as string | undefined,
            subType,
          };
        }
        case 'story':
          return {
            id: `story-replace-${Date.now()}-${Math.random()}`,
            type: 'story' as const,
            label: location.label,
          };
        default:
          return {
            id: `story-replace-${Date.now()}-${Math.random()}`,
            type: 'story' as const,
            label: location.label,
          };
      }
    });

    if (mutations.length > 0) {
      return mutations;
    }

    const fallbackMutations = changedSections.map((section: string) => {
      const chapterMatch = section.match(/Chapter\s+(\d+)/i);
      if (chapterMatch) {
        return {
          id: `chap-replace-${chapterMatch[1]}-${Date.now()}-${Math.random()}`,
          type: 'chapter' as const,
          label: section,
          targetId: chapterMatch[1],
        };
      }

      const sourcebookMatch = section.match(/Sourcebook\s+'([^']+)'/i);
      if (sourcebookMatch) {
        return {
          id: `sb-replace-${sourcebookMatch[1]}-${Date.now()}-${Math.random()}`,
          type: 'sourcebook' as const,
          label: section,
          targetId: sourcebookMatch[1],
        };
      }

      const bookMatch = section.match(/Book\s+'([^']+)'/i);
      if (bookMatch) {
        return {
          id: `book-replace-${bookMatch[1]}-${Date.now()}-${Math.random()}`,
          type: 'book' as const,
          label: section,
          targetId: bookMatch[1],
        };
      }

      const storyMatch = section.match(/^Story\s+(.*)$/i);
      if (storyMatch) {
        const subType = parseMetadataSubType(storyMatch[1]);
        return {
          id: `story-replace-${Date.now()}-${Math.random()}`,
          type: subType ? ('metadata' as const) : ('story' as const),
          label: section,
          subType,
        };
      }

      const inferredSubType = parseMetadataSubType(section);
      if (inferredSubType) {
        return {
          id: `story-replace-${Date.now()}-${Math.random()}`,
          type: 'metadata' as const,
          label: section,
          subType: inferredSubType,
        };
      }

      return {
        id: `story-replace-${Date.now()}-${Math.random()}`,
        type: 'story' as const,
        label: section,
      };
    });

    return fallbackMutations.length > 0
      ? fallbackMutations
      : [
          {
            id: `story-replace-${Date.now()}-${Math.random()}`,
            type: 'story',
            label: 'Project replace',
          },
        ];
  },
};
