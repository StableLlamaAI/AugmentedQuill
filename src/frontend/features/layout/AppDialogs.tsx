// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the app dialogs unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { RefObject } from 'react';

import { AppTheme, StoryState } from '../../types';
import { EditorHandle } from '../editor/Editor';

type SettingsDialogProps = React.ComponentProps<
  typeof import('../settings/SettingsDialog').SettingsDialog
>;
type ProjectImagesProps = React.ComponentProps<
  typeof import('../projects/ProjectImages').ProjectImages
>;

const SettingsDialogLazy = React.lazy(
  async (): Promise<{ default: React.FC<SettingsDialogProps> }> => ({
    default: (await import('../settings/SettingsDialog')).SettingsDialog,
  })
);

const ProjectImagesLazy = React.lazy(
  async (): Promise<{ default: React.FC<ProjectImagesProps> }> => ({
    default: (await import('../projects/ProjectImages')).ProjectImages,
  })
);

const CreateProjectDialogLazy = React.lazy(
  async (): Promise<{ default: React.FC<CreateProjectDialogProps> }> => ({
    default: (await import('../projects/CreateProjectDialog')).CreateProjectDialog,
  })
);

type SettingsValue = SettingsDialogProps['settings'];
type PromptsValue = SettingsDialogProps['defaultPrompts'];
type ProjectsValue = SettingsDialogProps['projects'];

type AppDialogsProps = {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  appSettings: SettingsValue;
  setAppSettings: SettingsDialogProps['onSaveSettings'];
  projects: ProjectsValue;
  story: StoryState;
  handleLoadProject: SettingsDialogProps['onLoadProject'];
  handleCreateProject: SettingsDialogProps['onCreateProject'];
  handleImportProject: SettingsDialogProps['onImportProject'];
  handleDeleteProject: SettingsDialogProps['onDeleteProject'];
  handleRenameProject: SettingsDialogProps['onRenameProject'];
  handleConvertProject: SettingsDialogProps['onConvertProject'];
  refreshProjects: SettingsDialogProps['onRefreshProjects'];
  currentTheme: AppTheme;
  prompts: PromptsValue;
  instructionLanguages: string[];

  isImagesOpen: boolean;
  setIsImagesOpen: (v: boolean) => void;
  updateStoryImageSettings: React.ComponentProps<
    typeof import('../projects/ProjectImages').ProjectImages
  >['onUpdateSettings'];
  imageActionsAvailable: boolean;
  recordHistoryEntry?: ProjectImagesProps['onRecordHistory'];
  editorRef: RefObject<EditorHandle | null>;

  isCreateProjectOpen: boolean;
  setIsCreateProjectOpen: (v: boolean) => void;
  handleCreateProjectConfirm: (
    name: string,
    type: 'short-story' | 'novel' | 'series',
    language?: string
  ) => Promise<void> | void;
};

export const AppDialogs: React.FC<AppDialogsProps> = ({
  isSettingsOpen,
  setIsSettingsOpen,
  appSettings,
  setAppSettings,
  projects,
  story,
  handleLoadProject,
  handleCreateProject,
  handleImportProject,
  handleDeleteProject,
  handleRenameProject,
  handleConvertProject,
  refreshProjects,
  currentTheme,
  prompts,
  instructionLanguages,
  isImagesOpen,
  setIsImagesOpen,
  updateStoryImageSettings,
  imageActionsAvailable,
  recordHistoryEntry,
  editorRef,
  isCreateProjectOpen,
  setIsCreateProjectOpen,
  handleCreateProjectConfirm,
}: AppDialogsProps) => {
  return (
    <React.Suspense fallback={null}>
      {isSettingsOpen && (
        <SettingsDialogLazy
          isOpen={isSettingsOpen}
          onClose={(): void => setIsSettingsOpen(false)}
          settings={appSettings}
          onSaveSettings={setAppSettings}
          projects={projects}
          activeProjectId={story.id}
          onLoadProject={handleLoadProject}
          onCreateProject={handleCreateProject}
          onImportProject={handleImportProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onConvertProject={handleConvertProject}
          onRefreshProjects={refreshProjects}
          activeProjectType={story.projectType}
          activeProjectStats={{
            chapterCount: story.chapters.length,
            bookCount: story.books?.length || 0,
          }}
          theme={currentTheme}
          defaultPrompts={prompts}
          projectLanguages={instructionLanguages}
        />
      )}

      {isImagesOpen && (
        <ProjectImagesLazy
          isOpen={isImagesOpen}
          projectLanguage={story.language || 'en'}
          onClose={(): void => setIsImagesOpen(false)}
          theme={currentTheme}
          settings={appSettings}
          prompts={prompts}
          imageActionsAvailable={imageActionsAvailable}
          onRecordHistory={recordHistoryEntry}
          imageStyle={story.image_style}
          imageAdditionalInfo={story.image_additional_info}
          onUpdateSettings={updateStoryImageSettings}
          onInsert={(
            filename: string,
            url: string | null,
            altText: string | undefined
          ): void => {
            if (url && editorRef.current) {
              editorRef.current.insertImage(filename, url, altText);
              setIsImagesOpen(false);
            }
          }}
        />
      )}

      {isCreateProjectOpen && (
        <CreateProjectDialogLazy
          isOpen={isCreateProjectOpen}
          onClose={(): void => setIsCreateProjectOpen(false)}
          languages={instructionLanguages}
          onCreate={(
            name: string,
            type: string,
            language: string
          ): void | Promise<void> =>
            handleCreateProjectConfirm(
              name,
              type as 'short-story' | 'novel' | 'series',
              language
            )
          }
          theme={currentTheme}
        />
      )}
    </React.Suspense>
  );
};
