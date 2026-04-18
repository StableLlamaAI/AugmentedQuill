// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Isolate sourcebook entry dialog state and behavior from the UI shell.
 */

import { useEffect, useMemo, useState } from 'react';
import { SourcebookEntry, SourcebookRelation } from '../../types';
import { SourcebookUpsertPayload } from '../../services/apiTypes';
import { useSearchHighlight } from '../search/SearchHighlightContext';
import {
  SourcebookEntryHistoryState,
  useSourcebookEntryHistory,
} from './useSourcebookEntryHistory';
import { useSourcebookEntryData } from './useSourcebookEntryData';

const CATEGORY_KEYS = [
  'Character',
  'Location',
  'Organization',
  'Item',
  'Event',
  'Lore',
  'Other',
] as const;

const DEFAULT_CATEGORY = CATEGORY_KEYS[0];
const EMPTY_ENTRY_STATE: SourcebookEntryHistoryState = {
  name: '',
  description: '',
  category: DEFAULT_CATEGORY,
  synonyms: [],
  images: [],
  relations: [],
  keywords: [],
};

const buildEntryHistoryState = (
  entry?: SourcebookEntry | null
): SourcebookEntryHistoryState => ({
  name: entry?.name || '',
  description: entry?.description || '',
  category: entry?.category || DEFAULT_CATEGORY,
  synonyms: entry?.synonyms || [],
  images: entry?.images || [],
  relations: entry?.relations || [],
  keywords: entry?.keywords || [],
});

const resolveDescriptionBaseline = (
  entry: SourcebookEntry | null | undefined,
  baselineEntry: SourcebookEntry | null | undefined,
  showDiffForNew: boolean
): string | undefined => {
  if (!entry) {
    return undefined;
  }
  if (baselineEntry != null) {
    return baselineEntry.description;
  }
  return showDiffForNew ? '' : undefined;
};

interface UseSourcebookEntryDialogStateParams {
  entry?: SourcebookEntry | null;
  allEntries: SourcebookEntry[];
  isOpen: boolean;
  baselineEntry?: SourcebookEntry | null;
  showDiffForNew: boolean;
  onSave: (entry: SourcebookUpsertPayload) => Promise<void>;
  onClose: () => void;
}

export const useSourcebookEntryDialogState = ({
  entry,
  allEntries,
  isOpen,
  baselineEntry,
  showDiffForNew,
  onSave,
  onClose,
}: UseSourcebookEntryDialogStateParams) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionBaseline, setDescriptionBaseline] = useState<string | undefined>(
    undefined
  );
  const [showDiff, setShowDiff] = useState(true);
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [newSynonym, setNewSynonym] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [relations, setRelations] = useState<SourcebookRelation[]>([]);
  const [isImagesExpanded, setIsImagesExpanded] = useState(true);
  const [isRelationsExpanded, setIsRelationsExpanded] = useState(true);
  const [isRelationDialogVisible, setIsRelationDialogVisible] = useState(false);
  const [editingRelationIndex, setEditingRelationIndex] = useState<number | null>(null);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [showKeywordsPanel, setShowKeywordsPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const relationNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allEntries.forEach((item) => {
      map[item.id] = item.name;
    });
    return map;
  }, [allEntries]);

  const { getRanges } = useSearchHighlight();
  const descriptionHighlightRanges = getRanges(
    'sourcebook',
    entry?.id ?? '',
    'description'
  );

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
    useState<SourcebookEntryHistoryState>(EMPTY_ENTRY_STATE);

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
    const initialState = buildEntryHistoryState(entry);

    setName(initialState.name);
    setDescription(initialState.description);
    setDescriptionBaseline(
      resolveDescriptionBaseline(entry, baselineEntry, showDiffForNew)
    );
    setCategory(initialState.category);
    setSynonyms(initialState.synonyms);
    setImages(initialState.images);
    setRelations(initialState.relations);

    setNewSynonym('');
    setShowKeywordsPanel(false);
    setInitialHistoryState(initialState);
    setIsImagesExpanded(initialState.images.length > 0);
    setIsRelationsExpanded(initialState.relations.length > 0);
  }, [entry?.id, isOpen, baselineEntry, showDiffForNew]);

  useEffect(() => {
    if (relations.length > 0) {
      setIsRelationsExpanded(true);
    }
  }, [relations]);

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
    if (!newSynonym.trim()) {
      return;
    }

    setSynonyms([...synonyms, newSynonym.trim()]);
    setNewSynonym('');
  };

  const removeSynonym = (index: number) => {
    setSynonyms(synonyms.filter((_, currentIndex) => currentIndex !== index));
  };

  const toggleImage = (filename: string) => {
    if (images.includes(filename)) {
      setImages(images.filter((value) => value !== filename));
      return;
    }

    setImages([...images, filename]);
  };

  const restoreFromHistory = (index: number) => {
    restoreSourcebookHistory(index, (snapshot) => {
      setName(snapshot.name);
      setDescription(snapshot.description);
      setCategory(snapshot.category);
      setSynonyms(snapshot.synonyms);
      setImages(snapshot.images);
      setRelations(snapshot.relations);
    });
  };

  return {
    name,
    description,
    descriptionBaseline,
    showDiff,
    category,
    synonyms,
    newSynonym,
    images,
    relations,
    isImagesExpanded,
    isRelationsExpanded,
    isRelationDialogVisible,
    editingRelationIndex,
    isImagePickerOpen,
    showKeywordsPanel,
    isSaving,
    relationNameMap,
    descriptionHighlightRanges,
    availableImages,
    selectedImagesList,
    keywords,
    isGeneratingKeywords,
    history,
    historyIndex,
    setName,
    setDescription,
    setDescriptionBaseline,
    setShowDiff,
    setCategory,
    setSynonyms,
    setNewSynonym,
    setImages,
    setRelations,
    setIsImagesExpanded,
    setIsRelationsExpanded,
    setIsRelationDialogVisible,
    setEditingRelationIndex,
    setIsImagePickerOpen,
    setShowKeywordsPanel,
    handleSave,
    addSynonym,
    removeSynonym,
    toggleImage,
    restoreFromHistory,
  };
};
