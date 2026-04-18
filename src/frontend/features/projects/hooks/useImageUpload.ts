// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Purpose: Encapsulate image upload, replace, delete, and placeholder operations for ProjectImages.
 */

import { useRef, useState } from 'react';
import { api } from '../../../services/api';

interface ImageEntry {
  filename: string;
  url: string | null;
  description: string;
  title?: string;
  is_placeholder: boolean;
}

export interface UseImageUploadArgs {
  images: ImageEntry[];
  loadImages: () => Promise<void>;
  getErrorMessage: (error: unknown, fallback: string) => string;
  setError: (msg: string | null) => void;
  onRecordHistory?: (entry: {
    label: string;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
  }) => void;
  confirm: (message: string) => Promise<boolean>;
}

export function useImageUpload({
  images,
  loadImages,
  getErrorMessage,
  setError,
  onRecordHistory,
  confirm,
}: UseImageUploadArgs) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

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
        if (file.name === replaceTargetName) {
          const replaced = await api.projects.uploadImage(file, replaceTargetName);
          let previousRestoreId = replaced.restore_id || '';
          onRecordHistory?.({
            label: `Replace image: ${replaceTargetName}`,
            onUndo: async () => {
              if (previousRestoreId) {
                await api.projects.restoreImage(previousRestoreId);
                await loadImages();
              }
            },
            onRedo: async () => {
              const redoReplace = await api.projects.uploadImage(
                file,
                replaceTargetName
              );
              previousRestoreId = redoReplace.restore_id || previousRestoreId;
              await loadImages();
            },
          });
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
          const deletedOld = await api.projects.deleteImage(replaceTargetName);
          let oldRestoreId = deletedOld.restore_id || '';
          let newRestoreId = '';
          onRecordHistory?.({
            label: `Replace image: ${replaceTargetName}`,
            onUndo: async () => {
              const deletedNew = await api.projects.deleteImage(newFilename);
              newRestoreId = deletedNew.restore_id || newRestoreId;
              if (oldRestoreId) {
                await api.projects.restoreImage(oldRestoreId);
              }
              await loadImages();
            },
            onRedo: async () => {
              if (!newRestoreId) return;
              const deletedOldAgain = await api.projects.deleteImage(replaceTargetName);
              oldRestoreId = deletedOldAgain.restore_id || oldRestoreId;
              await api.projects.restoreImage(newRestoreId);
              await loadImages();
            },
          });
        }
      } else {
        const uploaded = await api.projects.uploadImage(file);
        let uploadedRestoreId = '';
        onRecordHistory?.({
          label: `Upload image: ${uploaded.filename}`,
          onUndo: async () => {
            const deleted = await api.projects.deleteImage(uploaded.filename);
            uploadedRestoreId = deleted.restore_id || '';
            await loadImages();
          },
          onRedo: async () => {
            if (uploadedRestoreId) {
              await api.projects.restoreImage(uploadedRestoreId);
              await loadImages();
            }
          },
        });
      }
      await loadImages();
      setReplaceTarget(null);
    } catch (err: unknown) {
      setError('Upload failed: ' + getErrorMessage(err, 'Unknown error'));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUploadFile(file, replaceTarget);
  };

  const handleDelete = async (filename: string) => {
    if (!(await confirm('Are you sure you want to delete this image?'))) return;
    try {
      const deleted = await api.projects.deleteImage(filename);
      let latestRestoreId = deleted.restore_id || '';
      onRecordHistory?.({
        label: `Delete image: ${filename}`,
        onUndo: async () => {
          if (latestRestoreId) {
            await api.projects.restoreImage(latestRestoreId);
            await loadImages();
          }
        },
        onRedo: async () => {
          const redoDelete = await api.projects.deleteImage(filename);
          latestRestoreId = redoDelete.restore_id || latestRestoreId;
          await loadImages();
        },
      });
      await loadImages();
    } catch (err: unknown) {
      setError('Delete failed: ' + getErrorMessage(err, 'Unknown error'));
    }
  };

  const handleCreatePlaceholder = async () => {
    try {
      const created = await api.projects.createImagePlaceholder('', '');
      await loadImages();
      let restoreId = '';
      onRecordHistory?.({
        label: `Create image placeholder: ${created.filename}`,
        onUndo: async () => {
          const deleted = await api.projects.deleteImage(created.filename);
          restoreId = deleted.restore_id || '';
          await loadImages();
        },
        onRedo: async () => {
          if (restoreId) {
            await api.projects.restoreImage(restoreId);
          } else {
            await api.projects.updateImage(
              created.filename,
              '',
              'Untitled Placeholder'
            );
          }
          await loadImages();
        },
      });
    } catch (e: unknown) {
      setError('Failed to create placeholder: ' + getErrorMessage(e, 'Unknown error'));
    }
  };

  return {
    fileInputRef,
    replaceTarget,
    handleUploadClick,
    handleUploadFile,
    handleFileChange,
    handleDelete,
    handleCreatePlaceholder,
  };
}
