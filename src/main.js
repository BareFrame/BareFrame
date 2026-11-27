const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { runSystemAudit } = require('./engine/audit');
const { getTweakList, applyTweaks, revertTweaks, BACKUP_ROOT } = require('./engine/tweaks');
const { getValorantTelemetry } = require('./engine/telemetry');
const { runThrottleTest, getBiosGuide, rebootToBios } = require('./engine/throttle');
const { scanBackgroundHogs, purgeBackgroundHogs, launchValorant } = require('./engine/boost');
const { checkForUpdate, downloadUpdate } = require('./engine/updater');
const { runPS } = require('./engine/ps');
const supportConfig = require('./config/support');
const { spawn } = require('child_process');

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1020,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0B0E14',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

// Engine IPC
ipcMain.handle('audit:run', async () => {
  return runSystemAudit();
});

ipcMain.handle('tweaks:list', async () => {
  return getTweakList();
});

ipcMain.handle('tweaks:apply', async (_evt, ids) => {
  return applyTweaks(
    ids,
    (line) => mainWindow?.webContents.send('tweaks:log', line),
    (prog) => mainWindow?.webContents.send('tweaks:progress', prog)
  );
});

ipcMain.handle('tweaks:revert', async (_evt, ids) => {
  return revertTweaks(ids, (line) => {
    mainWindow?.webContents.send('tweaks:log', line);
  });
});

ipcMain.handle('telemetry:get', async () => {
  return getValorantTelemetry();
});

ipcMain.handle('throttle:run', async () => {
  return runThrottleTest((sample) => {
    mainWindow?.webContents.send('throttle:sample', sample);
  });
});

ipcMain.handle('bios:guide', async (_evt, vendor, model) => {
  return getBiosGuide(vendor, model);
});

ipcMain.handle('bios:reboot', async () => {
  return rebootToBios();
});

ipcMain.handle('system:reboot', async () => {
  return runPS(`shutdown /r /t 8 /c "BareFrame: Rebooting to apply kernel optimizations..."`);
});

ipcMain.handle('boost:scan', async () => {
  return scanBackgroundHogs();
});

ipcMain.handle('boost:purge', async (_evt, names) => {
  return purgeBackgroundHogs(names);
});

ipcMain.handle('boost:launchValorant', async () => {
  return launchValorant();
});

ipcMain.handle('backups:open', async () => {
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  await shell.openPath(BACKUP_ROOT);
  return BACKUP_ROOT;
});

ipcMain.handle('support:config', async () => {
  return supportConfig;
});

ipcMain.handle('external:open', async (_evt, url) => {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('updater:check', async () => {
  return checkForUpdate(app.getVersion());
});

ipcMain.handle('updater:install', async (_evt, { downloadUrl, latestVersion, isPortable }) => {
  if (!downloadUrl || !/^https:\/\/github\.com\//i.test(downloadUrl)) {
    throw new Error('Invalid update download URL');
  }
  const { path: exePath } = await downloadUpdate(
    downloadUrl,
    latestVersion,
    isPortable,
    app.getVersion(),
    (prog) => mainWindow?.webContents.send('updater:progress', prog)
  );
  // Launch the new installer/portable detached, then exit current app cleanly
  const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.quit(), 600);
  return { launched: true, exePath };
});
