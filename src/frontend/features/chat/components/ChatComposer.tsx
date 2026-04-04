// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chat composer UI so input handling is separated from message rendering.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Paperclip, FileText } from 'lucide-react';
import { useConfirm } from '../../layout/ConfirmDialogContext';
import { useTheme } from '../../layout/ThemeContext';

type ChatAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
};

type ChatComposerProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  isModelAvailable?: boolean;
  disabledReason?: string;
  inputBg: string;
  attachments: ChatAttachment[];
  onAttachmentsChange: (next: ChatAttachment[]) => void;
  onSubmit: (text: string, attachments?: ChatAttachment[]) => void;
};

export const ChatComposer: React.FC<ChatComposerProps> = ({
  textareaRef,
  fileInputRef,
  isLoading,
  isModelAvailable = true,
  disabledReason,
  inputBg,
  attachments,
  onAttachmentsChange,
  onSubmit,
}) => {
  const [input, setInput] = useState('');
  const { isLight } = useTheme();

  const isDisabled = isLoading || !isModelAvailable;
  const disabledTitle = !isModelAvailable
    ? disabledReason ||
      'Chat is unavailable because no working CHAT model is configured.'
    : 'Send Message (CHAT model)';

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;

    const nextAttachments: ChatAttachment[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    }));

    onAttachmentsChange([...attachments, ...nextAttachments]);
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    const attachment = attachments.find((item) => item.id === attachmentId);
    if (!attachment) return;
    if (!(await confirm(`Remove attachment “${attachment.name}”?`))) return;
    onAttachmentsChange(attachments.filter((item) => item.id !== attachmentId));
  };

  const confirm = useConfirm();

  const adjustTextareaHeight = useCallback(() => {
    if (!textareaRef.current) return;

    const el = textareaRef.current;
    el.style.height = 'auto';

    // Keep the input box responsive and bounded for right-pane layout.
    const maxHeight = 280;
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;

    // If we hit max height, keep vertical scrolling inside textarea.
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [textareaRef]);

  const submitCurrentInput = useCallback(() => {
    const trimmed = input.trim();
    const hasContent = trimmed || attachments.length > 0;
    if (!hasContent || isDisabled) return;

    onSubmit(trimmed, attachments.length ? attachments : undefined);
    setInput('');
    onAttachmentsChange([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      if (textareaRef.current.scrollHeight) {
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [input, attachments, isDisabled, onSubmit, onAttachmentsChange, textareaRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCurrentInput();
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentInput();
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => handleRemoveAttachment(attachment.id)}
              title={`Click to remove ${attachment.name}`}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                isLight
                  ? 'border-brand-gray-200 bg-brand-gray-100 text-brand-gray-700 hover:bg-brand-gray-200'
                  : 'border-brand-gray-700 bg-brand-gray-900 text-brand-gray-200 hover:bg-brand-gray-800'
              }`}
            >
              <FileText size={14} />
              <span className="truncate max-w-[10rem]">{attachment.name}</span>
              <span className={isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'}>
                {formatFileSize(attachment.size)}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files"
            aria-label="Attach files"
            className={`ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
              isLight
                ? 'border-brand-gray-300 bg-white text-brand-gray-700 hover:bg-brand-gray-50'
                : 'border-brand-gray-700 bg-brand-gray-900 text-brand-gray-200 hover:bg-brand-gray-800'
            }`}
          >
            <Paperclip size={16} />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={handleFileSelection}
        data-testid="chat-attachment-input"
      />
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          adjustTextareaHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask CHAT to plan, update metadata, or delegate writing/editing..."
        className={`w-full pl-4 pr-12 py-3 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm placeholder-brand-gray-400 border resize-none overflow-y-auto disabled:cursor-not-allowed ${inputBg}`}
        disabled={isDisabled}
        title={disabledTitle}
        aria-label="Chat message"
      />
      <button
        type="submit"
        disabled={!(input.trim() || attachments.length > 0) || isDisabled}
        className="absolute right-2 bottom-2 p-2 text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-gray-200 dark:hover:bg-brand-gray-700 rounded-full transition-colors"
        title={disabledTitle}
        aria-label="Send Message"
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
};
