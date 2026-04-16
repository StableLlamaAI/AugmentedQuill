// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines tests for Chat component behavior.
 */

// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import i18n from '../app/i18n';
import { Chat } from './Chat';
import { LLMConfig } from '../../types';

const mockConfig: LLMConfig = {
  id: 'm1',
  name: 'Test Model',
  baseUrl: 'http://example.invalid',
  apiKey: 'key',
  timeout: 1000,
  modelId: 'm1',
  prompts: { system: '', continuation: '', summary: '' },
};

const defaultProps = {
  activeChatConfig: mockConfig,
  systemPrompt: '',
  onSendMessage: vi.fn(),
  onStop: vi.fn(),
  onRegenerate: vi.fn(),
  onEditMessage: vi.fn(),
  onDeleteMessage: vi.fn(),
  onUpdateSystemPrompt: vi.fn(),
  onSwitchProject: vi.fn(),
  theme: 'light' as const,
  sessions: [],
  currentSessionId: null,
  isIncognito: false,
  onSelectSession: vi.fn(),
  onNewSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onToggleIncognito: vi.fn(),
  allowWebSearch: false,
  onToggleWebSearch: vi.fn(),
};

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('Chat', () => {
  beforeAll(() => {
    if (!(window.HTMLElement.prototype as any).scrollTo) {
      (window.HTMLElement.prototype as any).scrollTo = () => {};
    }
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('automatically expands active stream thinking and then collapses when stream ends, while user-open persists', () => {
    const messages = [
      {
        id: 'm1',
        role: 'model' as const,
        text: 'Hello',
        thinking: 'first streaming content',
      },
    ];

    const { rerender } = renderWithI18n(
      <Chat
        messages={messages}
        isLoading={true}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
        {...defaultProps}
      />
    );

    expect(screen.getByText('first streaming content')).toBeTruthy();

    rerender(
      <Chat
        messages={messages}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
        {...defaultProps}
      />
    );
    expect(screen.queryByText('first streaming content')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Thinking Process/i }));
    expect(screen.getByText('first streaming content')).toBeTruthy();

    rerender(
      <Chat
        messages={messages}
        isLoading={true}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
        {...defaultProps}
      />
    );
    expect(screen.getByText('first streaming content')).toBeTruthy();

    rerender(
      <Chat
        messages={messages}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
        {...defaultProps}
      />
    );
    expect(screen.getByText('first streaming content')).toBeTruthy();
  });

  it('opens and saves scratchpad modal content', () => {
    const onUpdateScratchpad = vi.fn();
    const onDeleteScratchpad = vi.fn();

    renderWithI18n(
      <Chat
        messages={[]}
        isLoading={false}
        scratchpad="initial"
        onUpdateScratchpad={onUpdateScratchpad}
        onDeleteScratchpad={onDeleteScratchpad}
        {...defaultProps}
      />
    );

    fireEvent.click(screen.getByTitle('Open Scratchpad'));
    expect(screen.getByRole('dialog', { name: /scratchpad/i })).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText('Current internal notes of the chat LLM...'),
      {
        target: { value: 'updated content' },
      }
    );

    fireEvent.click(screen.getByRole('button', { name: /Save Scratchpad/i }));

    expect(onUpdateScratchpad).toHaveBeenCalledWith('updated content');
  });

  it('renders mutation tags as buttons and invokes click handler', () => {
    const onMutationClick = vi.fn();
    renderWithI18n(
      <Chat
        messages={[]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
        sessionMutations={[
          { id: 'm1', type: 'chapter', label: 'Updated chapter title', targetId: '1' },
        ]}
        onMutationClick={onMutationClick}
        {...defaultProps}
      />
    );

    const tagButton = screen.getByRole('button', { name: /Updated chapter title/i });
    expect(tagButton.getAttribute('type')).toBe('button');

    fireEvent.click(tagButton);
    expect(onMutationClick).toHaveBeenCalledWith({
      id: 'm1',
      type: 'chapter',
      label: 'Updated chapter title',
      targetId: '1',
    });
  });

  it('allows file attachments to be added, previewed, and sent', async () => {
    const onSendMessage = vi.fn();
    const file = new File(['story'], 'example.txt', { type: 'text/plain' });

    renderWithI18n(
      <Chat
        {...defaultProps}
        onSendMessage={onSendMessage}
        messages={[]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Attach files/i }));
    fireEvent.change(screen.getByTestId('chat-attachment-input'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTitle(/Click to remove example.txt/i)).toBeTruthy();
    });

    const input = screen.getByRole('textbox', { name: /Chat message/i });
    fireEvent.change(input, { target: { value: 'Please review this file' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));

    expect(onSendMessage).toHaveBeenCalledWith('Please review this file', [
      expect.objectContaining({ name: 'example.txt' }),
    ]);
  });

  it('allows file attachments to be added by dropping on the message input', async () => {
    const onSendMessage = vi.fn();
    const file = new File(['story'], 'drop-example.txt', { type: 'text/plain' });
    const dataTransfer = {
      files: [file],
      types: ['Files'],
    } as unknown as DataTransfer;

    renderWithI18n(
      <Chat
        {...defaultProps}
        onSendMessage={onSendMessage}
        messages={[]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: /Chat message/i });
    fireEvent.drop(input, {
      dataTransfer,
    });

    await waitFor(() => {
      expect(screen.getByTitle(/Click to remove drop-example.txt/i)).toBeTruthy();
    });

    fireEvent.change(input, { target: { value: 'Please handle this dropped file' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Message/i }));

    expect(onSendMessage).toHaveBeenCalledWith('Please handle this dropped file', [
      expect.objectContaining({ name: 'drop-example.txt' }),
    ]);
  });

  it('offers removal when clicking an attachment preview', async () => {
    const file = new File(['story'], 'example.txt', { type: 'text/plain' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithI18n(
      <Chat
        {...defaultProps}
        messages={[]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Attach files/i }));
    fireEvent.change(screen.getByTestId('chat-attachment-input'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByTitle(/Click to remove example.txt/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle(/Click to remove example.txt/i));
    expect(confirmSpy).toHaveBeenCalledWith('Remove attachment “example.txt”?');

    await waitFor(() => {
      expect(screen.queryByTitle(/Click to remove example.txt/i)).toBeNull();
    });

    confirmSpy.mockRestore();
  });

  it('closes system instruction panel on Escape', () => {
    renderWithI18n(
      <Chat
        messages={[]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
        {...defaultProps}
      />
    );

    fireEvent.click(screen.getByTitle('Chat Settings'));
    expect(screen.getByText('System Instruction')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('System Instruction')).toBeNull();
  });

  it('shows tool call names in the hidden tool call title', () => {
    renderWithI18n(
      <Chat
        {...defaultProps}
        messages={[
          {
            id: 'a1',
            role: 'model' as const,
            text: 'Planning a tool call',
            tool_calls: [
              { id: 't1', name: 'search_books', args: { query: 'fantasy' } },
            ],
          },
        ]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
      />
    );

    expect(screen.getByText(/1 Tool Call \[search_books\]/i)).toBeTruthy();
  });

  it('shows regenerate button when there is a user message and generation is not active', () => {
    renderWithI18n(
      <Chat
        {...defaultProps}
        messages={[{ id: 'u1', role: 'user' as const, text: 'Hello' }]}
        isLoading={false}
        scratchpad=""
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: /Regenerate last response/i })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Regenerate last response/i }));
    expect(defaultProps.onRegenerate).toHaveBeenCalled();
  });

  it('applies story language to chat inputs and dialog textareas', () => {
    renderWithI18n(
      <Chat
        {...defaultProps}
        messages={[]}
        isLoading={false}
        scratchpad=""
        storyLanguage="fr"
        onUpdateScratchpad={vi.fn()}
        onDeleteScratchpad={vi.fn()}
      />
    );

    const composer = screen.getByRole('textbox', { name: /Chat message/i });
    expect(composer.getAttribute('lang')).toBe('fr');

    fireEvent.click(screen.getByTitle('Chat Settings'));
    expect(
      screen
        .getByPlaceholderText("Define the AI's persona and rules...")
        .getAttribute('lang')
    ).toBe('fr');

    fireEvent.click(screen.getByTitle('Open Scratchpad'));
    expect(
      screen
        .getByPlaceholderText('Current internal notes of the chat LLM...')
        .getAttribute('lang')
    ).toBe('fr');
  });
});
