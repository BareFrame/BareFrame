const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { runSystemAudit } = require('./engine/audit');
const { getTweakList, applyTweaks, revertTweaks, BACKUP_ROOT } = require('./engine/tweaks');
const { getGameList, detectInstalledGames } = require('./engine/games');
const { getValorantTelemetry } = require('./engine/telemetry');
const { runThrottleTest, getBiosGuide, rebootToBios } = require('./engine/throttle');
const { scanBackgroundHogs, purgeBackgroundHogs, launchGame } = require('./engine/boost');
const { checkForUpdate, downloadUpdate, downloadAndApplyPatch } = require('./engine/updater');
const { runPS } = require('./engine/ps');
const supportConfig = require('./config/support');
const { spawn } = require('child_process');

// Resolve active version from local package.json so patched builds report their patched version
function getActiveVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    if (pkg && pkg.version) return String(pkg.version);
  } catch {}
  return app.getVersion();
}

const ACTIVE_VERSION = getActiveVersion();

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1020,
    minHeight: 680,
    frame: false,
    backgroundColor: '#1B2330',
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
ipcMain.handle('games:list', async () => {
  return getGameList();
});

ipcMain.handle('games:detect', async () => {
  return detectInstalledGames();
});

ipcMain.handle('audit:run', async (_evt, gameId) => {
  return runSystemAudit(gameId);
});

ipcMain.handle('tweaks:list', async (_evt, gameId) => {
  return getTweakList(gameId);
});

ipcMain.handle('tweaks:apply', async (_evt, ids, gameId) => {
  return applyTweaks(
    ids,
    (line) => mainWindow?.webContents.send('tweaks:log', line),
    (prog) => mainWindow?.webContents.send('tweaks:progress', prog),
    gameId
  );
});

ipcMain.handle('tweaks:revert', async (_evt, ids, gameId) => {
  return revertTweaks(ids, (line) => {
    mainWindow?.webContents.send('tweaks:log', line);
  }, gameId);
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

ipcMain.handle('boost:scan', async (_evt, gameId) => {
  return scanBackgroundHogs(gameId);
});

ipcMain.handle('boost:purge', async (_evt, names) => {
  return purgeBackgroundHogs(names);
});

ipcMain.handle('boost:launchGame', async (_evt, gameId) => {
  return launchGame(gameId);
});

ipcMain.handle('boost:launchValorant', async () => {
  return launchGame('valorant');
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

ipcMain.handle('app:version', () => ACTIVE_VERSION);

ipcMain.handle('system:relaunchAdmin', async () => {
  const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const escapedExe = exePath.replace(/'/g, "''");
  const isDev = !app.isPackaged;
  const argPart = isDev ? ` -ArgumentList '${process.cwd().replace(/'/g, "''")}'` : '';
  const res = await runPS(`Start-Process -FilePath '${escapedExe}'${argPart} -Verb RunAs`, { timeoutMs: 30000 });
  if (res.code === 0) {
    setTimeout(() => app.quit(), 450);
    return { ok: true };
  }
  return { ok: false, error: res.stderr || 'Elevation canceled' };
});

ipcMain.handle('updater:check', async () => {
  return checkForUpdate(ACTIVE_VERSION);
});

ipcMain.handle('updater:install', async (_evt, info) => {
  const {
    downloadUrl,
    latestVersion,
    isPortable,
    sizeBytes,
    updateType,
    patchSha256,
    electronMajor,
  } = info || {};

  if (!downloadUrl || !/^https:\/\/github\.com\/bareframe\/bareframe\//i.test(downloadUrl)) {
    throw new Error('Invalid update download URL');
  }

  // Fast verified patch update (~100-250 KB, instant relaunch, zero full reinstall)
  if (updateType === 'patch' && patchSha256) {
    await downloadAndApplyPatch({
      downloadUrl,
      latestVersion,
      patchSha256,
      electronMajor,
      currentVersion: ACTIVE_VERSION,
      expectedBytes: sizeBytes || 0,
      onProgress: (prog) => mainWindow?.webContents.send('updater:progress', prog),
    });

    mainWindow?.webContents.send('updater:progress', {
      pct: 100,
      receivedBytes: sizeBytes || 0,
      totalBytes: sizeBytes || 0,
      status: 'Patch applied — restarting BareFrame…',
    });

    const relaunchOpts = process.env.PORTABLE_EXECUTABLE_FILE
      ? { execPath: process.env.PORTABLE_EXECUTABLE_FILE }
      : undefined;

    app.relaunch(relaunchOpts);
    setTimeout(() => app.exit(0), 300);
    return { launched: true, mode: 'patch', version: latestVersion };
  }

  // Full Electron installer fallback (used only on major Electron runtime upgrades or legacy releases)
  const { path: downloadedExe } = await downloadUpdate(
    downloadUrl,
    latestVersion,
    isPortable,
    ACTIVE_VERSION,
    (prog) => mainWindow?.webContents.send('updater:progress', { ...prog, status: 'Downloading…' }),
    sizeBytes || 0
  );

  mainWindow?.webContents.send('updater:progress', {
    pct: 100,
    receivedMB: 0,
    totalMB: 0,
    status: 'Installing & restarting BareFrame…',
  });

  const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const installDir = path.dirname(currentExe);
  const batPath = path.join(os.tmpdir(), `bareframe-update-${Date.now()}.cmd`);

  let batContent;
  if (isPortable) {
    batContent = [
      '@echo off',
      'ping 127.0.0.1 -n 3 >nul',
      'taskkill /F /IM BareFrame.exe >nul 2>&1',
      'ping 127.0.0.1 -n 2 >nul',
      `copy /Y "${downloadedExe}" "${currentExe}" >nul 2>&1`,
      'if errorlevel 1 (',
      '  ping 127.0.0.1 -n 3 >nul',
      `  copy /Y "${downloadedExe}" "${currentExe}" >nul 2>&1`,
      ')',
      `if exist "${currentExe}" (`,
      `  del /f /q "${downloadedExe}" >nul 2>&1`,
      `  start "" "${currentExe}"`,
      ') else (',
      `  start "" "${downloadedExe}"`,
      ')',
      'del /f /q "%~f0" >nul 2>&1',
      '',
    ].join('\r\n');
  } else {
    batContent = [
      '@echo off',
      'ping 127.0.0.1 -n 3 >nul',
      'taskkill /F /IM BareFrame.exe >nul 2>&1',
      'ping 127.0.0.1 -n 2 >nul',
      `start "" /wait "${downloadedExe}" /S /currentuser /D=${installDir}`,
      'if errorlevel 1 (',
      '  ping 127.0.0.1 -n 3 >nul',
      `  start "" /wait "${downloadedExe}" /S /currentuser /D=${installDir}`,
      ')',
      'ping 127.0.0.1 -n 2 >nul',
      `del /f /q "${downloadedExe}" >nul 2>&1`,
      `if exist "${currentExe}" (`,
      `  start "" "${currentExe}"`,
      ') else (',
      '  start "" "%LOCALAPPDATA%\\Programs\\BareFrame\\BareFrame.exe"',
      ')',
      'del /f /q "%~f0" >nul 2>&1',
      '',
    ].join('\r\n');
  }

  fs.writeFileSync(batPath, batContent, 'ascii');

  const child = spawn('cmd.exe', ['/c', 'start', '""', '/min', `"${batPath}"`], {
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  });
  child.unref();

  setTimeout(() => app.exit(0), 400);
  return { launched: true, mode: 'full', exePath: downloadedExe };
});
