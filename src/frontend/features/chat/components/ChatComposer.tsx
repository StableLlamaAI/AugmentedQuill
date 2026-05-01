// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chat composer UI so input handling is separated from message rendering.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, FileText } from 'lucide-react';
import { useConfirm } from '../../layout/ConfirmDialogContext';
import { useTheme } from '../../layout/ThemeContext';
import { ChatAttachment } from '../../../types';

type ChatComposerProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  isModelAvailable?: boolean;
  disabledReason?: string;
  inputBg: string;
  attachments: ChatAttachment[];
  language?: string;
  onAttachmentsChange: (next: ChatAttachment[]) => void;
  onSubmit: (text: string, attachments?: ChatAttachment[]) => void;
};

// eslint-disable-next-line max-lines-per-function
export const ChatComposer: React.FC<ChatComposerProps> = ({
  textareaRef,
  fileInputRef,
  isLoading,
  isModelAvailable = true,
  disabledReason,
  inputBg,
  attachments,
  language,
  onAttachmentsChange,
  onSubmit,
}: ChatComposerProps) => {
  const [input, setInput] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const { isLight } = useTheme();
  const { t } = useTranslation();

  const isDisabled = isLoading || !isModelAvailable;
  const disabledTitle = !isModelAvailable
    ? disabledReason ||
      t('Chat is unavailable because no working CHAT model is configured.')
    : t('Send Message (CHAT model)');

  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isTextLikeFile = (file: File): boolean => {
    const textTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/ecmascript',
      'application/xhtml+xml',
    ];
    return (
      file.type.startsWith('text/') ||
      textTypes.includes(file.type) ||
      /\.(md|markdown|json|xml|csv|yml|yaml|txt)$/i.test(file.name)
    );
  };

  const toBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  };

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;

    const nextAttachments: ChatAttachment[] = await Promise.all(
      Array.from(files).map(async (file: File): Promise<ChatAttachment> => {
        const attachment: ChatAttachment = {
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
        };

        try {
          if (isTextLikeFile(file)) {
            attachment.content = await file.text();
            attachment.encoding = 'utf-8';
          } else {
            attachment.content = await toBase64(file);
            attachment.encoding = 'base64';
          }
        } catch {
          attachment.content = undefined;
          attachment.encoding = undefined;
        }

        return attachment;
      })
    );

    onAttachmentsChange([...attachments, ...nextAttachments]);
  };

  const handleFileSelection = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    await addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    if (!isDisabled) {
      setIsDragActive(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    if (!isDisabled) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>): void => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>): Promise<void> => {
    e.preventDefault();
    setIsDragActive(false);
    await addFiles(e.dataTransfer.files);
  };

  const handleRemoveAttachment = async (attachmentId: string): Promise<void> => {
    const attachment = attachments.find(
      (item: ChatAttachment): boolean => item.id === attachmentId
    );
    if (!attachment) return;
    if (!(await confirm(`Remove attachment “${attachment.name}”?`))) return;
    onAttachmentsChange(
      attachments.filter((item: ChatAttachment): boolean => item.id !== attachmentId)
    );
  };

  const confirm = useConfirm();

  const adjustTextareaHeight = useCallback((): void => {
    if (!textareaRef.current) return;

    const el = textareaRef.current;
    el.style.height = 'auto';

    // Single read of scrollHeight to avoid layout thrashing.
    const maxHeight = 280;
    const sh = el.scrollHeight;
    el.style.height = `${Math.min(sh, maxHeight)}px`;
    el.style.overflowY = sh > maxHeight ? 'auto' : 'hidden';
  }, [textareaRef]);

  const submitCurrentInput = useCallback((): void => {
    const trimmed = input.trim();
    const hasContent = trimmed || attachments.length > 0;
    if (!hasContent || isDisabled) return;

    onSubmit(trimmed, attachments.length ? attachments : undefined);
    setInput('');
    onAttachmentsChange([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [input, attachments, isDisabled, onSubmit, onAttachmentsChange, textareaRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCurrentInput();
    }
  };

  useEffect((): void => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, input]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    submitCurrentInput();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative ${isDragActive ? 'ring-2 ring-brand-500/50 bg-brand-gray-100 dark:bg-brand-gray-800' : ''}`}
    >
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {attachments.map((attachment: ChatAttachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={(): Promise<void> => handleRemoveAttachment(attachment.id)}
              title={t('Click to remove {{name}}', { name: attachment.name })}
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
            title={t('Attach files')}
            aria-label={t('Attach files')}
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
        lang={language || undefined}
        spellCheck={true}
        onChange={(
          e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>
        ): void => {
          setInput(e.target.value);
          adjustTextareaHeight();
        }}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        placeholder={t(
          'Ask CHAT to plan, update metadata, or delegate writing/editing...'
        )}
        className={`w-full pl-4 pr-12 py-3 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm placeholder-brand-gray-400 border resize-none overflow-y-auto disabled:cursor-not-allowed ${inputBg}`}
        disabled={isDisabled}
        title={disabledTitle}
        aria-label={t('Chat message')}
      />
      <button
        type="submit"
        disabled={!(input.trim() || attachments.length > 0) || isDisabled}
        className="absolute right-2 bottom-2 p-2 text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-gray-200 dark:hover:bg-brand-gray-700 rounded-full transition-colors"
        title={disabledTitle}
        aria-label={t('Send Message')}
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
};
