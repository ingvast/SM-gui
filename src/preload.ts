// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

export interface FileAPI {
  saveFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  saveFileDirect: (content: string, filePath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; canceled?: boolean; error?: string }>;
  exportPdf: (fileName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  onExportPhoenix: (callback: () => void) => () => void;
  onSaveAs: (callback: () => void) => () => void;
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
  saveFileDirect: (content: string, filePath: string) => ipcRenderer.invoke('save-file-direct', content, filePath),
  openFile: () => ipcRenderer.invoke('open-file'),
  exportPdf: (fileName: string) => ipcRenderer.invoke('export-pdf', fileName),
  onExportPhoenix: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('export-phoenix', handler);
    return () => { ipcRenderer.removeListener('export-phoenix', handler); };
  },
  onSaveAs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('save-as', handler);
    return () => { ipcRenderer.removeListener('save-as', handler); };
  },
} as FileAPI);

contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('get-settings'),
  save: (settings: Settings) => ipcRenderer.invoke('save-settings', settings),
} as SettingsAPI);

contextBridge.exposeInMainWorld('editorAPI', {
  editExternal: (content: string, language: string) => ipcRenderer.invoke('edit-in-external-editor', content, language),
} as EditorAPI);
