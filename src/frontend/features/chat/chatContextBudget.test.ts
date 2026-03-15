// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chat context budget tests so long tool-heavy histories stay compact and predictable.
 */

import { describe, expect, it } from 'vitest';

import { prepareChatContext } from './chatContextBudget';
import { LLMConfig } from '../../types';

const config: LLMConfig = {
  id: 'chat',
  name: 'Chat',
  baseUrl: 'http://example.invalid',
  apiKey: 'x',
  timeout: 1000,
  modelId: 'demo-32k',
  maxTokens: 2048,
  contextWindowTokens: 32000,
  prompts: { system: '', continuation: '', summary: '' },
};

describe('prepareChatContext', () => {
  it('keeps short histories unchanged', () => {
    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [{ role: 'user', text: 'Hello there.' }],
      config,
      userMessageText: 'What now?',
    });

    expect(prepared.usage.compactionApplied).toBe(false);
    expect(prepared.usage.enabled).toBe(true);
    expect(prepared.messages.at(-1)?.content).toBe('What now?');
  });

  it('does not compact or report usage when context window is unset', () => {
    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [
        {
          role: 'tool',
          name: 'get_project_overview',
          tool_call_id: 'call_1',
          text: 'Huge result '.repeat(2000),
        },
      ],
      config: { ...config, contextWindowTokens: undefined },
      userMessageText: 'Continue.',
    });

    expect(prepared.usage.enabled).toBe(false);
    expect(prepared.usage.compactionApplied).toBe(false);
    expect(prepared.messages[1].content).toContain('Huge result');
  });

  it('compacts oversized tool output before sending', () => {
    const chapters = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      title: `Chapter ${index + 1}`,
      summary: 'Very long summary '.repeat(40),
      conflicts: Array.from({ length: 8 }, (_, conflictIndex) => ({
        id: `${index}-${conflictIndex}`,
        description: 'Conflict detail '.repeat(30),
      })),
    }));

    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [
        { role: 'user', text: 'Inspect the project.' },
        {
          role: 'model',
          text: '',
          tool_calls: [
            {
              id: 'call_1',
              name: 'get_project_overview',
              args: { include_notes: true },
            },
          ],
        },
        {
          role: 'tool',
          name: 'get_project_overview',
          tool_call_id: 'call_1',
          text: JSON.stringify({
            project_title: 'Huge Project',
            project_type: 'novel',
            sourcebook_entry_count: 42,
            chapters,
          }),
        },
      ],
      config: { ...config, contextWindowTokens: 4096, modelId: 'demo-4k' },
      userMessageText: 'Continue.',
    });

    const toolMessage = prepared.messages.find((message) => message.role === 'tool');
    expect(prepared.usage.compactionApplied).toBe(true);
    expect(toolMessage?.content).toContain('Earlier tool result');
    expect(toolMessage?.content?.length).toBeLessThan(2000);
    expect(prepared.usage.withinBudget).toBe(true);
  });

  it('keeps summarized tool call arguments as valid JSON', () => {
    const longSummary = 'Psychological contradiction and erotic tension. '.repeat(80);
    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [
        {
          role: 'model',
          text: '',
          tool_calls: [
            {
              id: 'call_summary',
              name: 'write_chapter_summary',
              args: {
                chap_id: 6,
                summary: longSummary,
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'write_chapter_summary',
          tool_call_id: 'call_summary',
          text: JSON.stringify({
            message: 'Summary written to chapter 6 successfully',
          }),
        },
      ],
      config: { ...config, contextWindowTokens: 4096, modelId: 'demo-4k' },
      userMessageText: 'Continue.',
    });

    const toolCallArgs = prepared.messages[1].tool_calls?.[0].function.arguments;
    expect(toolCallArgs).toBeTruthy();
    expect(() => JSON.parse(toolCallArgs || '')).not.toThrow();
  });

  it('does not duplicate an existing earlier-tool-result prefix', () => {
    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [
        {
          role: 'tool',
          name: 'get_project_overview',
          tool_call_id: 'call_1',
          text:
            '[Earlier tool result: get_project_overview] ' +
            JSON.stringify({
              project_title: 'Huge Project',
              chapters: Array.from({ length: 20 }, (_, index) => ({
                id: index + 1,
                title: `Chapter ${index + 1}`,
                summary: 'Long summary '.repeat(30),
              })),
            }),
        },
      ],
      config: { ...config, contextWindowTokens: 4096, modelId: 'demo-4k' },
      userMessageText: 'Continue.',
    });

    const toolMessage = prepared.messages[1].content || '';
    expect(
      toolMessage.match(/\[Earlier tool result: get_project_overview\]/g)?.length
    ).toBe(1);
  });

  it('respects explicit context window overrides', () => {
    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [{ role: 'user', text: 'Hello'.repeat(200) }],
      config: { ...config, contextWindowTokens: 64000 },
    });

    expect(prepared.usage.contextWindowTokens).toBe(64000);
    expect(prepared.usage.promptBudgetTokens).toBeGreaterThan(32000);
  });

  it('injects warning hint when context usage is high', () => {
    // 32k window, 2k maxTokens, approx 29k budget tokens
    // We need approx 85% of 32k window = 27k tokens.
    // 1 token approx 4 chars, so ~100k chars content.
    const bulkyUserText = 'Long user text '.repeat(8000);

    const prepared = prepareChatContext({
      systemInstruction: 'You are helpful.',
      history: [{ role: 'user', text: bulkyUserText }],
      config,
      userMessageText: 'Final question.',
    });

    expect(prepared.usage.usageRatio).toBeGreaterThan(0.85);
    const lastMsg = prepared.messages.at(-1);
    expect(lastMsg?.role).toBe('user');
    expect(lastMsg?.content).toContain('[SYSTEM HINT: The chat context is almost full');
    expect(lastMsg?.content).toContain('write_scratchpad');
  });
});
