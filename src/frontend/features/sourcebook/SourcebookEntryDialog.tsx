// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the sourcebook entry dialog unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  Plus,
  Trash2,
  Save,
  Book,
  Tag,
  Type,
  Image as ImageIcon,
  User,
  MapPin,
  Users,
  Package,
  Calendar,
  BookOpen,
  HelpCircle,
  ImagePlus,
  Check,
  LoaderCircle,
  ChevronDown,
  ChevronRight,
  Undo,
  Redo,
  MessageSquareDiff,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useSearchHighlight } from '../search/SearchHighlightContext';
import { AppTheme, SourcebookEntry, SourcebookRelation } from '../../types';
import { SourcebookRelationDialog } from './SourcebookRelationDialog';
import { useConfirm } from '../layout/ConfirmDialogContext';
import { Link, Edit2 } from 'lucide-react'; // Using Lucide 'Link' icon for relations
import { ProjectImage, SourcebookUpsertPayload } from '../../services/apiTypes';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';
import { useThemeClasses } from '../layout/ThemeContext';
import { useFocusTrap } from '../layout/useFocusTrap';
import {
  SourcebookEntryHistoryState,
  useSourcebookEntryHistory,
} from './useSourcebookEntryHistory';
import { useSourcebookEntryData } from './useSourcebookEntryData';

const CATEGORY_DETAILS: Record<
  string,
  { icon: React.ElementType; description: string }
> = {
  Character: {
    icon: User,
    description: 'People, creatures, or specific individuals important to the story.',
  },
  Location: {
    icon: MapPin,
    description: 'Places, regions, buildings, maps, or distinct environments.',
  },
  Organization: {
    icon: Users,
    description: 'Groups, factions, governments, companies, or societies.',
  },
  Item: {
    icon: Package,
    description: 'Objects, artifacts, weapons, key items, or vehicles.',
  },
  Event: {
    icon: Calendar,
    description: 'Historical events, holidays, plot points, or timeline markers.',
  },
  Lore: {
    icon: BookOpen,
    description: 'History, myths, magic systems, laws, or cultural rules.',
  },
  Other: {
    icon: HelpCircle,
    description: "Anything that doesn't fit strictly into other categories.",
  },
};

interface SourcebookEntryDialogProps {
  entry?: SourcebookEntry | null;
  allEntries: SourcebookEntry[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: SourcebookUpsertPayload) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  theme?: AppTheme;
  language?: string;
  baselineEntry?: SourcebookEntry | null;
  /** When true and the dialog is opened for an existing entry that has no
   *  baseline counterpart, treat the entry as newly created by the AI and
   *  display all content as "added" (green).  Default: false (no diff for
   *  entries not in the baseline, e.g. when the user opens a recently
   *  created entry manually). */
  showDiffForNew?: boolean;
  /** App-level undo/redo so the dialog buttons reflect global history. */
  canAppUndo?: boolean;
  canAppRedo?: boolean;
  onAppUndo?: () => Promise<void>;
  onAppRedo?: () => Promise<void>;
}

export const SourcebookEntryDialog: React.FC<SourcebookEntryDialogProps> = ({
  entry,
  allEntries,
  isOpen,
  onClose,
  onSave,
  onDelete,
  theme = 'mixed',
  language = 'en',
  baselineEntry = null,
  showDiffForNew = false,
  canAppUndo = false,
  canAppRedo = false,
  onAppUndo,
  onAppRedo,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionBaseline, setDescriptionBaseline] = useState<string | undefined>(
    undefined
  );
  const [showDiff, setShowDiff] = useState(true);
  const [category, setCategory] = useState(Object.keys(CATEGORY_DETAILS)[0]);
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [newSynonym, setNewSynonym] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [relations, setRelations] = useState<SourcebookRelation[]>([]);
  const [isImagesExpanded, setIsImagesExpanded] = useState(true);
  const [isRelationsExpanded, setIsRelationsExpanded] = useState(true);
  const [isRelationDialogVisible, setIsRelationDialogVisible] = useState(false);
  const [editingRelationIndex, setEditingRelationIndex] = useState<number | null>(null);
  const relationNameMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    allEntries.forEach((e) => {
      map[e.id] = e.name;
    });
    return map;
  }, [allEntries]);

  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const { getRanges } = useSearchHighlight();
  const descriptionHighlightRanges = getRanges(
    'sourcebook',
    entry?.id ?? '',
    'description'
  );

  const entryDialogRef = useRef<HTMLDivElement>(null);
  const imagePickerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(isOpen, entryDialogRef, onClose);
  useFocusTrap(isImagePickerOpen, imagePickerRef, () => setIsImagePickerOpen(false));

  const { availableImages, selectedImagesList, keywords, isGeneratingKeywords } =
    useSourcebookEntryData({
      isOpen,
      isImagePickerOpen,
      images,
      keywordInputs: { name, description, synonyms },
      hasEntry: Boolean(entry),
      entryKeywords: entry?.keywords,
    });

  const [initialHistoryState, setInitialHistoryState] =
    useState<SourcebookEntryHistoryState>({
      name: '',
      description: '',
      category: Object.keys(CATEGORY_DETAILS)[0],
      synonyms: [],
      images: [],
      relations: [],
      keywords: [],
    });

  const currentHistoryState = useMemo(
    () => ({ name, description, category, synonyms, images, relations, keywords }),
    [name, description, category, synonyms, images, relations, keywords]
  );

  const { history, historyIndex, restoreSourcebookHistory } = useSourcebookEntryHistory(
    {
      initialState: initialHistoryState,
      currentState: currentHistoryState,
    }
  );

  useEffect(() => {
    const hasImages = (entry?.images?.length ?? 0) > 0;
    const hasRelations = (entry?.relations?.length ?? 0) > 0;

    const initialState: SourcebookEntryHistoryState = {
      name: entry?.name || '',
      description: entry?.description || '',
      category: entry?.category || Object.keys(CATEGORY_DETAILS)[0],
      synonyms: entry?.synonyms || [],
      images: entry?.images || [],
      relations: entry?.relations || [],
      keywords: entry?.keywords || [],
    };

    if (entry) {
      setName(initialState.name);
      setDescription(initialState.description);
      // Choose the baseline description for diff display:
      // • baselineEntry exists → use its description (covers AI updates)
      // • no baselineEntry but showDiffForNew is true → entry was AI-created;
      //   use '' so all content appears as "added" (green)
      // • no baselineEntry and showDiffForNew is false → user-opened entry,
      //   no diff needed
      const baseline =
        baselineEntry != null
          ? baselineEntry.description
          : showDiffForNew
            ? ''
            : undefined;
      setDescriptionBaseline(baseline);
      setCategory(initialState.category);
      setSynonyms(initialState.synonyms);
      setImages(initialState.images);
      setRelations(initialState.relations);
      setNewSynonym('');
      setShowKeywordsPanel(false);
    } else {
      setName('');
      setDescription('');
      setDescriptionBaseline(undefined);
      setCategory(Object.keys(CATEGORY_DETAILS)[0]);
      setSynonyms([]);
      setImages([]);
      setRelations([]);
      setNewSynonym('');
      setShowKeywordsPanel(false);
    }

    setInitialHistoryState(initialState);
    setIsImagesExpanded(hasImages);
    setIsRelationsExpanded(hasRelations);
  }, [entry?.id, isOpen]);
  const [showKeywordsPanel, setShowKeywordsPanel] = useState(false);

  // No automatic syncing; rely on parent to provide a fully-loaded entry.

  // Ensure the relations panel is expanded whenever relations are present.
  // This handles cases where relations arrive or update after the dialog opens.
  useEffect(() => {
    if (relations.length > 0) {
      setIsRelationsExpanded(true);
    }
  }, [relations]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        ...entry,
        name,
        description,
        category,
        synonyms,
        images,
        relations,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const addSynonym = () => {
    if (newSynonym.trim()) {
      setSynonyms([...synonyms, newSynonym.trim()]);
      setNewSynonym('');
    }
  };

  const removeSynonym = (idx: number) => {
    setSynonyms(synonyms.filter((_, i) => i !== idx));
  };

  const toggleImage = (filename: string) => {
    if (images.includes(filename)) {
      setImages(images.filter((i) => i !== filename));
    } else {
      setImages([...images, filename]);
    }
  };

  const {
    isLight,
    bg: bgClass,
    text: textClass,
    border: borderClass,
    input: inputBgClass,
    muted: labelClass,
    surface: descriptionSurfaceClass,
  } = useThemeClasses();
  const inputBorderClass = borderClass;
  const descriptionTextClass = isLight ? 'text-brand-gray-700' : 'text-brand-gray-300';
  const descriptionPlaceholderClass = isLight
    ? 'placeholder-brand-gray-400'
    : 'placeholder-brand-gray-500';

  const keywordsTooltip = isGeneratingKeywords
    ? '...generating...'
    : keywords.length > 0
      ? keywords.join(', ')
      : 'No keywords yet.';

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        role="none"
      >
        <div
          ref={entryDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sourcebook-entry-title"
          tabIndex={-1}
          className={`${bgClass} ${textClass} w-full max-w-[90vw] rounded-lg shadow-2xl border ${borderClass} flex flex-col max-h-[94vh]`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-6 py-4 border-b ${borderClass}`}
          >
            <div className="flex items-center gap-2">
              <Book
                size={20}
                className={isLight ? 'text-brand-700' : 'text-brand-400'}
              />
              <h2 id="sourcebook-entry-title" className="text-lg font-bold">
                {entry ? t('Edit Entry') : t('New Sourcebook Entry')}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (historyIndex > 0) {
                    restoreSourcebookHistory(historyIndex - 1, (snapshot) => {
                      setName(snapshot.name);
                      setDescription(snapshot.description);
                      setCategory(snapshot.category);
                      setSynonyms(snapshot.synonyms);
                      setImages(snapshot.images);
                      setRelations(snapshot.relations);
                    });
                  } else {
                    onAppUndo?.();
                  }
                }}
                disabled={historyIndex === 0 && !canAppUndo}
                aria-label={t('Undo sourcebook entry changes')}
                title={t('Undo')}
                className={`p-1 rounded-md transition-colors ${
                  isLight
                    ? 'hover:bg-brand-gray-100 text-brand-gray-500 disabled:opacity-40 disabled:cursor-not-allowed'
                    : 'hover:bg-brand-gray-800 text-brand-gray-400 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                <Undo size={18} />
              </button>
              <button
                onClick={() => {
                  if (historyIndex < history.length - 1) {
                    restoreSourcebookHistory(historyIndex + 1, (snapshot) => {
                      setName(snapshot.name);
                      setDescription(snapshot.description);
                      setCategory(snapshot.category);
                      setSynonyms(snapshot.synonyms);
                      setImages(snapshot.images);
                      setRelations(snapshot.relations);
                    });
                  } else {
                    onAppRedo?.();
                  }
                }}
                disabled={historyIndex >= history.length - 1 && !canAppRedo}
                aria-label={t('Redo sourcebook entry changes')}
                title={t('Redo')}
                className={`p-1 rounded-md transition-colors ${
                  isLight
                    ? 'hover:bg-brand-gray-100 text-brand-gray-500 disabled:opacity-40 disabled:cursor-not-allowed'
                    : 'hover:bg-brand-gray-800 text-brand-gray-400 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                <Redo size={18} />
              </button>
              <button
                onClick={() => setShowDiff(!showDiff)}
                aria-label={t('Toggle diff view')}
                aria-pressed={showDiff}
                title={showDiff ? t('Hide diff highlights') : t('Show diff highlights')}
                className={`p-1 rounded-md transition-colors ${
                  showDiff
                    ? isLight
                      ? 'text-brand-500 hover:text-brand-600'
                      : 'text-brand-400 hover:text-brand-300'
                    : isLight
                      ? 'text-brand-gray-400 hover:text-brand-gray-600'
                      : 'text-brand-gray-600 hover:text-brand-gray-400'
                }`}
              >
                <MessageSquareDiff size={18} />
              </button>
              <button
                onClick={onClose}
                aria-label={t('Close sourcebook entry')}
                className={`p-1 rounded-md transition-colors ${
                  isLight
                    ? 'hover:bg-brand-gray-100 text-brand-gray-500'
                    : 'hover:bg-brand-gray-800 text-brand-gray-400'
                }`}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Row: Name and Category */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}
                >
                  {t('Name')}
                </label>
                <div className="relative">
                  <Type
                    size={16}
                    className={`absolute left-3 top-3 ${isLight ? 'text-brand-gray-400' : 'text-brand-gray-600'}`}
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    lang={language}
                    spellCheck={true}
                    className={`w-full pl-10 pr-3 py-2 text-sm rounded-md border ${inputBorderClass} ${inputBgClass} focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors`}
                    placeholder={t('E.g. Captain Ahab')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}
                >
                  {t('Category')}
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {Object.entries(CATEGORY_DETAILS).map(([cat, details]) => {
                    const Icon = details.icon;
                    const isSelected = category === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        title={details.description}
                        className={`flex flex-col items-center justify-center p-2 rounded-md border transition-all ${
                          isSelected
                            ? 'bg-brand-500 text-white border-brand-600 ring-2 ring-brand-500/20'
                            : `${inputBgClass} ${inputBorderClass} hover:border-brand-500/50 opacity-70 hover:opacity-100`
                        }`}
                      >
                        <Icon size={20} className="mb-1" />
                        <span className="text-[10px] uppercase font-bold tracking-tight">
                          {cat}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p
                  className={`text-xs mt-1 min-h-[1.5em] ${isLight ? 'text-brand-700' : 'text-brand-300'}`}
                >
                  {CATEGORY_DETAILS[category]?.description}
                </p>
              </div>
            </div>

            {/* Middle Row: Synonyms */}
            <div className="space-y-2">
              <label
                className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}
              >
                {t('Synonyms & Nicknames')}
              </label>
              <div
                className={`p-3 rounded-md border ${inputBorderClass} ${inputBgClass} min-h-[60px]`}
              >
                <div className="flex flex-wrap gap-2 mb-2">
                  {synonyms.map((syn, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${
                        isLight
                          ? 'bg-brand-gray-100 border-brand-gray-200 text-brand-gray-800'
                          : 'bg-brand-gray-800 border-brand-gray-700 text-brand-gray-200'
                      }`}
                    >
                      {syn}
                      <button
                        onClick={() => removeSynonym(idx)}
                        className={'hover:text-red-500 transition-colors'}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <div className="flex-1 min-w-[120px] flex items-center">
                    <input
                      type="text"
                      value={newSynonym}
                      onChange={(e) => setNewSynonym(e.target.value)}
                      lang={language}
                      spellCheck={true}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSynonym();
                        }
                      }}
                      className="bg-transparent text-sm focus:outline-none w-full"
                      placeholder={t('Add (+)')}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Images Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <button
                  type="button"
                  onClick={() => setIsImagesExpanded((v) => !v)}
                  className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider focus:outline-none ${labelClass}`}
                >
                  <span>{t('Associated Images')}</span>
                  {!isImagesExpanded && selectedImagesList.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {selectedImagesList.length}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${isImagesExpanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setIsImagePickerOpen(true)}
                    variant="ghost"
                    size="sm"
                    theme={theme}
                    icon={<ImagePlus size={14} />}
                  >
                    {t('Manage Images')}
                  </Button>
                </div>
              </div>

              {isImagesExpanded && (
                <div
                  className={`p-3 rounded-md border min-h-[100px] ${inputBorderClass} ${inputBgClass}`}
                >
                  {selectedImagesList.length === 0 ? (
                    <div className="h-20 flex flex-col items-center justify-center text-gray-500 text-xs">
                      <ImageIcon size={20} className="mb-1 opacity-50" />
                      <span>{t('No images associated')}</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                      {selectedImagesList.map((img) => {
                        const tooltip = `${img.title || img.filename}\n${img.description || ''}`;
                        return (
                          <div
                            key={img.filename}
                            className="relative aspect-square rounded overflow-hidden border border-brand-500/20 group bg-gray-100 dark:bg-gray-800"
                            title={tooltip}
                          >
                            {img.is_placeholder ? (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <ImageIcon size={24} />
                              </div>
                            ) : (
                              <img
                                src={img.url}
                                alt={img.filename}
                                className="w-full h-full object-cover"
                              />
                            )}
                            <button
                              onClick={() => toggleImage(img.filename)}
                              className="absolute top-0 right-0 p-1 bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Relations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsRelationsExpanded((v) => !v)}
                  className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider focus:outline-none ${labelClass}`}
                >
                  <span>{t('Relations')}</span>
                  {!isRelationsExpanded && relations.length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {relations.length}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${isRelationsExpanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingRelationIndex(null);
                    setIsRelationDialogVisible(true);
                  }}
                  icon={<Plus size={14} />}
                  theme={theme}
                >
                  {t('Add Relation')}
                </Button>
              </div>

              {isRelationsExpanded &&
                (relations.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {relations.map((rel, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded-md border ${inputBorderClass} ${inputBgClass}`}
                      >
                        <div className="flex flex-col min-w-0 pr-4">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Link size={14} className="text-brand-500 flex-shrink-0" />
                            <span className="truncate">
                              {rel.direction === 'reverse' ? (
                                <>
                                  {relationNameMap[rel.target_id] || rel.target_id}{' '}
                                  <span className="opacity-70 font-normal">
                                    [{rel.relation}]
                                  </span>{' '}
                                  this
                                </>
                              ) : (
                                <>
                                  <span className="opacity-70 font-normal">
                                    [{rel.relation}]
                                  </span>{' '}
                                  {relationNameMap[rel.target_id] || rel.target_id}
                                </>
                              )}
                            </span>
                          </div>
                          {(rel.start_chapter ||
                            rel.end_chapter ||
                            rel.start_book ||
                            rel.end_book) && (
                            <div className="text-xs opacity-60 mt-1 truncate">
                              {rel.start_chapter ? `Start: ${rel.start_chapter}` : ''}
                              {rel.start_book ? ` (${rel.start_book})` : ''}
                              {(rel.start_chapter || rel.start_book) &&
                              (rel.end_chapter || rel.end_book)
                                ? ' | '
                                : ''}
                              {rel.end_chapter ? `End: ${rel.end_chapter}` : ''}
                              {rel.end_book ? ` (${rel.end_book})` : ''}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingRelationIndex(idx);
                              setIsRelationDialogVisible(true);
                            }}
                            className={
                              'p-1 rounded-md hover:bg-brand-500/10 text-brand-500 transition-colors'
                            }
                            title="Edit relation"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setRelations(relations.filter((_, i) => i !== idx));
                            }}
                            className={
                              'p-1 rounded-md hover:bg-red-500/10 text-red-500 transition-colors'
                            }
                            title="Remove relation"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`text-sm opacity-60 italic p-3 rounded-md border border-dashed ${inputBorderClass}`}
                  >
                    {t('No relations to other entries yet.')}
                  </div>
                ))}
            </div>

            {/* Description */}
            <div className="space-y-2 flex-1 flex flex-col min-h-[320px]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label
                    className={`text-xs font-semibold uppercase tracking-wider ${labelClass}`}
                  >
                    {t('Description & Facts')}
                  </label>
                  <p className={`text-xs leading-relaxed ${labelClass}`}>
                    {t(
                      'Describe the details the models should remember. CHAT uses this for planning and consistency, while WRITING and EDITING receive relevant entries as read-only context.'
                    )}
                  </p>
                </div>
                <div className="relative inline-block group">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold tracking-wide cursor-pointer ${labelClass} ${borderClass}`}
                    aria-label={keywordsTooltip}
                    onClick={() => setShowKeywordsPanel((v) => !v)}
                    aria-expanded={showKeywordsPanel}
                  >
                    <Tag size={12} />
                    {t('Keywords')}
                  </button>

                  <div
                    className={`absolute right-0 z-10 mt-2 min-w-[calc(100vw-2rem)] sm:min-w-[50vw] max-w-[90vw] rounded-lg border ${borderClass} ${
                      isLight
                        ? 'bg-white/95 text-brand-gray-900'
                        : 'bg-brand-gray-950/95 text-brand-gray-100'
                    } shadow-lg p-3 text-xs transition-opacity duration-150 ${
                      showKeywordsPanel
                        ? 'opacity-100 pointer-events-auto'
                        : 'opacity-0 pointer-events-none'
                    } group-hover:opacity-100 group-hover:pointer-events-auto`}
                  >
                    {isGeneratingKeywords ? (
                      <div className="italic opacity-70">{t('Generating...')}</div>
                    ) : keywords.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {keywords.map((kw) => (
                          <span
                            key={kw}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                              isLight
                                ? 'bg-brand-gray-100 border-brand-gray-200 text-brand-gray-800'
                                : 'bg-brand-gray-800 border-brand-gray-700 text-brand-gray-200'
                            }`}
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="italic opacity-60">{t('No keywords yet.')}</div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`rounded-md border ${inputBorderClass} ${descriptionSurfaceClass} ${descriptionTextClass} flex-1 min-h-[220px] overflow-y-auto`}
              >
                <CodeMirrorEditor
                  value={description}
                  onChange={(val) => {
                    setDescriptionBaseline(val);
                    setDescription(val);
                  }}
                  baselineValue={descriptionBaseline}
                  showDiff={showDiff}
                  searchHighlightRanges={descriptionHighlightRanges}
                  language={language}
                  spellCheck={true}
                  mode="markdown"
                  className={`w-full h-full p-4 text-sm bg-transparent ${descriptionTextClass}`}
                  placeholder={t(
                    'Detailed description, personality traits, history, rules, and constraints the AI should remember...'
                  )}
                  style={{ minHeight: '220px' }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className={`flex justify-between items-center px-6 py-4 border-t ${borderClass} bg-opacity-50 ${isLight ? 'bg-brand-gray-50' : 'bg-black/20'}`}
          >
            <div>
              {entry && onDelete && (
                <Button
                  onClick={async () => {
                    if (
                      await confirm(t('Are you sure you want to delete this entry?'))
                    ) {
                      await onDelete(entry.id);
                      onClose();
                    }
                  }}
                  variant="danger"
                  size="sm"
                  theme={theme}
                  icon={<Trash2 size={16} />}
                >
                  {t('Delete')}
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button onClick={onClose} variant="ghost" theme={theme}>
                {t('Cancel')}
              </Button>
              <Button
                onClick={handleSave}
                theme={theme}
                disabled={!name.trim() || isSaving}
                icon={
                  isSaving ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <Save size={16} />
                  )
                }
              >
                {isSaving ? t('Saving...') : t('Save Entry')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Picker Modal */}
      {isImagePickerOpen && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200"
          role="none"
        >
          <div
            ref={imagePickerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-picker-title"
            tabIndex={-1}
            className={`${bgClass} ${textClass} w-full max-w-4xl rounded-lg shadow-2xl border ${borderClass} flex flex-col max-h-[85vh]`}
          >
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${borderClass}`}
            >
              <div className="flex items-center gap-2">
                <ImagePlus size={20} className="text-brand-500" />
                <h3 id="image-picker-title" className="text-lg font-bold">
                  {t('Select Images')}
                </h3>
              </div>
              <button
                onClick={() => setIsImagePickerOpen(false)}
                aria-label={t('Close image picker')}
              >
                <X size={20} className="text-gray-500 hover:text-gray-300" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {availableImages.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  {t('No images found in project.')}
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {availableImages.map((img) => {
                    const isSelected = images.includes(img.filename);
                    const tooltip = `${img.title || img.filename}\n${img.description || ''}`;
                    return (
                      <button
                        key={img.filename}
                        type="button"
                        onClick={() => toggleImage(img.filename)}
                        title={tooltip}
                        aria-label={`Toggle ${img.title || img.filename} selection`}
                        aria-pressed={isSelected}
                        className={`group relative aspect-square cursor-pointer rounded-lg overflow-hidden border-2 transition-all bg-gray-100 dark:bg-gray-800 ${
                          isSelected
                            ? 'border-brand-500 ring-2 ring-brand-500/20'
                            : 'border-transparent hover:border-brand-500/30'
                        }`}
                      >
                        {img.is_placeholder ? (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <ImageIcon size={28} />
                          </div>
                        ) : (
                          <img
                            src={img.url}
                            alt={img.filename}
                            className="w-full h-full object-cover"
                          />
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center animate-in zoom-in-50 duration-200">
                            <div className="bg-brand-500 text-white rounded-full p-1 shadow-md">
                              <Check size={16} />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className={`px-6 py-4 border-t ${borderClass} flex justify-between items-center`}
            >
              <span className="text-sm opacity-70">
                {t('{{count}} images selected', { count: images.length })}
              </span>
              <Button
                onClick={() => setIsImagePickerOpen(false)}
                theme={theme}
                icon={<Check size={16} />}
              >
                {t('Done')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <SourcebookRelationDialog
        isOpen={isRelationDialogVisible}
        onClose={() => setIsRelationDialogVisible(false)}
        onSave={(rel) => {
          if (editingRelationIndex !== null) {
            const newRels = [...relations];
            newRels[editingRelationIndex] = rel;
            setRelations(newRels);
          } else {
            setRelations([...relations, rel]);
          }
        }}
        currentEntryId={entry?.id}
        currentEntryName={name}
        theme={theme}
        initialRelation={
          editingRelationIndex !== null ? relations[editingRelationIndex] : undefined
        }
      />
    </>,
    document.body
  );
};
