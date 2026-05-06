// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Move sourcebook entry dialog data fetching and derived UI data into
 * a dedicated hook so the dialog component stays presentation-focused.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ProjectImage } from '../../services/apiTypes';

type KeywordInputs = {
  name: string;
  description: string;
  synonyms: string[];
};

export interface UseSourcebookEntryDataResult {
  availableImages: ProjectImage[];
  selectedImagesList: ProjectImage[];
  keywords: string[];
  isGeneratingKeywords: boolean;
}

interface UseSourcebookEntryDataParams {
  isOpen: boolean;
  isImagePickerOpen: boolean;
  images: string[];
  keywordInputs: KeywordInputs;
  hasEntry: boolean;
  entryKeywords?: string[];
}

export const useSourcebookEntryData = ({
  isOpen,
  isImagePickerOpen,
  images,
  keywordInputs,
  hasEntry,
  entryKeywords,
}: UseSourcebookEntryDataParams): UseSourcebookEntryDataResult => {
  const [availableImages, setAvailableImages] = useState<ProjectImage[]>([]);
  const [keywords, setKeywords] = useState<string[]>(entryKeywords || []);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);

  const lastGeneratedInputs = useRef<KeywordInputs | null>(null);

  useEffect((): void => {
    if (!isOpen) return;
    api.projects
      .listImages()
      .then((data: import('../../services/apiTypes').ListImagesResponse): void => {
        setAvailableImages(data.images || []);
      })
      .catch(console.error);
  }, [isOpen]);

  useEffect((): void => {
    if (!isOpen || !isImagePickerOpen) return;
    if (availableImages.length > 0) return;

    api.projects
      .listImages()
      .then((data: import('../../services/apiTypes').ListImagesResponse): void => {
        setAvailableImages(data.images || []);
      })
      .catch(console.error);
  }, [isOpen, isImagePickerOpen, availableImages.length]);

  useEffect((): void => {
    if (hasEntry) {
      setKeywords(entryKeywords || []);
      lastGeneratedInputs.current = {
        name: keywordInputs.name,
        description: keywordInputs.description,
        synonyms: keywordInputs.synonyms,
      };
    } else {
      setKeywords([]);
      lastGeneratedInputs.current = null;
    }
  }, [
    hasEntry,
    entryKeywords,
    isOpen,
    keywordInputs.name,
    keywordInputs.description,
    keywordInputs.synonyms,
  ]);

  useEffect((): (() => void) => {
    const isValid = Boolean(
      keywordInputs.name.trim() && keywordInputs.description.trim()
    );
    const last = lastGeneratedInputs.current;
    const inputsMatch =
      last &&
      last.name === keywordInputs.name &&
      last.description === keywordInputs.description &&
      JSON.stringify(last.synonyms) === JSON.stringify(keywordInputs.synonyms);

    if (!isValid || inputsMatch) {
      if (!isValid) {
        setIsGeneratingKeywords(false);
      }
      return (): void => {
        /* noop cleanup */
      };
    }

    setIsGeneratingKeywords(true);
    const handle = window.setTimeout(async (): Promise<void> => {
      try {
        const res = await api.sourcebook.generateKeywords({
          name: keywordInputs.name,
          description: keywordInputs.description,
          synonyms: keywordInputs.synonyms,
        });

        setKeywords(res.keywords || []);
        lastGeneratedInputs.current = {
          name: keywordInputs.name,
          description: keywordInputs.description,
          synonyms: keywordInputs.synonyms,
        };
      } catch {
        // Fail quietly; UI will simply keep showing a placeholder state.
      } finally {
        setIsGeneratingKeywords(false);
      }
    }, 500);

    return (): void => clearTimeout(handle);
  }, [keywordInputs.name, keywordInputs.description, keywordInputs.synonyms]);

  const selectedImagesList = useMemo(
    () =>
      availableImages.filter((img: ProjectImage): boolean =>
        images.includes(img.filename)
      ),
    [availableImages, images]
  );

  return {
    availableImages,
    selectedImagesList,
    keywords,
    isGeneratingKeywords,
  };
};
