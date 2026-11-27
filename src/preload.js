const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frameforge', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  getGames: () => ipcRenderer.invoke('games:list'),
  detectGames: () => ipcRenderer.invoke('games:detect'),

  runAudit: (gameId) => ipcRenderer.invoke('audit:run', gameId),
  getTweaks: (gameId) => ipcRenderer.invoke('tweaks:list', gameId),
  applyTweaks: (ids, gameId) => ipcRenderer.invoke('tweaks:apply', ids, gameId),
  revertTweaks: (ids, gameId) => ipcRenderer.invoke('tweaks:revert', ids, gameId),
  onTweakLog: (cb) => {
    const handler = (_e, line) => cb(line);
    ipcRenderer.on('tweaks:log', handler);
    return () => ipcRenderer.removeListener('tweaks:log', handler);
  },
  onTweakProgress: (cb) => {
    const handler = (_e, prog) => cb(prog);
    ipcRenderer.on('tweaks:progress', handler);
    return () => ipcRenderer.removeListener('tweaks:progress', handler);
  },

  getTelemetry: () => ipcRenderer.invoke('telemetry:get'),

  runThrottleTest: () => ipcRenderer.invoke('throttle:run'),
  onThrottleSample: (cb) => {
    const handler = (_e, sample) => cb(sample);
    ipcRenderer.on('throttle:sample', handler);
    return () => ipcRenderer.removeListener('throttle:sample', handler);
  },
  getBiosGuide: (vendor, model) => ipcRenderer.invoke('bios:guide', vendor, model),
  rebootToBios: () => ipcRenderer.invoke('bios:reboot'),
  rebootWindows: () => ipcRenderer.invoke('system:reboot'),

  scanHogs: (gameId) => ipcRenderer.invoke('boost:scan', gameId),
  purgeHogs: (names) => ipcRenderer.invoke('boost:purge', names),
  launchGame: (gameId) => ipcRenderer.invoke('boost:launchGame', gameId),
  launchValorant: () => ipcRenderer.invoke('boost:launchValorant'),
  openBackups: () => ipcRenderer.invoke('backups:open'),
  getSupportConfig: () => ipcRenderer.invoke('support:config'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),

  getAppVersion: () => ipcRenderer.invoke('app:version'),
  relaunchAsAdmin: () => ipcRenderer.invoke('system:relaunchAdmin'),
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  installUpdate: (info) => ipcRenderer.invoke('updater:install', info),
  onUpdateProgress: (cb) => {
    const handler = (_e, prog) => cb(prog);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
});
