// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the settings dialog unit so this responsibility stays isolated, testable, and easy to evolve.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../layout/useFocusTrap';
import {
  Settings,
  X,
  HardDrive,
  Cpu,
  Info,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import {
  ProjectMetadata,
  AppSettings,
  AppTheme,
  DEFAULT_LLM_CONFIG,
} from '../../types';
import { Button } from '../../components/ui/Button';
import { SettingsProjects } from './settings/SettingsProjects';
import SettingsMachine from './settings/SettingsMachine';
import { useThemeClasses } from '../layout/ThemeContext';
import { normalizeProviderPrompts } from './providerAdapter';
import { useSettingsDialogMachine } from './useSettingsDialogMachine';

const GUI_LANGUAGE_OPTIONS: Array<{ code: string; labelKey: string }> = [
  { code: '', labelKey: 'System Default' },
  { code: 'en', labelKey: 'English' },
  { code: 'de', labelKey: 'German' },
  { code: 'fr', labelKey: 'French' },
  { code: 'es', labelKey: 'Spanish' },
];

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  projects: ProjectMetadata[];
  activeProjectId: string;
  onLoadProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string, newLang?: string) => void;
  onConvertProject: (newType: string) => void;
  onImportProject: (file: File) => Promise<void>;
  onRefreshProjects: () => void;
  activeProjectType?: 'short-story' | 'novel' | 'series';
  activeProjectStats?: {
    chapterCount: number;
    bookCount: number;
  };
  theme: AppTheme;
  defaultPrompts?: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  projectLanguages: string[];
}

type SettingsTabId = 'general' | 'projects' | 'machine' | 'about';

interface SettingsTabButtonProps {
  id: SettingsTabId;
  icon: React.ReactNode;
  label: string;
  activeTab: SettingsTabId;
  isLight: boolean;
  onSelectTab: (id: SettingsTabId) => void;
}

const SettingsTabButton: React.FC<SettingsTabButtonProps> = ({
  id,
  icon,
  label,
  activeTab,
  isLight,
  onSelectTab,
}: SettingsTabButtonProps) => (
  <button
    onClick={(): void => onSelectTab(id)}
    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 md:flex-none ${
      activeTab === id
        ? isLight
          ? 'bg-brand-600 text-white border border-brand-500'
          : 'bg-brand-gray-800 text-brand-gray-200 border border-brand-gray-700'
        : isLight
          ? 'text-brand-gray-600 hover:text-brand-gray-900 hover:bg-brand-gray-100'
          : 'text-brand-gray-400 hover:text-brand-gray-300 hover:bg-brand-gray-900'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface GeneralSettingsTabProps {
  isLight: boolean;
  guiLanguage: string | undefined;
  onChangeGuiLanguage: (language: string) => void;
  t: (key: string) => string;
}

const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  isLight,
  guiLanguage,
  onChangeGuiLanguage,
  t,
}: GeneralSettingsTabProps) => (
  <div className="flex flex-col space-y-6">
    <div>
      <h3
        className={`text-xl font-semibold mb-4 border-b pb-2 ${
          isLight
            ? 'text-brand-gray-900 border-brand-gray-200'
            : 'text-brand-gray-100 border-brand-gray-800'
        }`}
      >
        {t('General Settings')}
      </h3>
      <div className="space-y-4">
        <div className="w-full md:w-1/2 lg:w-1/3">
          <label
            htmlFor="guiLanguage"
            className="block text-sm font-medium text-brand-gray-500 uppercase mb-1"
          >
            {t('GUI Language')}
          </label>
          <select
            id="guiLanguage"
            value={guiLanguage || ''}
            onChange={(
              e: React.ChangeEvent<HTMLSelectElement, HTMLSelectElement>
            ): void => onChangeGuiLanguage(e.target.value)}
            className={`w-full px-3 py-2 text-sm rounded ${
              isLight
                ? 'bg-brand-gray-100 text-brand-gray-900 border-brand-gray-200'
                : 'bg-brand-gray-900 text-brand-gray-100 border-brand-gray-700'
            } border focus:outline-none focus:ring-1 focus:ring-brand-gray-400`}
          >
            {GUI_LANGUAGE_OPTIONS.map((option: { code: string; labelKey: string }) => (
              <option key={option.code} value={option.code}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <p
            className={`mt-1 text-xs ${
              isLight ? 'text-brand-gray-500' : 'text-brand-gray-400'
            }`}
          >
            {t(
              'Select the interface language. Story writing language is set in Project Settings.'
            )}
          </p>
        </div>
      </div>
    </div>
  </div>
);

interface AboutSettingsTabProps {
  isLight: boolean;
  currentYear: number;
  browserVersion: string;
}

const AboutSettingsTab: React.FC<AboutSettingsTabProps> = ({
  isLight,
  currentYear,
  browserVersion,
}: AboutSettingsTabProps) => (
  <div>
    <h3
      className={`text-xl font-semibold mb-4 ${
        isLight ? 'text-brand-gray-900' : 'text-brand-gray-100'
      }`}
    >
      About AugmentedQuill
    </h3>
    <div className="space-y-3 text-sm">
      <div>
        <strong>Version:</strong> {process.env.APP_VERSION || 'unknown'}
      </div>
      <div>
        <strong>Git revision:</strong> {process.env.GIT_REVISION || 'unknown'}
      </div>
      <div>
        <strong>Built:</strong> {new Date().toLocaleString()}
      </div>
      <div>
        <strong>License:</strong> GNU General Public License v3+
      </div>
      <div>
        <strong>Copyright:</strong> © 2025
        {currentYear > 2025 ? `-${currentYear}` : ''} StableLlama and contributors
      </div>
      <div>
        <strong>Python:</strong> {process.env.PYTHON_VERSION || 'unknown'}
      </div>
      <div>
        <strong>Node:</strong> {process.env.NODE_VERSION || 'unknown'}
      </div>
      <div>
        <strong>Browser:</strong> {browserVersion}
      </div>
      <div>
        <strong>Project:</strong>{' '}
        <a
          href={process.env.GITHUB_PROJECT_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-brand-blue-600 underline"
        >
          {process.env.GITHUB_PROJECT_URL}
        </a>
      </div>
      <div className="text-xs text-brand-gray-500 pt-1">
        App platform: React + Vite, Backend: FastAPI
      </div>
    </div>
  </div>
);

interface SettingsDialogFooterProps {
  isLight: boolean;
  theme: AppTheme;
  saveError: string;
  saveLoading: boolean;
  onSave: () => void;
}

const SettingsDialogFooter: React.FC<SettingsDialogFooterProps> = ({
  isLight,
  theme,
  saveError,
  saveLoading,
  onSave,
}: SettingsDialogFooterProps) => (
  <div
    className={`p-4 border-t shrink-0 flex justify-end ${
      isLight
        ? 'border-brand-gray-200 bg-brand-gray-50'
        : 'border-brand-gray-800 bg-brand-gray-900'
    }`}
  >
    <div className="flex items-center gap-3">
      {saveError && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle size={14} />
          <span>{saveError}</span>
        </div>
      )}
      <Button
        theme={theme}
        onClick={onSave}
        icon={saveLoading ? <CheckCircle2 size={16} /> : <Save size={16} />}
        disabled={saveLoading}
      >
        Save & Close
      </Button>
    </div>
  </div>
);

interface SettingsDialogLayoutProps {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  isLight: boolean;
  activeTab: SettingsTabId;
  setActiveTab: (id: SettingsTabId) => void;
  t: (key: string) => string;
  projects: ProjectMetadata[];
  activeProjectId: string;
  onLoadProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string, newLang?: string) => void;
  onConvertProject: (newType: string) => void;
  onImportProject: (file: File) => Promise<void>;
  onRefreshProjects: () => void;
  onClose: () => void;
  activeProjectType?: 'short-story' | 'novel' | 'series';
  activeProjectStats: { chapterCount: number; bookCount: number };
  theme: AppTheme;
  projectLanguages: string[];
  localSettings: AppSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  editingProviderId: string | null;
  setEditingProviderId: React.Dispatch<React.SetStateAction<string | null>>;
  connectionStatus: { [key: string]: 'idle' | 'success' | 'error' | 'loading' };
  modelStatus: { [key: string]: 'idle' | 'success' | 'error' | 'loading' };
  detectedCapabilities: Record<
    string,
    { is_multimodal: boolean; supports_function_calling: boolean }
  >;
  modelLists: Record<string, string[]>;
  modelPresets: ReturnType<typeof useSettingsDialogMachine>['modelPresets'];
  defaultPrompts: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  addProvider: () => void;
  duplicateProvider: (id: string) => void;
  updateProvider: ReturnType<typeof useSettingsDialogMachine>['updateProvider'];
  removeProvider: (id: string) => void;
  currentYear: number;
  browserVersion: string;
  saveError: string;
  saveLoading: boolean;
  onSave: () => void;
}

interface SettingsDialogHeaderProps {
  isLight: boolean;
  onClose: () => void;
}

const SettingsDialogHeader: React.FC<SettingsDialogHeaderProps> = ({
  isLight,
  onClose,
}: SettingsDialogHeaderProps) => (
  <div
    className={`flex items-center justify-between p-4 border-b shrink-0 ${
      isLight
        ? 'border-brand-gray-200 bg-brand-gray-50'
        : 'border-brand-gray-800 bg-brand-gray-900'
    }`}
  >
    <div className="flex items-center space-x-3">
      <div
        className={`p-2 rounded-lg ${
          isLight ? 'bg-brand-600' : 'bg-brand-900/40 border border-brand-800/50'
        }`}
      >
        <Settings className={isLight ? 'text-white' : 'text-brand-300'} size={20} />
      </div>
      <h2
        id="settings-dialog-title"
        className={`text-xl font-bold ${
          isLight ? 'text-brand-gray-800' : 'text-brand-gray-300'
        }`}
      >
        Settings
      </h2>
    </div>
    <button
      onClick={onClose}
      aria-label="Close settings"
      className={`transition-colors ${
        isLight
          ? 'text-brand-gray-500 hover:text-brand-gray-700'
          : 'text-brand-gray-500 hover:text-brand-gray-300'
      }`}
    >
      <X size={24} />
    </button>
  </div>
);

interface SettingsDialogSidebarProps {
  isLight: boolean;
  activeTab: SettingsTabId;
  setActiveTab: (id: SettingsTabId) => void;
  t: (key: string) => string;
}

const SettingsDialogSidebar: React.FC<SettingsDialogSidebarProps> = ({
  isLight,
  activeTab,
  setActiveTab,
  t,
}: SettingsDialogSidebarProps) => (
  <div
    className={`w-full md:w-64 border-b md:border-b-0 md:border-r p-2 md:p-4 flex flex-row md:flex-col gap-2 shrink-0 overflow-x-auto ${
      isLight
        ? 'border-brand-gray-200 bg-brand-gray-50'
        : 'border-brand-gray-800 bg-brand-gray-950'
    }`}
  >
    <SettingsTabButton
      id="projects"
      icon={<HardDrive size={18} />}
      label={t('Projects')}
      activeTab={activeTab}
      isLight={isLight}
      onSelectTab={setActiveTab}
    />
    <SettingsTabButton
      id="machine"
      icon={<Cpu size={18} />}
      label={t('Machine Settings')}
      activeTab={activeTab}
      isLight={isLight}
      onSelectTab={setActiveTab}
    />
    <SettingsTabButton
      id="general"
      icon={<Settings size={18} />}
      label={t('General')}
      activeTab={activeTab}
      isLight={isLight}
      onSelectTab={setActiveTab}
    />
    <SettingsTabButton
      id="about"
      icon={<Info size={18} />}
      label={t('About')}
      activeTab={activeTab}
      isLight={isLight}
      onSelectTab={setActiveTab}
    />
  </div>
);

interface SettingsDialogContentProps {
  isLight: boolean;
  activeTab: SettingsTabId;
  projects: ProjectMetadata[];
  activeProjectId: string;
  onLoadProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string, newLang?: string) => void;
  onConvertProject: (newType: string) => void;
  onImportProject: (file: File) => Promise<void>;
  onRefreshProjects: () => void;
  onClose: () => void;
  activeProjectType?: 'short-story' | 'novel' | 'series';
  activeProjectStats: { chapterCount: number; bookCount: number };
  theme: AppTheme;
  projectLanguages: string[];
  localSettings: AppSettings;
  setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  editingProviderId: string | null;
  setEditingProviderId: React.Dispatch<React.SetStateAction<string | null>>;
  connectionStatus: { [key: string]: 'idle' | 'success' | 'error' | 'loading' };
  modelStatus: { [key: string]: 'idle' | 'success' | 'error' | 'loading' };
  detectedCapabilities: Record<
    string,
    { is_multimodal: boolean; supports_function_calling: boolean }
  >;
  modelLists: Record<string, string[]>;
  modelPresets: ReturnType<typeof useSettingsDialogMachine>['modelPresets'];
  defaultPrompts: {
    system_messages: Record<string, string>;
    user_prompts: Record<string, string>;
  };
  addProvider: () => void;
  duplicateProvider: (id: string) => void;
  updateProvider: ReturnType<typeof useSettingsDialogMachine>['updateProvider'];
  removeProvider: (id: string) => void;
  currentYear: number;
  browserVersion: string;
  t: (key: string) => string;
}

const SettingsDialogContent: React.FC<SettingsDialogContentProps> = ({
  isLight,
  activeTab,
  projects,
  activeProjectId,
  onLoadProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onConvertProject,
  onImportProject,
  onRefreshProjects,
  onClose,
  activeProjectType,
  activeProjectStats,
  theme,
  projectLanguages,
  localSettings,
  setLocalSettings,
  editingProviderId,
  setEditingProviderId,
  connectionStatus,
  modelStatus,
  detectedCapabilities,
  modelLists,
  modelPresets,
  defaultPrompts,
  addProvider,
  duplicateProvider,
  updateProvider,
  removeProvider,
  currentYear,
  browserVersion,
  t,
}: SettingsDialogContentProps) => (
  <div
    className={`flex-1 overflow-y-auto p-4 md:p-8 ${
      isLight ? 'bg-brand-gray-50' : 'bg-brand-gray-900'
    }`}
  >
    {activeTab === 'projects' && (
      <SettingsProjects
        projects={projects}
        activeProjectId={activeProjectId}
        onLoadProject={onLoadProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
        onRenameProject={onRenameProject}
        onConvertProject={onConvertProject}
        onImportProject={onImportProject}
        onRefreshProjects={onRefreshProjects}
        onCloseDialog={onClose}
        activeProjectType={activeProjectType}
        activeProjectStats={activeProjectStats}
        theme={theme}
        languages={projectLanguages}
      />
    )}

    {activeTab === 'general' && (
      <GeneralSettingsTab
        isLight={isLight}
        guiLanguage={localSettings.guiLanguage}
        onChangeGuiLanguage={(language: string) =>
          setLocalSettings((prev: AppSettings) => ({ ...prev, guiLanguage: language }))
        }
        t={t}
      />
    )}

    {activeTab === 'machine' && (
      <SettingsMachine
        localSettings={localSettings}
        setLocalSettings={setLocalSettings}
        editingProviderId={editingProviderId}
        setEditingProviderId={setEditingProviderId}
        connectionStatus={connectionStatus}
        modelStatus={modelStatus}
        detectedCapabilities={detectedCapabilities}
        modelLists={modelLists}
        modelPresets={modelPresets}
        theme={theme}
        defaultPrompts={defaultPrompts}
        onAddProvider={addProvider}
        onDuplicateProvider={duplicateProvider}
        onUpdateProvider={updateProvider}
        onRemoveProvider={removeProvider}
      />
    )}

    {activeTab === 'about' && (
      <AboutSettingsTab
        isLight={isLight}
        currentYear={currentYear}
        browserVersion={browserVersion}
      />
    )}
  </div>
);

const SettingsDialogLayout: React.FC<SettingsDialogLayoutProps> = ({
  dialogRef,
  isLight,
  activeTab,
  setActiveTab,
  t,
  projects,
  activeProjectId,
  onLoadProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onConvertProject,
  onImportProject,
  onRefreshProjects,
  onClose,
  activeProjectType,
  activeProjectStats,
  theme,
  projectLanguages,
  localSettings,
  setLocalSettings,
  editingProviderId,
  setEditingProviderId,
  connectionStatus,
  modelStatus,
  detectedCapabilities,
  modelLists,
  modelPresets,
  defaultPrompts,
  addProvider,
  duplicateProvider,
  updateProvider,
  removeProvider,
  currentYear,
  browserVersion,
  saveError,
  saveLoading,
  onSave,
}: SettingsDialogLayoutProps) => (
  <div
    ref={dialogRef}
    id="settings-dialog"
    className="fixed inset-0 z-50 flex items-center justify-center bg-brand-gray-950/70 backdrop-blur-sm p-2 md:p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-dialog-title"
    tabIndex={-1}
  >
    <div
      className={`w-full max-w-5xl h-[95vh] md:h-[85vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
        isLight
          ? 'bg-brand-gray-50 border-brand-gray-200'
          : 'bg-brand-gray-900 border-brand-gray-700'
      }`}
    >
      <SettingsDialogHeader isLight={isLight} onClose={onClose} />

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <SettingsDialogSidebar
          isLight={isLight}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          t={t}
        />

        <SettingsDialogContent
          isLight={isLight}
          activeTab={activeTab}
          projects={projects}
          activeProjectId={activeProjectId}
          onLoadProject={onLoadProject}
          onCreateProject={onCreateProject}
          onDeleteProject={onDeleteProject}
          onRenameProject={onRenameProject}
          onConvertProject={onConvertProject}
          onImportProject={onImportProject}
          onRefreshProjects={onRefreshProjects}
          onClose={onClose}
          activeProjectType={activeProjectType}
          activeProjectStats={activeProjectStats}
          theme={theme}
          projectLanguages={projectLanguages}
          localSettings={localSettings}
          setLocalSettings={setLocalSettings}
          editingProviderId={editingProviderId}
          setEditingProviderId={setEditingProviderId}
          connectionStatus={connectionStatus}
          modelStatus={modelStatus}
          detectedCapabilities={detectedCapabilities}
          modelLists={modelLists}
          modelPresets={modelPresets}
          defaultPrompts={defaultPrompts}
          addProvider={addProvider}
          duplicateProvider={duplicateProvider}
          updateProvider={updateProvider}
          removeProvider={removeProvider}
          currentYear={currentYear}
          browserVersion={browserVersion}
          t={t}
        />
      </div>

      <SettingsDialogFooter
        isLight={isLight}
        theme={theme}
        saveError={saveError}
        saveLoading={saveLoading}
        onSave={onSave}
      />
    </div>
  </div>
);

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  projects,
  activeProjectId,
  onLoadProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onConvertProject,
  onImportProject,
  onRefreshProjects,
  activeProjectType,
  activeProjectStats = { chapterCount: 0, bookCount: 0 },
  theme,
  defaultPrompts = { system_messages: {}, user_prompts: {} },
  projectLanguages,
}: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('projects');
  const [saveError, setSaveError] = useState<string>('');
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  const {
    localSettings,
    setLocalSettings,
    editingProviderId,
    setEditingProviderId,
    connectionStatus,
    modelStatus,
    modelLists,
    detectedCapabilities,
    modelPresets,
    addProvider,
    duplicateProvider,
    updateProvider,
    removeProvider,
  } = useSettingsDialogMachine({ isOpen, settings });

  const { t } = useTranslation();
  const { isLight } = useThemeClasses();
  const currentYear = new Date().getFullYear();
  const browserVersion =
    typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'unknown';

  useEffect((): void => {
    if (isOpen) {
      setSaveError('');
    }
  }, [isOpen]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, dialogRef, onClose);

  if (!isOpen) return null;

  const handleSave = async (): Promise<void> => {
    setSaveError('');
    setSaveLoading(true);
    try {
      const providers = localSettings.providers || [];
      const cleanedProviders = providers.map((p: import('../../types').LLMConfig) => ({
        ...p,
        prompts: normalizeProviderPrompts(p.prompts, DEFAULT_LLM_CONFIG.prompts),
      }));

      const cleanedSettings = { ...localSettings, providers: cleanedProviders };

      await onSaveSettings(cleanedSettings);
      onClose();
    } catch (_error: unknown) {
      console.error('Failed to save machine settings', _error);
      setSaveError(_error instanceof Error ? _error.message : 'Failed to save');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <SettingsDialogLayout
      dialogRef={dialogRef}
      isLight={isLight}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      t={t}
      projects={projects}
      activeProjectId={activeProjectId}
      onLoadProject={onLoadProject}
      onCreateProject={onCreateProject}
      onDeleteProject={onDeleteProject}
      onRenameProject={onRenameProject}
      onConvertProject={onConvertProject}
      onImportProject={onImportProject}
      onRefreshProjects={onRefreshProjects}
      onClose={onClose}
      activeProjectType={activeProjectType}
      activeProjectStats={activeProjectStats}
      theme={theme}
      projectLanguages={projectLanguages}
      localSettings={localSettings}
      setLocalSettings={setLocalSettings}
      editingProviderId={editingProviderId}
      setEditingProviderId={setEditingProviderId}
      connectionStatus={connectionStatus}
      modelStatus={modelStatus}
      detectedCapabilities={detectedCapabilities}
      modelLists={modelLists}
      modelPresets={modelPresets}
      defaultPrompts={defaultPrompts}
      addProvider={addProvider}
      duplicateProvider={duplicateProvider}
      updateProvider={updateProvider}
      removeProvider={removeProvider}
      currentYear={currentYear}
      browserVersion={browserVersion}
      saveError={saveError}
      saveLoading={saveLoading}
      onSave={handleSave}
    />
  );
};

export default SettingsDialog;
