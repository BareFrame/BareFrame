const path = require('path');
const fs = require('fs');
const os = require('os');

function parseSemver(v) {
  return String(v || '0.0.0')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewerVersion(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function getPatchRoot() {
  if (process.env.BAREFRAME_PATCH_ROOT) return process.env.BAREFRAME_PATCH_ROOT;
  return path.join(process.env.LOCALAPPDATA || os.homedir(), 'BareFrame');
}

function cleanupOldPatches(patchesDir, keepDirName) {
  try {
    if (!fs.existsSync(patchesDir)) return;
    for (const entry of fs.readdirSync(patchesDir)) {
      if (keepDirName && entry === keepDirName) continue;
      try {
        fs.rmSync(path.join(patchesDir, entry), { recursive: true, force: true });
      } catch {}
    }
  } catch {}
}

/**
 * Resolve whether a verified newer patch should boot instead of bundled app-main.js.
 * Automatically cleans up stale patches after full installer upgrades.
 */
function resolvePatchEntry({ bundledVersion, isPackaged, electronVersion, patchRoot }) {
  const root = patchRoot || getPatchRoot();
  const activeFile = path.join(root, 'active-patch.json');
  const patchesDir = path.join(root, 'patches');

  if (!isPackaged && !process.env.BAREFRAME_PATCH_ROOT) {
    return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
  }

  if (!fs.existsSync(activeFile)) {
    return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
  }

  try {
    const meta = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
    const patchVer = meta && meta.version ? String(meta.version) : '';
    const dirName = meta && meta.dir ? String(meta.dir) : '';

    // If bundled version is >= patch version (e.g. user ran a newer full installer), prune stale patch
    if (!patchVer || !isNewerVersion(patchVer, bundledVersion)) {
      try { fs.unlinkSync(activeFile); } catch {}
      cleanupOldPatches(patchesDir, null);
      return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
    }

    // Require matching Electron major runtime
    const currentMajor = parseInt(String(electronVersion || '0').split('.')[0], 10) || 0;
    const patchMajor = parseInt(String(meta.electronMajor || '0'), 10) || 0;
    if (currentMajor > 0 && patchMajor > 0 && currentMajor !== patchMajor) {
      return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
    }

    // Validate safe single folder name
    if (!dirName || /[\\/:]/.test(dirName) || dirName.includes('..')) {
      try { fs.unlinkSync(activeFile); } catch {}
      return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
    }

    const patchDir = path.join(patchesDir, dirName);
    const patchPkgPath = path.join(patchDir, 'package.json');
    const patchEntry = path.join(patchDir, 'src', 'app-main.js');

    if (!fs.existsSync(patchPkgPath) || !fs.existsSync(patchEntry)) {
      try { fs.unlinkSync(activeFile); } catch {}
      return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
    }

    const patchPkg = JSON.parse(fs.readFileSync(patchPkgPath, 'utf8'));
    if (!patchPkg || patchPkg.version !== patchVer) {
      try { fs.unlinkSync(activeFile); } catch {}
      return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
    }

    return {
      mode: 'patch',
      version: patchVer,
      dirName,
      patchDir,
      patchesDir,
      activeFile,
      entry: patchEntry,
    };
  } catch {
    try { fs.unlinkSync(activeFile); } catch {}
    return { mode: 'bundled', entry: path.join(__dirname, 'app-main.js') };
  }
}

function boot() {
  const { app } = require('electron');
  const resolved = resolvePatchEntry({
    bundledVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    electronVersion: process.versions.electron,
  });

  if (resolved.mode === 'patch') {
    try {
      require(resolved.entry);
      // Clean up older superseded patch folders in background after boot
      setTimeout(() => cleanupOldPatches(resolved.patchesDir, resolved.dirName), 4000).unref();
      return;
    } catch (err) {
      // Auto-rollback corrupt patch so BareFrame always starts cleanly
      try { fs.unlinkSync(resolved.activeFile); } catch {}
      try { fs.rmSync(resolved.patchDir, { recursive: true, force: true }); } catch {}
      console.error('BareFrame patch rollback triggered:', err && err.message ? err.message : err);
    }
  }

  require('./app-main.js');
}

if (process.versions && process.versions.electron) {
  boot();
}

module.exports = { resolvePatchEntry, isNewerVersion, getPatchRoot, cleanupOldPatches };
