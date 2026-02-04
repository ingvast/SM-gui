// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

export interface FileAPI {
  saveFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  exportFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; canceled?: boolean; error?: string }>;
}

export interface Settings {
  editorPreference: 'system' | 'builtin' | 'custom';
  customEditorCommand: string;
  tabWidth: number;
}

export interface SettingsAPI {
  get: () => Promise<Settings>;
  save: (settings: Settings) => Promise<{ success: boolean }>;
}

export interface EditorAPI {
  editExternal: (content: string, language: string) => Promise<{
    success: boolean;
    content?: string;
    canceled?: boolean;
    error?: string;
    useBuiltin?: boolean;
    fallbackToBuiltin?: boolean;
  }>;
}

contextBridge.exposeInMainWorld('fileAPI', {
  saveFile: (content: string, defaultName: string) => ipcRenderer.invoke('save-file', content, defaultName),
  exportFile: (content: string, defaultName: string) => ipcRenderer.invoke('export-file', content, defaultName),
  openFile: () => ipcRenderer.invoke('open-file'),
} as FileAPI);

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('get-settings'),
  save: (settings: Settings) => ipcRenderer.invoke('save-settings', settings),
} as SettingsAPI);

contextBridge.exposeInMainWorld('editorAPI', {
  editExternal: (content: string, language: string) => ipcRenderer.invoke('edit-in-external-editor', content, language),
} as EditorAPI);
