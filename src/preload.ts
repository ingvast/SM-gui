// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

export interface FileAPI {
  saveFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  exportFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; canceled?: boolean; error?: string }>;
}

contextBridge.exposeInMainWorld('fileAPI', {
  saveFile: (content: string, defaultName: string) => ipcRenderer.invoke('save-file', content, defaultName),
  exportFile: (content: string, defaultName: string) => ipcRenderer.invoke('export-file', content, defaultName),
  openFile: () => ipcRenderer.invoke('open-file'),
} as FileAPI);
