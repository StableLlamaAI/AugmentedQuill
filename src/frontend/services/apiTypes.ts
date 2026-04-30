// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the api types unit so this responsibility stays isolated, testable, and easy to evolve.
 *
 * All types here are re-exported aliases of the auto-generated TypeScript types derived from the
 * backend's OpenAPI schema. Do NOT hand-edit these definitions; update the backend Pydantic models
 * instead and then run `npm run generate:types` to regenerate `types/api.generated.ts`.
 */

import { Chapter } from '../types';
import { components } from '../types/api.generated';

// ---------------------------------------------------------------------------
// Machine / settings types
// ---------------------------------------------------------------------------

export type MachineModelConfig = components['schemas']['MachineModelConfig'];
export type MachineOpenAIConfig = components['schemas']['MachineOpenAIConfig'];
export type MachineConfigResponse = components['schemas']['MachineConfigResponse'];
export type ModelPresetWarning = components['schemas']['ModelPresetWarning'];
export type ModelPresetEntry = components['schemas']['ModelPresetEntry'];
export type MachinePresetsResponse = components['schemas']['MachinePresetsResponse'];
export type MachineTestResponse = components['schemas']['MachineTestResponse'];
export type MachineTestModelResponse =
  components['schemas']['MachineTestModelResponse'];
export type PromptsResponse = components['schemas']['PromptsResponse'];
export type StorySummaryResponse = components['schemas']['StorySummaryResponse'];
export type StoryTagsResponse = components['schemas']['StoryTagsResponse'];

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

/** @deprecated Use ProjectInfo from the generated types directly. */
export type ProjectListItem = components['schemas']['ProjectInfo'];
export type ProjectsListResponse = components['schemas']['ProjectListResponse'];
export type ProjectSelectResponse = components['schemas']['ProjectSelectResponse'];
export type ProjectMutationResponse = components['schemas']['ProjectMutationResponse'];
export type StoryApiPayload = components['schemas']['StoryPayload'];
export type BookMutationResponse = components['schemas']['BookMutationResponse'];

// ---------------------------------------------------------------------------
// Story content
// ---------------------------------------------------------------------------

export type StoryContentResponse = components['schemas']['StoryContentResponse'];

// ---------------------------------------------------------------------------
// Chapter types
// ---------------------------------------------------------------------------

/** @deprecated Use ChapterSummary from the generated types directly. */
export type ChapterListItem = components['schemas']['ChapterSummary'];
/** @deprecated Use ChaptersListResponse from the generated types directly. */
export type ChapterListResponse = components['schemas']['ChaptersListResponse'];
export type ChapterDetailResponse = components['schemas']['ChapterDetailResponse'];

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

export type ChatToolBatchMutationResponse =
  components['schemas']['ChatToolBatchMutationResponse'];
export type ChatListItem = components['schemas']['ChatListItem'];
export type ChatListResponse = components['schemas']['ChatListResponse'];
export type ChatDetailResponse = components['schemas']['ChatDetailResponse'];

// ---------------------------------------------------------------------------
// Image types
// ---------------------------------------------------------------------------

/** @deprecated Use ProjectImageInfo from the generated types directly. */
export type ProjectImage = components['schemas']['ProjectImageInfo'];
export type ListImagesResponse = components['schemas']['ListImagesResponse'];

// ---------------------------------------------------------------------------
// Chat streaming / tool-call types (not FastAPI response models — hand-written)
// ---------------------------------------------------------------------------

export interface ChatApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface ChatToolFunctionCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatToolExecutionResponse {
  ok: boolean;
  appended_messages: Array<{
    role: 'tool';
    tool_call_id: string;
    name: string;
    content: string;
  }>;
  mutations?: {
    story_changed?: boolean;
    tool_batch?: {
      batch_id: string;
      tool_names: string[];
      operation_count: number;
      label: string;
      changed_chapter_ids?: number[];
    };
    change_locations?: Array<{
      type: string;
      target_id?: string;
      field?: string;
      label: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Sourcebook types
// ---------------------------------------------------------------------------

/**
 * Upsert payload for sourcebook entries.
 * Extends SourcebookEntryCreate with an optional `id` so the same type can
 * describe both create (no id) and update (with id) operations.
 */
export type SourcebookUpsertPayload = components['schemas']['SourcebookEntryCreate'] & {
  id?: string;
};

// ---------------------------------------------------------------------------
// Debug types
// ---------------------------------------------------------------------------

export type DebugLogEntry = components['schemas']['DebugLogEntry'];
export type DebugLogsResponse = components['schemas']['DebugLogsResponse'];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export const mapChapterListItemToChapter = (item: ChapterListItem): Chapter => ({
  id: String(item.id),
  title: item.title ?? undefined,
  summary: item.summary ?? undefined,
  content: '',
  filename: item.filename ?? undefined,
  book_id: item.book_id ?? undefined,
  notes: item.notes ?? undefined,
  private_notes: item.private_notes ?? undefined,
  conflicts: (item.conflicts ?? []) as Chapter['conflicts'],
});
