// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines chat composer UI so input handling is separated from message rendering.
 */

import React, { useCallback, useState } from 'react';
import { Send } from 'lucide-react';

type ChatComposerProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  isModelAvailable?: boolean;
  disabledReason?: string;
  inputBg: string;
  onSubmit: (text: string) => void;
};

export const ChatComposer: React.FC<ChatComposerProps> = ({
  textareaRef,
  isLoading,
  isModelAvailable = true,
  disabledReason,
  inputBg,
  onSubmit,
}) => {
  const [input, setInput] = useState('');
  const isDisabled = isLoading || !isModelAvailable;
  const disabledTitle = !isModelAvailable
    ? disabledReason ||
      'Chat is unavailable because no working CHAT model is configured.'
    : 'Send Message (CHAT model)';

  // Keep the composer at consistent height by resetting to auto on submit.
  // Do not auto-expand to viewport fractions, as that can break right-pane layout.
  const submitCurrentInput = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isDisabled) return;

    onSubmit(trimmed);
    setInput('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isDisabled, onSubmit, textareaRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCurrentInput();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentInput();
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask CHAT to plan, update metadata, or delegate writing/editing..."
        className={`w-full pl-4 pr-12 py-3 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-sm placeholder-brand-gray-400 border resize-none overflow-y-auto disabled:cursor-not-allowed ${inputBg}`}
        disabled={isDisabled}
        title={disabledTitle}
      />
      <button
        type="submit"
        disabled={!input.trim() || isDisabled}
        className="absolute right-2 bottom-2 p-2 text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-gray-200 dark:hover:bg-brand-gray-700 rounded-full transition-colors"
        title={disabledTitle}
      >
        <Send size={18} />
      </button>
    </form>
  );
};
