// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import React, {
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  useState,
} from 'react';
import { Chapter, EditorSettings, ViewMode } from '../types';
import {
  Sparkles,
  Loader2,
  SplitSquareHorizontal,
  RefreshCw,
  PenLine,
  Wand2,
  FileEdit,
  BookOpen,
  Image as ImageIcon,
  Trash2,
  X,
  Upload,
} from 'lucide-react';
import { api } from '../services/api';
import { Button } from './Button';
// @ts-ignore
import { marked } from 'marked';
// @ts-ignore
import TurndownService from 'turndown';

interface EditorProps {
  chapter: Chapter;
  settings: EditorSettings;
  viewMode: ViewMode;
  showWhitespace?: boolean;
  onToggleShowWhitespace?: () => void;
  onChange: (id: string, updates: Partial<Chapter>) => void;
  continuations: string[];
  isSuggesting: boolean;
  onTriggerSuggestions: () => void;
  onAcceptContinuation: (text: string) => void;
  isSuggestionMode: boolean;
  onKeyboardSuggestionAction: (
    action: 'trigger' | 'chooseLeft' | 'chooseRight' | 'regenerate' | 'undo' | 'exit',
    cursor?: number
  ) => void;
  onAiAction: (
    target: 'summary' | 'chapter',
    action: 'update' | 'rewrite' | 'extend'
  ) => void;
  isAiLoading: boolean;
  isSummaryOpen: boolean;
  onToggleSummary: () => void;
  onContextChange?: (formats: string[]) => void;
}

// Internal component for auto-growing plain text editing
const PlainTextEditable = React.forwardRef<HTMLDivElement, any>(
  (
    {
      value,
      onChange,
      className,
      onKeyDown,
      onSelect,
      placeholder,
      style,
      showWhitespace = false,
      ...props
    },
    ref
  ) => {
    const elementRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => elementRef.current);

    // Sync external value to innerText only if significantly different to avoid cursor jumps
    useEffect(() => {
      const display = showWhitespace
        ? (value || '')
            .replace(/\t/g, '→\t')
            .replace(/ /g, '·\u200b')
            .replace(/\r?\n/g, '¶\n')
        : value || '';
      if (elementRef.current && elementRef.current.innerText !== display) {
        elementRef.current.innerText = display;
      }
    }, [value, showWhitespace]);

    const onPaste = (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      // insert raw text; onInput handler will convert display when needed
      document.execCommand('insertText', false, text);
    };

    const fromDisplay = (s: string) => {
      return s
        .replace(/·\u200b?/g, ' ')
        .replace(/→\t/g, '\t')
        .replace(/¶\n/g, '\n');
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      const displayed = e.currentTarget.innerText;
      const raw = showWhitespace ? fromDisplay(displayed) : displayed;
      onChange(raw);
    };

    return (
      <div
        ref={elementRef}
        contentEditable
        className={`${className} empty:before:content-[attr(data-placeholder)] empty:before:text-inherit empty:before:opacity-40 outline-none`}
        onInput={handleInput}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        onMouseUp={onSelect}
        onKeyUp={onSelect}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        spellCheck={false}
        style={style}
        {...props}
      />
    );
  }
);

export const Editor = React.forwardRef<any, EditorProps>(
  (
    {
      chapter,
      settings,
      viewMode,
      showWhitespace,
      onToggleShowWhitespace,
      onChange,
      continuations,
      isSuggesting,
      onTriggerSuggestions,
      onAcceptContinuation,
      isSuggestionMode,
      onKeyboardSuggestionAction,
      onAiAction,
      isAiLoading,
      isSummaryOpen,
      onToggleSummary,
      onContextChange,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLDivElement>(null);
    const wysiwygRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isImageManagerOpen, setIsImageManagerOpen] = useState(false);
    const [projectImages, setProjectImages] = useState<
      {
        filename: string;
        url: string | null;
        description?: string;
        title?: string;
        is_placeholder?: boolean;
      }[]
    >([]);
    const [editingImage, setEditingImage] = useState<{
      filename: string;
      title: string;
      description: string;
    } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
      if (isImageManagerOpen) {
        api.projects
          .listImages()
          .then((res) => setProjectImages(res.images || []))
          .catch(console.error);
      }
    }, [isImageManagerOpen]);

    const handleUpdateMetadata = async () => {
      if (!editingImage) return;
      try {
        await api.projects.updateImage(
          editingImage.filename,
          editingImage.description,
          editingImage.title
        );
        setEditingImage(null);
        const res = await api.projects.listImages();
        setProjectImages(res.images || []);
      } catch (e) {
        alert('Failed to update image');
      }
    };

    const handleCreatePlaceholder = async () => {
      const title = prompt('Enter placeholder title:');
      if (!title) return;
      try {
        await api.projects.createImagePlaceholder('', title);
        const res = await api.projects.listImages();
        setProjectImages(res.images || []);
      } catch (e) {
        alert('Failed to create placeholder');
      }
    };

    const handleImageUpload = async (file: File) => {
      try {
        const res = await api.projects.uploadImage(file);
        if (res.ok) {
          insertImageMarkdown(res.filename, res.url);
          if (isImageManagerOpen) {
            const list = await api.projects.listImages();
            setProjectImages(list.images || []);
          }
        }
      } catch (e) {
        console.error(e);
        alert('Failed to upload image');
      }
    };

    const insertImageMarkdown = (filename: string, url: string) => {
      if (viewMode === 'wysiwyg') {
        const html = `<img src="${url}" alt="${filename}" />`;
        if (wysiwygRef.current && wysiwygRef.current.contains(document.activeElement)) {
          document.execCommand('insertHTML', false, html);
          wysiwygRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const markdown = `\n![${filename}](${url})`;
          onChange(chapter.id, { content: chapter.content + markdown });
        }
      } else {
        const markdown = `![${filename}](${url})`;
        if (document.activeElement === textareaRef.current) {
          document.execCommand('insertText', false, markdown);
        } else {
          onChange(chapter.id, { content: chapter.content + '\n' + markdown });
        }
      }
      setIsImageManagerOpen(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          await handleImageUpload(file);
        }
      }
    };

    const turndownService = useRef<any>(null);
    if (!turndownService.current) {
      turndownService.current = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
      });
    }

    // Handle WYSIWYG Content Sync
    useEffect(() => {
      if (viewMode === 'wysiwyg' && wysiwygRef.current) {
        if (document.activeElement !== wysiwygRef.current) {
          wysiwygRef.current.innerHTML = marked.parse(chapter.content) as string;
        }
      }
    }, [chapter.content, viewMode, chapter.id]);

    const handleWysiwygInput = () => {
      if (wysiwygRef.current) {
        const html = wysiwygRef.current.innerHTML;
        const md = turndownService.current.turndown(html);
        if (md !== chapter.content) {
          onChange(chapter.id, { content: md });
        }
        checkContext();
      }
    };

    // Check Formatting Context (Sticky Buttons)
    const checkContext = () => {
      if (!onContextChange) return;

      const formats: string[] = [];
      const isWysiwyg = viewMode === 'wysiwyg';
      const el = isWysiwyg ? null : textareaRef.current;

      if (isWysiwyg) {
        if (document.queryCommandState('bold')) formats.push('bold');
        if (document.queryCommandState('italic')) formats.push('italic');
        if (document.queryCommandState('insertUnorderedList')) formats.push('ul');
        if (document.queryCommandState('insertOrderedList')) formats.push('ol');
        const formatBlock = document.queryCommandValue('formatBlock');
        if (formatBlock === 'h1') formats.push('h1');
        if (formatBlock === 'h2') formats.push('h2');
        if (formatBlock === 'h3') formats.push('h3');
        if (formatBlock === 'blockquote') formats.push('quote');
      } else if (el) {
        // Markdown / Raw Context Detection using Selection API on the Div
        const selection = window.getSelection();
        if (
          selection &&
          selection.rangeCount > 0 &&
          el.contains(selection.anchorNode)
        ) {
          const text = el.innerText;
          // Basic naive check (improving this would require mapping selection offset to text index)
          // For now, we just pass empty or implement simple regex if needed.
        }
      }
      onContextChange(formats);
    };

    const getCaretOffset = (root: HTMLElement | null): number | null => {
      if (!root) return null;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer)) return null;
      const preRange = range.cloneRange();
      preRange.selectNodeContents(root);
      preRange.setEnd(range.startContainer, range.startOffset);
      return preRange.toString().length;
    };

    const getEditorCaretOffset = useCallback((): number | null => {
      if (viewMode === 'raw' || viewMode === 'markdown') {
        return getCaretOffset(textareaRef.current);
      }
      if (viewMode === 'wysiwyg') {
        // Mapping a WYSIWYG DOM selection to markdown offsets is non-trivial.
        // For now, only allow trigger when selection is inside the wysiwyg editor;
        // insertion happens at end-of-content semantics in the parent.
        const inside =
          !!wysiwygRef.current &&
          !!window.getSelection()?.anchorNode &&
          wysiwygRef.current.contains(window.getSelection()!.anchorNode);
        return inside ? chapter.content.length : null;
      }
      return null;
    }, [viewMode, chapter.content.length]);

    const maybeHandleSuggestionHotkey = useCallback(
      (e: KeyboardEvent | React.KeyboardEvent) => {
        const key = 'key' in e ? e.key : '';
        const ctrlKey = 'ctrlKey' in e ? e.ctrlKey : false;
        const metaKey = 'metaKey' in e ? e.metaKey : false;

        const suggestionActive =
          isSuggestionMode || continuations.length > 0 || isSuggesting;

        // Trigger: Ctrl+Enter / Cmd+Enter
        if (key === 'Enter' && (ctrlKey || metaKey)) {
          const cursor = getEditorCaretOffset() ?? chapter.content.length;
          e.preventDefault();
          // @ts-ignore - stopPropagation exists on both KeyboardEvent and React synthetic events
          e.stopPropagation?.();
          onKeyboardSuggestionAction('trigger', cursor);
          return true;
        }

        if (!suggestionActive) return false;

        if (key === 'ArrowLeft') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseLeft');
          return true;
        }
        if (key === 'ArrowRight') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('chooseRight');
          return true;
        }
        if (key === 'ArrowDown') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('regenerate');
          return true;
        }
        if (key === 'ArrowUp') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('undo');
          return true;
        }
        if (key === 'Escape') {
          e.preventDefault();
          // @ts-ignore
          e.stopPropagation?.();
          onKeyboardSuggestionAction('exit');
          return true;
        }
        return false;
      },
      [
        isSuggestionMode,
        continuations.length,
        isSuggesting,
        onKeyboardSuggestionAction,
        getEditorCaretOffset,
      ]
    );

    useEffect(() => {
      // Capture global keydown so the shortcuts work even if focus moved away
      // (e.g. footer button, scroll container).
      const onKeyDown = (e: KeyboardEvent) => {
        maybeHandleSuggestionHotkey(e);
      };
      window.addEventListener('keydown', onKeyDown, { capture: true });
      return () =>
        window.removeEventListener('keydown', onKeyDown, {
          capture: true,
        } as any);
    }, [maybeHandleSuggestionHotkey]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (maybeHandleSuggestionHotkey(e)) return;

      // Basic Enter handling to prevent div insertion, ensuring clean newlines
      if (e.key === 'Enter') {
        // Let the browser handle simple newlines in plain text mode usually,
        // but sometimes browsers wrap in <div>. We'll leave default for now as it's robust enough for "Raw".
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setTimeout(checkContext, 0);
      }
    };

    const format = (type: string) => {
      if (viewMode === 'wysiwyg') {
        wysiwygRef.current?.focus();
        switch (type) {
          case 'bold':
            document.execCommand('bold');
            break;
          case 'italic':
            document.execCommand('italic');
            break;
          case 'h1':
            document.execCommand('formatBlock', false, 'H1');
            break;
          case 'h2':
            document.execCommand('formatBlock', false, 'H2');
            break;
          case 'h3':
            document.execCommand('formatBlock', false, 'H3');
            break;
          case 'quote':
            document.execCommand('formatBlock', false, 'BLOCKQUOTE');
            break;
          case 'ul':
            document.execCommand('insertUnorderedList');
            break;
          case 'ol':
            document.execCommand('insertOrderedList');
            break;
          case 'link':
            const url = prompt('Enter URL:');
            if (url) document.execCommand('createLink', false, url);
            break;
          case 'image':
            const src = prompt('Enter Image URL:');
            if (src) document.execCommand('insertImage', false, src);
            break;
        }
        handleWysiwygInput();
      } else {
        // Raw mode formatting insertion
        if (!textareaRef.current) return;
        const el = textareaRef.current;
        el.focus();

        let prefix = '';
        let suffix = '';

        switch (type) {
          case 'bold':
            prefix = '**';
            suffix = '**';
            break;
          case 'italic':
            prefix = '_';
            suffix = '_';
            break;
          case 'h1':
            prefix = '# ';
            break;
          case 'h2':
            prefix = '## ';
            break;
          case 'h3':
            prefix = '### ';
            break;
          case 'quote':
            prefix = '> ';
            break;
          case 'ul':
            prefix = '- ';
            break;
          case 'ol':
            prefix = '1. ';
            break;
          case 'link':
            prefix = '[';
            suffix = '](url)';
            break;
          case 'image':
            prefix = '![';
            suffix = '](url)';
            break;
        }

        document.execCommand('insertText', false, prefix + suffix);

        onChange(chapter.id, { content: el.innerText });
      }
    };

    useImperativeHandle(ref, () => ({
      openImageManager: () => setIsImageManagerOpen(true),
      focus: () => {
        if (viewMode === 'wysiwyg') wysiwygRef.current?.focus();
        else textareaRef.current?.focus();
      },
      format: (type: string) => format(type),
    }));

    // Styles & Theme Logic
    let pageBackgroundColor: string;
    let textColor: string;
    let editorContainerBg: string;

    if (settings.theme === 'dark') {
      const b = settings.brightness * 20; // range 10-20% lightness
      pageBackgroundColor = `hsl(24, 10%, ${b}%)`;
      textColor = `rgba(231, 229, 228, ${settings.contrast})`;
      editorContainerBg = 'bg-brand-gray-950';
    } else {
      pageBackgroundColor = `hsl(38, 25%, ${settings.brightness * 100}%)`;
      textColor = `rgba(20, 15, 10, ${settings.contrast})`;
      editorContainerBg =
        settings.theme === 'light' ? 'bg-brand-gray-100' : 'bg-brand-gray-950';
    }

    const isMonospace = viewMode === 'raw';
    const fontFamily = isMonospace
      ? '"JetBrains Mono", "Fira Code", monospace'
      : 'Merriweather, serif';
    const titleFontFamily = 'Merriweather, serif'; // Always serif for title

    const commonTextStyle: React.CSSProperties = {
      fontFamily: 'inherit',
      fontSize: 'inherit',
      lineHeight: '1.6',
      padding: '0px',
      margin: '0',
      border: 'none',
      width: '100%',
      boxSizing: 'border-box',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
    };

    const toolbarBg =
      settings.theme === 'light'
        ? 'bg-brand-gray-50 border-b border-brand-gray-200 shadow-sm'
        : 'bg-brand-gray-900 border-b border-brand-gray-800 shadow-sm';
    const summaryBg =
      settings.theme === 'light'
        ? 'bg-brand-gray-50 border-b border-brand-gray-200'
        : 'bg-brand-gray-900 border-b border-brand-gray-800';
    const inputBg =
      settings.theme === 'light'
        ? 'bg-brand-gray-50 border-brand-gray-300 text-brand-gray-900'
        : 'bg-brand-gray-950 border-brand-gray-800 text-brand-gray-300';
    const textMuted =
      settings.theme === 'light' ? 'text-brand-gray-500' : 'text-brand-gray-500';
    const footerBg =
      settings.theme === 'light'
        ? 'bg-brand-gray-50 border-t border-brand-gray-200'
        : 'bg-brand-gray-900 border-t border-brand-gray-800';

    return (
      <div
        className={`flex flex-col h-full w-full overflow-hidden relative ${editorContainerBg}`}
      >
        {/* Mobile Toolbar */}
        <div className={`flex-none z-20 xl:hidden ${toolbarBg}`}>
          <div className="h-14 flex items-center justify-between px-4">
            <div className="flex items-center space-x-3">
              <Button
                theme={settings.theme}
                variant={isSummaryOpen ? 'primary' : 'secondary'}
                size="sm"
                onClick={onToggleSummary}
                icon={<BookOpen size={14} />}
                className="text-xs"
              >
                {isSummaryOpen ? 'Hide Summary' : 'Edit Summary'}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`flex items-center rounded-md p-1 space-x-1 ${
                  settings.theme === 'light' ? 'bg-brand-gray-100' : 'bg-brand-gray-800'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase px-2 ${textMuted}`}>
                  Chapter AI
                </span>
                <div
                  className={`w-px h-4 ${
                    settings.theme === 'light'
                      ? 'bg-brand-gray-300'
                      : 'bg-brand-gray-700'
                  }`}
                ></div>
                <Button
                  theme={settings.theme}
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => onAiAction('chapter', 'extend')}
                  disabled={isAiLoading}
                  icon={<Wand2 size={12} />}
                  title="Extend Chapter (WRITING model)"
                >
                  Extend
                </Button>
                <Button
                  theme={settings.theme}
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => onAiAction('chapter', 'rewrite')}
                  disabled={isAiLoading}
                  icon={<FileEdit size={12} />}
                  title="Rewrite Chapter (WRITING model)"
                >
                  Rewrite
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Summary Panel */}
        {isSummaryOpen && (
          <div
            className={`flex-none p-4 animate-in slide-in-from-top-2 z-10 shadow-lg ${summaryBg}`}
          >
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-2">
                <label
                  className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}
                >
                  Chapter Summary
                </label>
                <div className="flex space-x-2">
                  <Button
                    theme={settings.theme}
                    size="sm"
                    variant="secondary"
                    className="text-xs h-6 py-0 px-2"
                    onClick={() => onAiAction('summary', 'update')}
                    disabled={isAiLoading}
                    icon={<RefreshCw size={10} />}
                    title="Update Summary (EDITING model)"
                  >
                    AI Update
                  </Button>
                  <Button
                    theme={settings.theme}
                    size="sm"
                    variant="secondary"
                    className="text-xs h-6 py-0 px-2"
                    onClick={() => onAiAction('summary', 'rewrite')}
                    disabled={isAiLoading}
                    icon={<PenLine size={10} />}
                    title="Rewrite Summary (EDITING model)"
                  >
                    AI Rewrite
                  </Button>
                </div>
              </div>
              <textarea
                value={chapter.summary}
                onChange={(e) => onChange(chapter.id, { summary: e.target.value })}
                className={`w-full text-sm font-sans rounded p-3 focus:outline-none resize-y min-h-[80px] border ${inputBg} focus:border-brand-500`}
                placeholder="Write a brief summary of this chapter (used by AI for context)..."
              />
            </div>
          </div>
        )}

        {/* Main Scrollable Content Area */}
        <div
          className="flex-1 overflow-y-auto px-4 py-6 md:py-8 flex flex-col items-center relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-blue-500/10 z-50 flex items-center justify-center border-4 border-blue-500 border-dashed m-4 rounded-xl pointer-events-none">
              <div className="bg-white dark:bg-gray-800 p-4 rounded shadow-lg flex flex-col items-center">
                <Upload className="w-8 h-8 mb-2 text-blue-500" />
                <span className="font-bold text-blue-500">Drop image to upload</span>
              </div>
            </div>
          )}
          {/* The Paper - Grows infinitely */}
          <div
            className="relative w-full shadow-2xl transition duration-300 ease-in-out px-4 py-8 md:px-12 md:py-16 mx-auto flex flex-col flex-none"
            style={{
              maxWidth: `${settings.maxWidth}ch`,
              backgroundColor: pageBackgroundColor,
              color: textColor,
              fontSize: `${settings.fontSize}px`,
              fontFamily: fontFamily,
              // At least fill the available scroll area height, but always grow with content.
              minHeight: '100%',
            }}
          >
            {/* Toolbar - Removed Image Icon here */}
            {/* Title Input */}
            <PlainTextEditable
              value={chapter.title}
              onChange={(val: string) => onChange(chapter.id, { title: val })}
              className="w-full bg-transparent font-serif font-bold mb-8 border-b-2 border-transparent focus:border-brand-gray-400/50 transition-colors block"
              placeholder="Chapter Title"
              style={{
                ...commonTextStyle,
                fontSize: '1.8em',
                lineHeight: '1.3',
                fontFamily: titleFontFamily,
              }}
            />

            {/* Editor Area */}
            <div id="editor-area" className="flex flex-col relative w-full">
              {/* WYSIWYG View */}
              <div
                id="wysiwyg-editor"
                ref={wysiwygRef}
                contentEditable
                onInput={handleWysiwygInput}
                onMouseUp={checkContext}
                onKeyDown={handleKeyDown}
                onKeyUp={(e) => {
                  checkContext();
                }}
                className={`prose-editor outline-none w-full ${
                  viewMode === 'wysiwyg' ? 'block' : 'hidden'
                }`}
                style={{ ...commonTextStyle }}
              />

              {/* Raw / Markdown View */}
              {(viewMode === 'raw' || viewMode === 'markdown') && (
                <div id="raw-markdown-editor" className="relative w-full flex flex-col">
                  <PlainTextEditable
                    ref={textareaRef}
                    value={chapter.content}
                    onChange={(val: string) => {
                      onChange(chapter.id, { content: val });
                      checkContext();
                    }}
                    onSelect={checkContext}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-transparent text-inherit outline-none"
                    placeholder="Start writing your chapter here..."
                    showWhitespace={showWhitespace}
                    style={{
                      ...commonTextStyle,
                      color: showWhitespace ? 'inherit' : 'inherit',
                      caretColor: textColor,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 h-16 w-full"></div>
        </div>

        {/* Persistent Footer */}
        <div
          className={`flex-shrink-0 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] ${footerBg}`}
        >
          {continuations.length > 0 ? (
            <div className="p-4 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center space-x-2 text-brand-500">
                  <SplitSquareHorizontal size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Choose a continuation
                  </span>
                </div>
                <button
                  onClick={() => onAcceptContinuation('')}
                  className={`${textMuted} hover:text-brand-gray-800 text-xs`}
                >
                  Dismiss
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                {continuations.map((option, idx) => (
                  <div
                    key={idx}
                    onClick={() => onAcceptContinuation(option)}
                    className={`group relative p-5 rounded-lg border cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                      settings.theme === 'light'
                        ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 hover:border-brand-300'
                        : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-750 hover:border-brand-500/50'
                    }`}
                  >
                    <div
                      className={`font-serif text-sm leading-relaxed ${
                        settings.theme === 'light'
                          ? 'text-brand-gray-800'
                          : 'text-brand-gray-300 group-hover:text-brand-gray-200'
                      }`}
                    >
                      {option}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 flex justify-center items-center space-x-3">
              <button
                onClick={onTriggerSuggestions}
                disabled={isSuggesting || isAiLoading}
                className={`group flex items-center space-x-3 px-6 py-3 rounded-full border transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  settings.theme === 'light'
                    ? 'bg-brand-gray-50 border-brand-gray-200 hover:bg-brand-gray-50 text-brand-gray-600'
                    : 'bg-brand-gray-800 border-brand-gray-700 hover:bg-brand-gray-700 hover:border-brand-500/30 text-brand-gray-300'
                }`}
                title="Get AI Suggestions (WRITING model)"
              >
                {isSuggesting || isAiLoading ? (
                  <>
                    <Loader2 className="animate-spin text-violet-500" size={18} />
                    <span className="font-medium text-sm text-violet-600 dark:text-violet-400">
                      Working...
                    </span>
                  </>
                ) : (
                  <>
                    <div className="bg-violet-100 dark:bg-violet-900/30 p-1 rounded-md text-violet-600 dark:text-violet-400">
                      <Sparkles size={16} />
                    </div>
                    <span className="font-medium text-sm">Suggest next paragraph</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
        {isImageManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
              className={`rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border ${
                settings.theme === 'light'
                  ? 'bg-white border-brand-gray-200'
                  : 'bg-brand-gray-900 border-brand-gray-800'
              }`}
            >
              {editingImage ? (
                <div className="p-6 flex flex-col gap-4">
                  <h3
                    className={`text-lg font-bold ${
                      settings.theme === 'light'
                        ? 'text-brand-gray-800'
                        : 'text-brand-gray-100'
                    }`}
                  >
                    Edit Image Metadata
                  </h3>
                  <div>
                    <label
                      className={`block text-xs font-semibold uppercase mb-1 ${textMuted}`}
                    >
                      Title
                    </label>
                    <input
                      className={`w-full p-2 rounded border focus:outline-none focus:ring-2 focus:ring-violet-500 ${inputBg}`}
                      value={editingImage.title}
                      onChange={(e) =>
                        setEditingImage({
                          ...editingImage,
                          title: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label
                      className={`block text-xs font-semibold uppercase mb-1 ${textMuted}`}
                    >
                      Description (for AI)
                    </label>
                    <textarea
                      className={`w-full p-2 rounded border focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[100px] ${inputBg}`}
                      value={editingImage.description}
                      onChange={(e) =>
                        setEditingImage({
                          ...editingImage,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="secondary" onClick={() => setEditingImage(null)}>
                      Cancel
                    </Button>
                    <Button variant="primary" onClick={handleUpdateMetadata}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={`flex justify-between items-center p-4 border-b ${
                      settings.theme === 'light'
                        ? 'border-brand-gray-100 text-brand-gray-800'
                        : 'border-brand-gray-800 text-brand-gray-100'
                    }`}
                  >
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <ImageIcon size={20} /> Image Manager
                    </h3>
                    <button
                      onClick={() => setIsImageManagerOpen(false)}
                      className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div
                    className={`p-4 border-b grid grid-cols-2 gap-2 ${
                      settings.theme === 'light'
                        ? 'border-brand-gray-100 bg-brand-gray-50'
                        : 'border-brand-gray-800 bg-brand-gray-800/50'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={(e) =>
                        e.target.files?.[0] && handleImageUpload(e.target.files[0])
                      }
                      accept="image/*"
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                      variant="primary"
                    >
                      <Upload size={16} className="mr-2" /> Upload Image
                    </Button>
                    <Button
                      onClick={handleCreatePlaceholder}
                      className="w-full"
                      variant="secondary"
                    >
                      <FileEdit size={16} className="mr-2" /> Create Placeholder
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {projectImages.length === 0 ? (
                      <div className="text-center py-12 text-brand-gray-400">
                        <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No images in this project yet.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {projectImages.map((img) => (
                          <div
                            key={img.filename}
                            className={`group relative border rounded-lg overflow-hidden aspect-square flex flex-col ${
                              settings.theme === 'light'
                                ? 'bg-brand-gray-100 border-brand-gray-200'
                                : 'bg-brand-gray-950 border-brand-gray-700'
                            }`}
                          >
                            {img.is_placeholder || !img.url ? (
                              <div className="flex-1 flex flex-col items-center justify-center p-4 bg-violet-900/10 text-violet-500">
                                <ImageIcon size={32} className="mb-2 opacity-50" />
                                <span className="text-xs font-mono opacity-70">
                                  Placeholder
                                </span>
                              </div>
                            ) : (
                              <img
                                src={img.url}
                                alt={img.filename}
                                className="w-full h-full object-cover"
                              />
                            )}

                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                              <div className="text-white font-serif text-sm truncate font-bold mb-1">
                                {img.title || 'Untitled'}
                              </div>
                              <div className="text-white/70 text-xs truncate mb-2">
                                {img.filename}
                              </div>

                              <div className="flex gap-2 justify-center">
                                <button
                                  onClick={() =>
                                    img.url &&
                                    insertImageMarkdown(img.filename, img.url)
                                  }
                                  disabled={!img.url}
                                  className="p-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded shadow-sm"
                                  title="Insert"
                                >
                                  <Upload size={14} className="rotate-180" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingImage({
                                      filename: img.filename,
                                      title: img.title || '',
                                      description: img.description || '',
                                    });
                                  }}
                                  className="p-1.5 bg-violet-500 hover:bg-violet-600 text-white rounded shadow-sm"
                                  title="Edit Info"
                                >
                                  <PenLine size={14} />
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm('Delete this image/placeholder?'))
                                      return;
                                    try {
                                      await api.projects.deleteImage(img.filename);
                                      setProjectImages((prev) =>
                                        prev.filter((p) => p.filename !== img.filename)
                                      );
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }}
                                  className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded shadow-sm"
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

Editor.displayName = 'Editor';
