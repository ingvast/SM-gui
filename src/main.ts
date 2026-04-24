import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import started from 'electron-squirrel-startup';
import type { ViewPlugin, PluginCallbacks, PluginInfo } from './viewPlugin';

// Settings types
interface Settings {
  editorPreference: 'system' | 'builtin' | 'custom';
  customEditorCommand: string;
  tabWidth: number;
}

const defaultSettings: Settings = {
  editorPreference: 'builtin',
  customEditorCommand: 'code -w {file}',
  tabWidth: 4,
};

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return defaultSettings;
}

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// On Linux, the XDG portal file chooser can silently fail on systems where
// xdg-desktop-portal-gtk (or equivalent) is absent or misconfigured. Fall back
// to the native GTK file chooser which works without a portal daemon.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-features', 'PortalFileChooser');
}

// Track a file to open once the renderer is ready
let pendingFileToOpen: string | null = null;

function sendFileToRenderer(win: BrowserWindow, filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    win.webContents.send('open-with-file', { content, filePath });
  } catch (error) {
    console.error('Error reading file for open:', error);
  }
}

// macOS: file double-clicked in Finder (fires before OR after ready)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    // Open in a new window for multi-window support
    const win = createWindow();
    win.webContents.once('did-finish-load', () => {
      sendFileToRenderer(win, filePath);
    });
  } else {
    pendingFileToOpen = filePath;
  }
});

// CLI argument: file path passed on startup (packaged binary, dev mode with -- flags, etc.)
// Also covers macOS when invoked directly (not via Finder double-click which uses open-file event)
{
  const arg = process.argv.find(
    (a, i) => i > 0 && (a.endsWith('.smb') || a.endsWith('.yaml') || a.endsWith('.yml'))
  );
  if (arg) {
    const resolved = path.resolve(arg);
    if (fs.existsSync(resolved)) {
      pendingFileToOpen = resolved;
    }
  }
}

// ---------------------------------------------------------------------------
// View-mode plugin host
// ---------------------------------------------------------------------------

// Registry of available plugins (loaded lazily on first list request)
let pluginRegistry: Map<string, ViewPlugin> | null = null;
let activePlugin: ViewPlugin | null = null;

async function loadPluginRegistry(): Promise<Map<string, ViewPlugin>> {
  if (pluginRegistry) return pluginRegistry;
  pluginRegistry = new Map();
  // Statically import known built-in plugins.
  // Additional plugins can be added here in the future.
  try {
    const mock = await import('./plugins/mockPlugin');
    pluginRegistry.set(mock.default.name, mock.default);
  } catch (err) {
    console.warn('Failed to load mockPlugin:', err);
  }
  try {
    const smRunner = await import('./plugins/smRunnerPlugin');
    pluginRegistry.set(smRunner.default.name, smRunner.default);
  } catch (err) {
    console.warn('Failed to load smRunnerPlugin:', err);
  }
  try {
    const mqttBridge = await import('./plugins/mqttBridgePlugin');
    pluginRegistry.set(mqttBridge.default.name, mqttBridge.default);
  } catch (err) {
    console.warn('Failed to load mqttBridgePlugin:', err);
  }
  return pluginRegistry;
}

async function startPlugin(name: string, _config: Record<string, unknown>, mainWindow: BrowserWindow): Promise<void> {
  const registry = await loadPluginRegistry();
  const plugin = registry.get(name);
  if (!plugin) throw new Error(`Unknown plugin: ${name}`);
  if (activePlugin) await activePlugin.stop();

  const callbacks: PluginCallbacks = {
    onStateUpdate(activeStates: string[]) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('view-state-update', activeStates);
      }
    },
  };

  await plugin.start(callbacks, _config);
  activePlugin = plugin;
}

async function stopPlugin(): Promise<void> {
  if (activePlugin) {
    await activePlugin.stop();
    activePlugin = null;
  }
}

const createWindow = () => {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools in dev mode only.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }

  win.on('closed', () => buildMenu());
  win.on('page-title-updated', () => buildMenu());

  buildMenu();
  return win;
};

async function openFileInNewWindow() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [
      { name: 'State Machine Builder Files', extensions: ['smb'] },
      { name: 'YAML Files', extensions: ['yaml', 'yml'] },
    ],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return;

  const win = createWindow();
  win.webContents.once('did-finish-load', () => {
    sendFileToRenderer(win, filePaths[0]);
  });
}

function buildMenu() {
  const allWindows = BrowserWindow.getAllWindows();
  const hasWindows = allWindows.length > 0;

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow();
          },
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('menu-open');
            } else {
              openFileInNewWindow();
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Save as...',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: hasWindows,
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('save-as');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Export to Phoenix',
          accelerator: 'CmdOrCtrl+E',
          enabled: hasWindows,
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('export-phoenix');
            }
          },
        },
        {
          label: 'Import from Phoenix',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('import-phoenix');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Export to source code',
          enabled: hasWindows,
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win) {
              win.webContents.send('export-source-code');
            }
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            win?.webContents.send('menu-undo');
          },
        },
        {
          label: 'Redo',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            win?.webContents.send('menu-redo');
          },
        },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
        { type: 'separator' },
        {
          label: 'Duplicate',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            win?.webContents.send('menu-duplicate');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SM builder',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            const detail = [
              `Version ${app.getVersion()}`,
              'Author: Johan Ingvast',
              'License: MIT',
              '',
              'SM builder is a graphical editor for hierarchical state machines.',
              'Design nested states and transitions on a visual canvas, then export to code.',
            ].join('\n');
            const options: Electron.MessageBoxOptions = {
              type: 'info',
              title: 'About SM builder',
              message: 'SM builder',
              detail,
              buttons: ['OK'],
            };
            if (win) {
              dialog.showMessageBox(win, options);
            } else {
              dialog.showMessageBox(options);
            }
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(allWindows.length > 0 ? [
          { type: 'separator' as const },
          ...allWindows.map((win) => ({
            label: win.getTitle() || 'Untitled',
            click: () => {
              if (win.isMinimized()) win.restore();
              win.show();
              win.focus();
            },
          })),
        ] : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  buildMenu();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// IPC handlers for file operations
ipcMain.handle('save-file', async (event, content: string, defaultName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: [
      { name: 'State Machine Builder Files', extensions: ['smb'] },
      { name: 'YAML Files', extensions: ['yaml', 'yml'] },
    ],
  });

  if (canceled || !filePath) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('save-file-direct', async (_event, content: string, filePath: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [
      { name: 'State Machine Builder Files', extensions: ['smb'] },
      { name: 'YAML Files', extensions: ['yaml', 'yml'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return { success: true, content, filePath: filePaths[0] };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('import-phoenix', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [
      { name: 'YAML Files', extensions: ['yaml', 'yml'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return { success: true, content, filePath: filePaths[0] };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Settings IPC handlers
ipcMain.handle('get-settings', async () => {
  return loadSettings();
});

ipcMain.handle('save-settings', async (_event, settings: Settings) => {
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('export-pdf', async (event, fileName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { success: false, error: 'No window' };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: fileName,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    const data = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
    fs.writeFileSync(filePath, data);
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('export-source-code', async (event, smbFilePath: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const defaultOutputPath = smbFilePath.replace(/\.(smb|yaml|yml)$/i, '');
  const { canceled, filePath: outputPath } = await dialog.showSaveDialog(win, {
    defaultPath: defaultOutputPath,
    title: 'Export to source code',
    buttonLabel: 'Export',
    message: 'Choose output file path (without extension)',
  });

  if (canceled || !outputPath) {
    return { success: false, canceled: true };
  }

  return new Promise((resolve) => {
    const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
    const child = spawn(`sm-compiler -o ${q(outputPath)} ${q(smbFilePath)}`, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    } as Parameters<typeof spawn>[1]);

    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        resolve({ success: false, error: 'sm-compiler not found on PATH. Please install it first.' });
      } else {
        resolve({ success: false, error: error.message });
      }
    });

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: `sm-compiler failed (exit code ${code}):\n${stderr}` });
      }
    });
  });
});

// Renderer calls this on startup to retrieve any file pending from double-click / CLI arg
ipcMain.handle('get-startup-file', async () => {
  if (!pendingFileToOpen) return null;
  const filePath = pendingFileToOpen;
  pendingFileToOpen = null;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, filePath };
  } catch (error) {
    return null;
  }
});

// View-mode plugin IPC handlers
ipcMain.handle('view-list-plugins', async (): Promise<PluginInfo[]> => {
  const registry = await loadPluginRegistry();
  return Array.from(registry.values()).map((p) => ({
    name: p.name,
    configFields: p.configFields || [],
  }));
});

ipcMain.handle('view-start-plugin', async (_event, name: string, config: Record<string, unknown>) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { success: false, error: 'No window' };
  try {
    await startPlugin(name, config, win);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('view-stop-plugin', async () => {
  try {
    await stopPlugin();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// External editor IPC handler
ipcMain.handle('edit-in-external-editor', async (_event, content: string, language: string) => {
  const settings = loadSettings();

  // Determine file extension based on language
  const extensionMap: Record<string, string> = {
    python: '.py',
    typescript: '.ts',
    javascript: '.js',
    c: '.c',
    cpp: '.cpp',
    rust: '.rs',
    go: '.go',
    java: '.java',
    default: '.txt',
  };
  const ext = extensionMap[language] || extensionMap.default;

  // Create temp file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `sm-editor-${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tempFile, content, 'utf-8');

    if (settings.editorPreference === 'system') {
      // Use system default editor - open and show message
      await shell.openPath(tempFile);

      // Show dialog to wait for user
      const result = await dialog.showMessageBox({
        type: 'info',
        title: 'External Editor',
        message: 'The file has been opened in your system default editor.',
        detail: 'Click "Done" when you have finished editing and saved the file.',
        buttons: ['Done', 'Cancel'],
        defaultId: 0,
      });

      if (result.response === 1) {
        // User cancelled
        fs.unlinkSync(tempFile);
        return { success: false, canceled: true };
      }

      // Read back the content
      const newContent = fs.readFileSync(tempFile, 'utf-8');
      fs.unlinkSync(tempFile);
      return { success: true, content: newContent };

    } else if (settings.editorPreference === 'custom') {
      // Parse custom command
      const command = settings.customEditorCommand.replace('{file}', tempFile);
      const parts = command.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      return new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: 'inherit', shell: true });

        child.on('error', (error) => {
          console.error('Error spawning editor:', error);
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {
            // ignore
          }
          resolve({ success: false, error: `Failed to launch editor: ${error.message}`, fallbackToBuiltin: true });
        });

        child.on('close', () => {
          try {
            const newContent = fs.readFileSync(tempFile, 'utf-8');
            fs.unlinkSync(tempFile);
            resolve({ success: true, content: newContent });
          } catch (error) {
            resolve({ success: false, error: (error as Error).message, fallbackToBuiltin: true });
          }
        });
      });
    } else {
      // builtin - shouldn't reach here but handle gracefully
      fs.unlinkSync(tempFile);
      return { success: false, useBuiltin: true };
    }
  } catch (error) {
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      // ignore
    }
    return { success: false, error: (error as Error).message, fallbackToBuiltin: true };
  }
});
