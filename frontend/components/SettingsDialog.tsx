import React, { useState, useEffect } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Save,
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Play,
  HardDrive,
  Cpu,
  Terminal,
  Key,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import { LLMConfig, ProjectMetadata, AppSettings, AppTheme } from '../types';
import { testConnection } from '../services/geminiService';
import { Button } from './Button';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  projects: ProjectMetadata[];
  activeProjectId: string;
  onLoadProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  theme: AppTheme;
}

const DEFAULT_CONFIG: LLMConfig = {
  id: 'default-gemini',
  name: 'Default Gemini',
  provider: 'gemini',
  baseUrl: '',
  apiKey: '',
  timeout: 30000,
  modelId: 'gemini-2.5-flash',
  temperature: 0.7,
  topP: 0.95,
  prompts: {
    system: '',
    continuation: '',
    summary: '',
  },
};

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
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<'projects' | 'machine'>('projects');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    [key: string]: 'idle' | 'success' | 'error' | 'loading';
  }>({});
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');

  const isLight = theme === 'light';

  // Reset local state when opening
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setEditingProviderId(settings.activeChatProviderId); // Default to editing current chat provider
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  const addProvider = () => {
    const newProvider: LLMConfig = {
      ...DEFAULT_CONFIG,
      id: Date.now().toString(),
      name: 'New Provider',
    };
    setLocalSettings((prev) => ({
      ...prev,
      providers: [...prev.providers, newProvider],
      activeChatProviderId: prev.activeChatProviderId || newProvider.id,
      activeStoryProviderId: prev.activeStoryProviderId || newProvider.id,
    }));
    setEditingProviderId(newProvider.id);
  };

  const updateProvider = (id: string, updates: Partial<LLMConfig>) => {
    setLocalSettings((prev) => ({
      ...prev,
      providers: prev.providers.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  };

  const removeProvider = (id: string) => {
    setLocalSettings((prev) => {
      const remaining = prev.providers.filter((p) => p.id !== id);
      const fallbackId = remaining[0]?.id || '';
      return {
        ...prev,
        providers: remaining,
        activeChatProviderId:
          prev.activeChatProviderId === id ? fallbackId : prev.activeChatProviderId,
        activeStoryProviderId:
          prev.activeStoryProviderId === id ? fallbackId : prev.activeStoryProviderId,
      };
    });
    if (editingProviderId === id) setEditingProviderId(null);
  };

  const handleTestConnection = async (provider: LLMConfig) => {
    setConnectionStatus((prev) => ({ ...prev, [provider.id]: 'loading' }));
    const result = await testConnection(provider);
    setConnectionStatus((prev) => ({
      ...prev,
      [provider.id]: result ? 'success' : 'error',
    }));
  };

  const activeProvider = localSettings.providers.find(
    (p) => p.id === editingProviderId
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-4">
      <div
        className={`w-full max-w-5xl h-[95vh] md:h-[85vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          isLight ? 'bg-white border-stone-200' : 'bg-stone-900 border-stone-700'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b shrink-0 ${
            isLight ? 'border-stone-200 bg-white' : 'border-stone-800 bg-stone-900'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-600 rounded-lg">
              <Settings className="text-white" size={20} />
            </div>
            <h2
              className={`text-xl font-bold ${
                isLight ? 'text-stone-800' : 'text-stone-200'
              }`}
            >
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`transition-colors ${
              isLight
                ? 'text-stone-500 hover:text-stone-700'
                : 'text-stone-500 hover:text-stone-300'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Sidebar / Navigation Tabs */}
          <div
            className={`w-full md:w-64 border-b md:border-b-0 md:border-r p-2 md:p-4 flex flex-row md:flex-col gap-2 shrink-0 overflow-x-auto ${
              isLight ? 'border-stone-200 bg-stone-50' : 'border-stone-800 bg-stone-950'
            }`}
          >
            <button
              onClick={() => setActiveTab('projects')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 md:flex-none ${
                activeTab === 'projects'
                  ? 'bg-amber-600 text-white border border-amber-500'
                  : isLight
                  ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
              }`}
            >
              <HardDrive size={18} />
              <span>Projects</span>
            </button>
            <button
              onClick={() => setActiveTab('machine')}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 md:flex-none ${
                activeTab === 'machine'
                  ? 'bg-amber-600 text-white border border-amber-500'
                  : isLight
                  ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
              }`}
            >
              <Cpu size={18} />
              <span>Machine Settings</span>
            </button>
          </div>

          {/* Tab Content */}
          <div
            className={`flex-1 overflow-y-auto p-4 md:p-8 ${
              isLight ? 'bg-white' : 'bg-stone-900'
            }`}
          >
            {activeTab === 'projects' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3
                      className={`text-lg md:text-2xl font-bold mb-1 ${
                        isLight ? 'text-stone-800' : 'text-stone-200'
                      }`}
                    >
                      Your Projects
                    </h3>
                    <p
                      className={`text-sm ${
                        isLight ? 'text-stone-500' : 'text-stone-500'
                      }`}
                    >
                      Manage your stories and creative works.
                    </p>
                  </div>
                  <Button onClick={onCreateProject} icon={<Plus size={16} />}>
                    New Project
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {projects.map((proj) => (
                    <div
                      key={proj.id}
                      className={`group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border transition-all gap-3 ${
                        proj.id === activeProjectId
                          ? 'bg-amber-50 border-amber-500/50'
                          : isLight
                          ? 'bg-stone-50 border-stone-200 hover:border-stone-300'
                          : 'bg-stone-800 border-stone-700 hover:border-stone-600'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`hidden sm:block w-2 h-12 rounded-full ${
                            proj.id === activeProjectId
                              ? 'bg-amber-500'
                              : isLight
                              ? 'bg-stone-300'
                              : 'bg-stone-600'
                          }`}
                        ></div>
                        <div className="flex-1">
                          {editingNameId === proj.id ? (
                            <div className="flex items-center space-x-2">
                              <input
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                className={`border rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500 w-full ${
                                  isLight
                                    ? 'bg-white border-stone-300 text-stone-800'
                                    : 'bg-stone-950 border-stone-600 text-white'
                                }`}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    onRenameProject(proj.id, tempName);
                                    setEditingNameId(null);
                                  }
                                }}
                              />
                              <button
                                onClick={() => {
                                  onRenameProject(proj.id, tempName);
                                  setEditingNameId(null);
                                }}
                                className="text-green-500 hover:text-green-400"
                              >
                                <Save size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2 group/title">
                              <h4
                                className={`font-bold ${
                                  isLight ? 'text-stone-800' : 'text-stone-200'
                                }`}
                              >
                                {proj.title}
                              </h4>
                              <button
                                onClick={() => {
                                  setEditingNameId(proj.id);
                                  setTempName(proj.title);
                                }}
                                className={`opacity-0 group-hover/title:opacity-100 transition-opacity ${
                                  isLight
                                    ? 'text-stone-500 hover:text-stone-700'
                                    : 'text-stone-500 hover:text-stone-300'
                                }`}
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-stone-500 mt-1">
                            Last edited: {new Date(proj.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 justify-end">
                        {proj.id !== activeProjectId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              onLoadProject(proj.id);
                              onClose();
                            }}
                          >
                            Open
                          </Button>
                        )}
                        {proj.id === activeProjectId && (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            Active
                          </span>
                        )}
                        <button
                          onClick={() => onDeleteProject(proj.id)}
                          className={`p-2 rounded transition-colors ${
                            isLight
                              ? 'text-stone-400 hover:text-red-500 hover:bg-red-50'
                              : 'text-stone-600 hover:text-red-400 hover:bg-red-950/30'
                          }`}
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'machine' && (
              <div className="flex flex-col md:flex-row h-full gap-4 md:gap-6">
                {/* Provider List */}
                <div
                  className={`w-full md:w-1/3 h-48 md:h-full border-b md:border-b-0 md:border-r md:pr-6 overflow-y-auto shrink-0 ${
                    isLight ? 'border-stone-200' : 'border-stone-800'
                  }`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3
                      className={`font-bold ${
                        isLight ? 'text-stone-700' : 'text-stone-300'
                      }`}
                    >
                      Providers
                    </h3>
                    <button
                      onClick={addProvider}
                      className={`p-1 rounded transition-colors ${
                        isLight
                          ? 'bg-stone-100 text-stone-600 hover:text-amber-600'
                          : 'bg-stone-800 text-stone-400 hover:text-amber-400'
                      }`}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {localSettings.providers.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setEditingProviderId(p.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col gap-2 ${
                          editingProviderId === p.id
                            ? 'bg-amber-50 border-amber-500/50'
                            : isLight
                            ? 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                            : 'bg-stone-800 border-stone-700 hover:bg-stone-750'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <div className="truncate flex-1">
                            <div
                              className={`font-medium text-sm ${
                                isLight ? 'text-stone-800' : 'text-stone-200'
                              }`}
                            >
                              {p.name}
                            </div>
                            <div className="text-xs text-stone-500 uppercase">
                              {p.provider}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {connectionStatus[p.id] === 'success' && (
                              <CheckCircle2 size={14} className="text-green-500" />
                            )}
                            {connectionStatus[p.id] === 'error' && (
                              <AlertCircle size={14} className="text-red-500" />
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {p.id === localSettings.activeChatProviderId && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                              <MessageSquare size={10} /> Chat
                            </span>
                          )}
                          {p.id === localSettings.activeStoryProviderId && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <BookOpen size={10} /> Story
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Config Form */}
                <div className="flex-1 overflow-y-auto pl-0 md:pl-2 md:pr-2">
                  {activeProvider ? (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3
                            className={`text-xl font-bold ${
                              isLight ? 'text-stone-800' : 'text-stone-200'
                            }`}
                          >
                            {activeProvider.name}
                          </h3>
                          <p className="text-xs text-stone-500 mt-1">
                            ID: {activeProvider.id}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => removeProvider(activeProvider.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>

                      {/* Role Selection Buttons */}
                      <div
                        className={`grid grid-cols-2 gap-3 p-3 rounded-lg border ${
                          isLight
                            ? 'bg-stone-50 border-stone-200'
                            : 'bg-stone-950 border-stone-800'
                        }`}
                      >
                        <button
                          onClick={() =>
                            setLocalSettings((s) => ({
                              ...s,
                              activeChatProviderId: activeProvider.id,
                            }))
                          }
                          className={`flex items-center justify-center gap-2 py-2 rounded text-xs font-bold uppercase transition-all ${
                            localSettings.activeChatProviderId === activeProvider.id
                              ? 'bg-amber-600 text-white shadow-md'
                              : isLight
                              ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                              : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                          }`}
                        >
                          <MessageSquare size={14} />
                          Use for Chat
                        </button>
                        <button
                          onClick={() =>
                            setLocalSettings((s) => ({
                              ...s,
                              activeStoryProviderId: activeProvider.id,
                            }))
                          }
                          className={`flex items-center justify-center gap-2 py-2 rounded text-xs font-bold uppercase transition-all ${
                            localSettings.activeStoryProviderId === activeProvider.id
                              ? 'bg-emerald-600 text-white shadow-md'
                              : isLight
                              ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                              : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                          }`}
                        >
                          <BookOpen size={14} />
                          Use for Story
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-stone-500 uppercase">
                              Name
                            </label>
                            <input
                              value={activeProvider.name}
                              onChange={(e) =>
                                updateProvider(activeProvider.id, {
                                  name: e.target.value,
                                })
                              }
                              className={`w-full border rounded p-2 text-sm focus:border-amber-500 focus:outline-none ${
                                isLight
                                  ? 'bg-white border-stone-300 text-stone-800'
                                  : 'bg-stone-950 border-stone-700 text-stone-200'
                              }`}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-stone-500 uppercase">
                              Type
                            </label>
                            <select
                              value={activeProvider.provider}
                              onChange={(e) =>
                                updateProvider(activeProvider.id, {
                                  provider: e.target.value as any,
                                })
                              }
                              className={`w-full border rounded p-2 text-sm focus:border-amber-500 focus:outline-none ${
                                isLight
                                  ? 'bg-white border-stone-300 text-stone-800'
                                  : 'bg-stone-950 border-stone-700 text-stone-200'
                              }`}
                            >
                              <option value="gemini">Google Gemini SDK</option>
                              <option value="openai">OpenAI Compatible (HTTP)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-stone-500 uppercase flex items-center gap-2">
                            <Terminal size={12} /> Base URL{' '}
                            {activeProvider.provider === 'gemini' && (
                              <span className="text-stone-600">(Not used for SDK)</span>
                            )}
                          </label>
                          <input
                            value={activeProvider.baseUrl}
                            onChange={(e) =>
                              updateProvider(activeProvider.id, {
                                baseUrl: e.target.value,
                              })
                            }
                            placeholder={
                              activeProvider.provider === 'openai'
                                ? 'https://api.openai.com/v1'
                                : 'N/A'
                            }
                            disabled={activeProvider.provider === 'gemini'}
                            className={`w-full border rounded p-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-50 ${
                              isLight
                                ? 'bg-white border-stone-300 text-stone-800'
                                : 'bg-stone-950 border-stone-700 text-stone-200'
                            }`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-stone-500 uppercase flex items-center gap-2">
                            <Key size={12} /> API Key
                          </label>
                          <div className="relative">
                            <input
                              type="password"
                              value={activeProvider.apiKey}
                              onChange={(e) =>
                                updateProvider(activeProvider.id, {
                                  apiKey: e.target.value,
                                })
                              }
                              placeholder="sk-..."
                              className={`w-full border rounded p-2 text-sm focus:border-amber-500 focus:outline-none ${
                                isLight
                                  ? 'bg-white border-stone-300 text-stone-800'
                                  : 'bg-stone-950 border-stone-700 text-stone-200'
                              }`}
                            />
                            <div className="absolute right-2 top-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                onClick={() => handleTestConnection(activeProvider)}
                                disabled={
                                  connectionStatus[activeProvider.id] === 'loading'
                                }
                              >
                                {connectionStatus[activeProvider.id] === 'loading' ? (
                                  <RotateCw className="animate-spin" size={12} />
                                ) : (
                                  'Test'
                                )}
                              </Button>
                            </div>
                          </div>
                          {connectionStatus[activeProvider.id] === 'success' && (
                            <p className="text-xs text-green-500 mt-1">
                              Connection verified.
                            </p>
                          )}
                          {connectionStatus[activeProvider.id] === 'error' && (
                            <p className="text-xs text-red-500 mt-1">
                              Connection failed.
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-stone-500 uppercase">
                              Model ID
                            </label>
                            <input
                              value={activeProvider.modelId}
                              onChange={(e) =>
                                updateProvider(activeProvider.id, {
                                  modelId: e.target.value,
                                })
                              }
                              className={`w-full border rounded p-2 text-sm focus:border-amber-500 focus:outline-none ${
                                isLight
                                  ? 'bg-white border-stone-300 text-stone-800'
                                  : 'bg-stone-950 border-stone-700 text-stone-200'
                              }`}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-stone-500 uppercase">
                              Timeout (ms)
                            </label>
                            <input
                              type="number"
                              value={activeProvider.timeout}
                              onChange={(e) =>
                                updateProvider(activeProvider.id, {
                                  timeout: Number(e.target.value),
                                })
                              }
                              className={`w-full border rounded p-2 text-sm focus:border-amber-500 focus:outline-none ${
                                isLight
                                  ? 'bg-white border-stone-300 text-stone-800'
                                  : 'bg-stone-950 border-stone-700 text-stone-200'
                              }`}
                            />
                          </div>
                        </div>

                        <div
                          className={`pt-4 border-t ${
                            isLight ? 'border-stone-200' : 'border-stone-800'
                          }`}
                        >
                          <h4
                            className={`text-sm font-bold mb-3 uppercase tracking-wider ${
                              isLight ? 'text-stone-600' : 'text-stone-400'
                            }`}
                          >
                            Parameters
                          </h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div
                                className={`flex justify-between text-xs ${
                                  isLight ? 'text-stone-600' : 'text-stone-400'
                                }`}
                              >
                                <span>Temperature</span>{' '}
                                <span>{activeProvider.temperature}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={activeProvider.temperature}
                                onChange={(e) =>
                                  updateProvider(activeProvider.id, {
                                    temperature: Number(e.target.value),
                                  })
                                }
                                className="w-full accent-amber-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <div
                                className={`flex justify-between text-xs ${
                                  isLight ? 'text-stone-600' : 'text-stone-400'
                                }`}
                              >
                                <span>Top P</span> <span>{activeProvider.topP}</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={activeProvider.topP}
                                onChange={(e) =>
                                  updateProvider(activeProvider.id, {
                                    topP: Number(e.target.value),
                                  })
                                }
                                className="w-full accent-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        <div
                          className={`pt-4 border-t ${
                            isLight ? 'border-stone-200' : 'border-stone-800'
                          }`}
                        >
                          <h4
                            className={`text-sm font-bold mb-3 uppercase tracking-wider ${
                              isLight ? 'text-stone-600' : 'text-stone-400'
                            }`}
                          >
                            Expert: Prompt Overrides
                          </h4>
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-stone-500">
                                System Instruction (Chat Persona)
                              </label>
                              <textarea
                                rows={3}
                                value={activeProvider.prompts?.system || ''}
                                onChange={(e) =>
                                  updateProvider(activeProvider.id, {
                                    prompts: {
                                      ...activeProvider.prompts,
                                      system: e.target.value,
                                    },
                                  })
                                }
                                placeholder="Default persona..."
                                className={`w-full border rounded p-2 text-xs focus:border-amber-500 focus:outline-none ${
                                  isLight
                                    ? 'bg-white border-stone-300 text-stone-800'
                                    : 'bg-stone-950 border-stone-700 text-stone-300'
                                }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-stone-500">
                                Continuation Prompt
                              </label>
                              <textarea
                                rows={2}
                                value={activeProvider.prompts?.continuation || ''}
                                onChange={(e) =>
                                  updateProvider(activeProvider.id, {
                                    prompts: {
                                      ...activeProvider.prompts,
                                      continuation: e.target.value,
                                    },
                                  })
                                }
                                placeholder="Instruction for generating next paragraphs..."
                                className={`w-full border rounded p-2 text-xs focus:border-amber-500 focus:outline-none ${
                                  isLight
                                    ? 'bg-white border-stone-300 text-stone-800'
                                    : 'bg-stone-950 border-stone-700 text-stone-300'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-stone-600">
                      <p>Select a provider to configure</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t shrink-0 flex justify-end ${
            isLight ? 'border-stone-200 bg-white' : 'border-stone-800 bg-stone-900'
          }`}
        >
          <Button onClick={handleSave} icon={<Save size={16} />}>
            Save & Close
          </Button>
        </div>
      </div>
    </div>
  );
};
