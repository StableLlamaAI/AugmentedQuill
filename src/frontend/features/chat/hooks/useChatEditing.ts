// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate chat message editing state and handlers.
 */

import { useState, useRef, useCallback } from 'react';
import { ChatMessage } from '../../../types';

interface UseChatEditingResult {
  editingMessageId: string | null;
  editContent: string;
  setEditContent: (content: string) => void;
  handleStartEditing: (msg: ChatMessage) => void;
  handleSaveEdit: (id: string) => void;
  handleCancelEdit: () => void;
}

export function useChatEditing(
  onEditMessage: (id: string, text: string) => void
): UseChatEditingResult {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Keep a ref so handleSaveEdit has a stable identity regardless of editContent.
  const editContentRef = useRef(editContent);
  editContentRef.current = editContent;

  const handleStartEditing = useCallback((msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.text);
  }, []);

  const handleSaveEdit = useCallback(
    (id: string) => {
      if (editContentRef.current.trim()) {
        onEditMessage(id, editContentRef.current.trim());
        setEditingMessageId(null);
        setEditContent('');
      }
    },
    [onEditMessage]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditContent('');
  }, []);

  return {
    editingMessageId,
    editContent,
    setEditContent,
    handleStartEditing,
    handleSaveEdit,
    handleCancelEdit,
  };
}
