import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import started from 'electron-squirrel-startup';

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

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
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
ipcMain.handle('save-file', async (_event, content: string, defaultName: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'YAML Files', extensions: ['yaml', 'yml'] }],
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
    filters: [{ name: 'YAML Files', extensions: ['yaml', 'yml'] }],
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
