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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
        role: 'model',
        text: 'Hello',
        thinking: 'first streaming content',
      },
    ];

    const { rerender } = render(
      <Chat messages={messages} isLoading={true} {...defaultProps} />
    );

    expect(screen.getByText('first streaming content')).toBeTruthy();

    rerender(<Chat messages={messages} isLoading={false} {...defaultProps} />);
    expect(screen.queryByText('first streaming content')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Thinking Process/i }));
    expect(screen.getByText('first streaming content')).toBeTruthy();

    rerender(<Chat messages={messages} isLoading={true} {...defaultProps} />);
    expect(screen.getByText('first streaming content')).toBeTruthy();

    rerender(<Chat messages={messages} isLoading={false} {...defaultProps} />);
    expect(screen.getByText('first streaming content')).toBeTruthy();
  });

  it('opens and saves scratchpad modal content', () => {
    const onUpdateScratchpad = vi.fn();
    const onDeleteScratchpad = vi.fn();

    render(
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

  it('allows file attachments to be added, previewed, and sent', async () => {
    const onSendMessage = vi.fn();
    const file = new File(['story'], 'example.txt', { type: 'text/plain' });

    render(
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

    render(
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

    render(
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
    render(
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

  it('shows regenerate button when there is a user message and generation is not active', () => {
    render(
      <Chat
        {...defaultProps}
        messages={[{ id: 'u1', role: 'user', text: 'Hello' }]}
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
});
