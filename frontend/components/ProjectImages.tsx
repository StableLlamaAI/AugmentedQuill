// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Wand2,
  Save,
  X,
  FileImage,
  RefreshCw,
  Loader2,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { generateSimpleContent } from '../services/openaiService';
import { AppTheme, AppSettings } from '../types';
import { Button } from './Button';

interface ImageEntry {
  filename: string;
  url: string | null;
  description: string;
  title?: string;
  is_placeholder: boolean;
}

interface ProjectImagesProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
  settings: AppSettings;
  prompts?: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
}

export const ProjectImages: React.FC<ProjectImagesProps> = ({
  isOpen,
  onClose,
  theme = 'mixed',
  settings,
  prompts,
}) => {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [edits, setEdits] = useState<
    Record<string, { description?: string; title?: string }>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageEntry | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<string | null>(null);

  const isLight = theme === 'light';
  const bgClass = isLight ? 'bg-white' : 'bg-brand-gray-900';
  const textClass = isLight ? 'text-brand-gray-900' : 'text-brand-gray-100';
  const borderClass = isLight ? 'border-brand-gray-200' : 'border-brand-gray-700';
  const cardBg = isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-800';

  useEffect(() => {
    if (isOpen) {
      loadImages();
    }
  }, [isOpen]);

  const loadImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.projects.listImages();
      setImages(res.images || []);
      setEdits({});
    } catch (err: any) {
      setError(err.message || 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleMetadataChange = (
    filename: string,
    field: 'description' | 'title',
    val: string
  ) => {
    setEdits((prev) => ({
      ...prev,
      [filename]: {
        ...prev[filename],
        [field]: val,
      },
    }));
  };

  const handleSaveMetadata = async (filename: string) => {
    const edit = edits[filename];
    if (!edit) return;

    // Find original to fallback
    const original = images.find((i) => i.filename === filename);
    if (!original) return;

    const newDesc =
      edit.description !== undefined ? edit.description : original.description;
    const newTitle = edit.title !== undefined ? edit.title : original.title;

    try {
      await api.projects.updateImage(filename, newDesc, newTitle);
      // Update local state
      setImages((prev) =>
        prev.map((img) =>
          img.filename === filename
            ? { ...img, description: newDesc, title: newTitle }
            : img
        )
      );
      setEdits((prev) => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
    } catch (err: any) {
      setError('Failed to save metadata: ' + err.message);
    }
  };

  const handleGenerateDescription = async (img: ImageEntry) => {
    if (generating) return;
    setGenerating(img.filename);
    setError(null);
    try {
      const activeProvider = settings.providers.find(
        (p) => p.id === settings.activeChatProviderId
      );
      if (!activeProvider) throw new Error('No active chat provider configured');

      const promptTemplate = prompts?.user_prompts?.image_describer_prompt || '';
      const system = prompts?.system_messages?.image_describer || '';

      if (!promptTemplate || !system) {
        throw new Error('Prompts not loaded');
      }

      const prompt = promptTemplate.replace(/{filename}/g, img.filename);

      const result = await generateSimpleContent(
        prompt,
        system,
        activeProvider,
        'CHAT'
      );

      if (result) {
        handleMetadataChange(img.filename, 'description', result);
      }
    } catch (err: any) {
      setError('Generation failed: ' + err.message);
    } finally {
      setGenerating(null);
    }
  };

  const handleUploadClick = (targetName?: string) => {
    setReplaceTarget(targetName || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleUploadFile = async (file: File, replaceTargetName: string | null) => {
    try {
      if (replaceTargetName) {
        // User requested to replace 'replaceTargetName' with 'file'.
        // If filenames match, we overwrite.
        // If they differ, we upload new, migrate metadata, delete old.
        if (file.name === replaceTargetName) {
          await api.projects.uploadImage(file, replaceTargetName);
        } else {
          const res = await api.projects.uploadImage(file);
          const newFilename = res.filename;

          const oldImage = images.find((i) => i.filename === replaceTargetName);
          if (oldImage) {
            await api.projects.updateImage(
              newFilename,
              oldImage.description,
              oldImage.title
            );
          }
          await api.projects.deleteImage(replaceTargetName);
        }
      } else {
        await api.projects.uploadImage(file);
      }
      await loadImages();
      setReplaceTarget(null);
    } catch (err: any) {
      setError('Upload failed: ' + err.message);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUploadFile(file, replaceTarget);
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;
    try {
      await api.projects.deleteImage(filename);
      setImages((prev) => prev.filter((i) => i.filename !== filename));
    } catch (err: any) {
      setError('Delete failed: ' + err.message);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleCardDrop = async (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragTarget(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        await handleUploadFile(file, targetName);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        // Drag and drop is always a new upload, not a replace
        await handleUploadFile(file, null);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-[90vw] max-h-[90vh] flex flex-col rounded-lg shadow-xl ${bgClass} ${textClass} border ${borderClass} relative overflow-hidden`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-brand-blue-500/20 backdrop-blur-sm border-4 border-brand-blue-500 border-dashed m-4 rounded-lg flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center p-8 bg-white/90 dark:bg-black/80 rounded-xl shadow-2xl animate-bounce">
              <Upload className="w-12 h-12 text-brand-blue-500 mb-2" />
              <span className="text-xl font-bold text-brand-blue-600">Drop image</span>
              <span className="text-sm text-brand-blue-400 mt-2">
                Drop on background for new, on card to replace
              </span>
            </div>
          </div>
        )}

        <div
          className={`flex items-center justify-between p-4 border-b ${borderClass}`}
        >
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Project Images
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/10 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end mb-4">
            <Button
              variant="primary"
              onClick={() => handleUploadClick()}
              icon={<Upload className="w-4 h-4" />}
            >
              Upload New Image
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-brand-blue-500" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-10 opacity-50">
              No images in this project.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {images.map((img) => (
                <div
                  key={img.filename}
                  className={`rounded-lg p-3 ${cardBg} flex flex-col gap-3 transition-all duration-200 relative ${
                    dragTarget === img.filename
                      ? 'border-4 border-dashed border-brand-blue-500 bg-brand-blue-50 dark:bg-brand-blue-900/20 z-10'
                      : `border ${borderClass} hover:border-brand-gray-300 dark:hover:border-brand-gray-600`
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragTarget(img.filename);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    // Only clear if we're actually leaving the container, not entering a child
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragTarget(null);
                    }
                  }}
                  onDrop={(e) => handleCardDrop(e, img.filename)}
                >
                  {dragTarget === img.filename && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-brand-blue-500/10 backdrop-blur-[1px] rounded-lg pointer-events-none">
                      <div className="bg-white/90 dark:bg-black/90 px-4 py-2 rounded-lg shadow-lg text-brand-blue-600 font-bold flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Replace Image
                      </div>
                    </div>
                  )}
                  <div className="relative aspect-video bg-black/5 rounded overflow-hidden flex items-center justify-center group">
                    {img.is_placeholder || !img.url ? (
                      <div className="text-center p-4">
                        <FileImage className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <span className="text-xs opacity-50 uppercase tracking-widest">
                          Placeholder
                        </span>
                        <div className="text-sm font-medium mt-1">{img.filename}</div>
                      </div>
                    ) : (
                      <div
                        className="w-full h-full cursor-zoom-in"
                        onClick={() => setSelectedImage(img)}
                      >
                        <img
                          src={img.url!}
                          alt={img.filename}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="pointer-events-auto">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleUploadClick(img.filename)}
                          icon={<RefreshCw className="w-3 h-3" />}
                        >
                          Replace
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs opacity-70 min-h-[24px]">
                      <span
                        className="font-mono truncate max-w-[150px]"
                        title={img.filename}
                      >
                        {img.filename}
                      </span>
                      <div className="flex items-center gap-1">
                        {generating === img.filename && (
                          <Loader2 className="w-3 h-3 animate-spin text-brand-blue-500" />
                        )}
                        <button
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-brand-gray-400 hover:text-red-500 rounded transition-colors"
                          onClick={() => handleDelete(img.filename)}
                          title="Delete image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <input
                      className={`w-full text-sm p-2 rounded border ${borderClass} bg-transparent focus:ring-1 ring-brand-blue-500 outline-none font-bold`}
                      placeholder="Title"
                      value={
                        edits[img.filename]?.title !== undefined
                          ? edits[img.filename].title
                          : img.title || ''
                      }
                      onChange={(e) =>
                        handleMetadataChange(img.filename, 'title', e.target.value)
                      }
                    />
                    <textarea
                      className={`w-full text-sm p-2 rounded border ${borderClass} bg-transparent resize-y min-h-[80px] focus:ring-1 ring-brand-blue-500 outline-none`}
                      placeholder="Image description..."
                      value={
                        edits[img.filename]?.description !== undefined
                          ? edits[img.filename].description
                          : img.description
                      }
                      onChange={(e) =>
                        handleMetadataChange(
                          img.filename,
                          'description',
                          e.target.value
                        )
                      }
                      disabled={generating === img.filename}
                    />
                    <div className="flex justify-between items-center gap-2">
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-brand-purple-500 hover:text-brand-purple-600"
                        onClick={() => handleGenerateDescription(img)}
                        disabled={!!generating}
                        icon={<Wand2 className="w-3 h-3" />}
                      >
                        {img.description
                          ? 'Update description'
                          : 'Generate description'}
                      </Button>

                      {edits[img.filename] &&
                        (edits[img.filename].description !== undefined ||
                          edits[img.filename].title !== undefined) && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleSaveMetadata(img.filename)}
                            icon={<Save className="w-3 h-3" />}
                          >
                            Save
                          </Button>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/png, image/jpeg, image/gif, image/webp"
          onChange={handleFileChange}
        />
      </div>

      {selectedImage && selectedImage.url && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-50 p-2"
            onClick={() => setSelectedImage(null)}
          >
            <X size={32} />
          </button>

          <div
            className="relative max-w-full max-h-full flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedImage.url}
              alt={selectedImage.filename}
              className="max-w-[90vw] max-h-[90vh] object-contain shadow-2xl rounded-sm"
            />
            <div className="mt-4 text-white/90 text-center font-medium bg-white/10 px-6 py-2 rounded-full backdrop-blur-sm shadow-lg border border-white/10">
              {selectedImage.filename}
              {selectedImage.description && (
                <span className="block text-xs font-normal text-white/70 mt-1 max-w-md truncate">
                  {selectedImage.description}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
