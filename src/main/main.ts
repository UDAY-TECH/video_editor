import { app, BrowserWindow, shell, protocol, ipcMain } from 'electron';
import { join } from 'path';
import { handleMediaRequest } from './mediaProtocol';
import { registerMediaIpc } from './ipc/media';
import { registerProjectIpc } from './ipc/project';
import { registerExportIpc, cancelAllExportJobs } from './ipc/export';

// Window ids that have already been confirmed for closing (either no unsaved
// changes, or the user chose to discard them), so the 'close' guard below
// doesn't re-prompt on the resulting programmatic win.close() call.
const confirmedCloseWindowIds = new Set<number>();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (confirmedCloseWindowIds.has(mainWindow.id)) return;
    event.preventDefault();
    mainWindow.webContents.send('app:checkUnsavedBeforeClose');
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle('media', handleMediaRequest);

  registerMediaIpc();
  registerProjectIpc();
  registerExportIpc();

  ipcMain.on('app:confirmCloseResult', (event, shouldClose: boolean) => {
    if (!shouldClose) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    // The close is definitely proceeding past this point - stop any
    // in-progress export now rather than orphaning its ffmpeg process.
    cancelAllExportJobs();
    confirmedCloseWindowIds.add(win.id);
    win.close();
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
