const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frameforge', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  runAudit: () => ipcRenderer.invoke('audit:run'),
  getTweaks: () => ipcRenderer.invoke('tweaks:list'),
  applyTweaks: (ids) => ipcRenderer.invoke('tweaks:apply', ids),
  revertTweaks: (ids) => ipcRenderer.invoke('tweaks:revert', ids),
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

  scanHogs: () => ipcRenderer.invoke('boost:scan'),
  purgeHogs: (names) => ipcRenderer.invoke('boost:purge', names),
  launchValorant: () => ipcRenderer.invoke('boost:launchValorant'),
  openBackups: () => ipcRenderer.invoke('backups:open'),
  getSupportConfig: () => ipcRenderer.invoke('support:config'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
});
