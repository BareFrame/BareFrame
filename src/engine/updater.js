const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { extractZip } = require('./zip');

const REPO_OWNER = 'BareFrame';
const REPO_NAME = 'BareFrame';

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

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b <= 0) return '';
  if (b < 1024 * 1024) {
    return `${Math.max(1, Math.round(b / 1024))} KB`;
  }
  return `${(b / 1048576).toFixed(1)} MB`;
}

function getPatchRoot() {
  if (process.env.BAREFRAME_PATCH_ROOT) return process.env.BAREFRAME_PATCH_ROOT;
  return path.join(process.env.LOCALAPPDATA || os.homedir(), 'BareFrame');
}

function getCurrentElectronMajor() {
  if (process.versions && process.versions.electron) {
    return parseInt(String(process.versions.electron).split('.')[0], 10) || 0;
  }
  return 0;
}

function httpsGetJson(url, userAgent, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (!/^https:\/\//i.test(url)) {
      return reject(new Error('Refused non-HTTPS URL'));
    }
    const req = https.get(
      url,
      { headers: { 'User-Agent': userAgent, Accept: 'application/vnd.github+json, application/json' }, timeout: 15000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          return resolve(httpsGetJson(res.headers.location, userAgent, redirectsLeft - 1));
        }
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Update check timed out'));
    });
    req.on('error', reject);
  });
}

function downloadFileWithProgress(
  url,
  destPath,
  userAgent,
  onProgress,
  { expectedBytes = 0, minBytes = 10 * 1024 * 1024, redirectsLeft = 5 } = {}
) {
  return new Promise((resolve, reject) => {
    if (!/^https:\/\//i.test(url)) {
      return reject(new Error('Refused non-HTTPS download URL'));
    }
    const req = https.get(url, { headers: { 'User-Agent': userAgent }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        return resolve(
          downloadFileWithProgress(res.headers.location, destPath, userAgent, onProgress, {
            expectedBytes,
            minBytes,
            redirectsLeft: redirectsLeft - 1,
          })
        );
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      const headerBytes = parseInt(res.headers['content-length'] || '0', 10);
      const totalBytes = headerBytes > 0 ? headerBytes : (expectedBytes || 0);
      let received = 0;
      let lastEmit = 0;
      const startedAt = Date.now();
      const hash = crypto.createHash('sha256');
      const file = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        received += chunk.length;
        hash.update(chunk);
        const now = Date.now();
        if (onProgress && (now - lastEmit > 80 || (totalBytes > 0 && received >= totalBytes))) {
          lastEmit = now;
          const elapsedSec = Math.max(0.15, (now - startedAt) / 1000);
          const speedBytesPerSec = received / elapsedSec;
          const speedMBps = Number((speedBytesPerSec / 1048576).toFixed(1));
          const pct = totalBytes > 0 ? Math.min(100, Math.round((received / totalBytes) * 100)) : 0;
          onProgress({
            pct,
            receivedBytes: received,
            totalBytes,
            receivedMB: Number((received / 1048576).toFixed(1)),
            totalMB: Number((totalBytes / 1048576).toFixed(1)),
            receivedDisplay: formatBytes(received),
            totalDisplay: formatBytes(totalBytes),
            speedMBps,
            status: 'Downloading…',
          });
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          if (received < minBytes) {
            try { fs.unlinkSync(destPath); } catch {}
            return reject(new Error('Downloaded file was incomplete or corrupted.'));
          }
          resolve({
            path: destPath,
            sizeBytes: received,
            sha256: hash.digest('hex'),
          });
        });
      });

      file.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timed out'));
    });
    req.on('error', reject);
  });
}

async function checkForUpdate(currentVersion) {
  const ua = `BareFrame/${currentVersion}`;
  const release = await httpsGetJson(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    ua
  );

  const latestTag = release.tag_name || '';
  const latestVersion = latestTag.replace(/^v/i, '');
  const hasUpdate = isNewerVersion(latestVersion, currentVersion);

  const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  const preferredName = isPortable ? 'BareFrame-Portable.exe' : 'BareFrame-Setup.exe';
  const assets = Array.isArray(release.assets) ? release.assets : [];

  const fullAsset =
    assets.find((a) => a.name.toLowerCase() === preferredName.toLowerCase()) ||
    assets.find((a) => /\.exe$/i.test(a.name));

  // Prefer lightweight verified patch (~100-250 KB) when Electron runtime major matches
  const patchAsset = assets.find((a) => a.name.toLowerCase() === 'bareframe-patch.zip');
  const manifestAsset = assets.find((a) => a.name.toLowerCase() === 'patch-manifest.json');
  const currentElectronMajor = getCurrentElectronMajor();

  if (hasUpdate && patchAsset && manifestAsset) {
    try {
      const manifest = await httpsGetJson(manifestAsset.browser_download_url, ua);
      const manifestVer = String(manifest.version || '').replace(/^v/i, '');
      const manifestMajor = parseInt(String(manifest.electronMajor || '0'), 10) || 0;
      const validSha = typeof manifest.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(manifest.sha256);
      const runtimeMatches = currentElectronMajor === 0 || manifestMajor === 0 || manifestMajor === currentElectronMajor;

      if (manifestVer === latestVersion && validSha && runtimeMatches) {
        const sizeBytes = patchAsset.size || manifest.sizeBytes || 0;
        return {
          hasUpdate,
          currentVersion,
          latestVersion,
          isPortable,
          updateType: 'patch',
          releaseUrl: release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
          downloadUrl: patchAsset.browser_download_url,
          assetName: patchAsset.name,
          sizeBytes,
          sizeMB: Number((sizeBytes / 1048576).toFixed(2)),
          sizeDisplay: formatBytes(sizeBytes),
          patchSha256: manifest.sha256.toLowerCase(),
          electronMajor: manifestMajor || currentElectronMajor,
          notes: (release.body || '').trim().slice(0, 600),
        };
      }
    } catch {
      // Fall through cleanly to full installer if manifest cannot be verified
    }
  }

  const sizeBytes = fullAsset ? fullAsset.size : 0;
  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    isPortable,
    updateType: 'full',
    releaseUrl: release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    downloadUrl: fullAsset ? fullAsset.browser_download_url : null,
    assetName: fullAsset ? fullAsset.name : preferredName,
    sizeBytes,
    sizeMB: sizeBytes ? Number((sizeBytes / 1048576).toFixed(1)) : 0,
    sizeDisplay: formatBytes(sizeBytes),
    notes: (release.body || '').trim().slice(0, 600),
  };
}

async function downloadUpdate(downloadUrl, latestVersion, isPortable, currentVersion, onProgress, expectedBytes = 0) {
  const safeVer = String(latestVersion || 'latest').replace(/[^0-9A-Za-z._-]/g, '');
  const fileName = isPortable ? `BareFrame-Portable-${safeVer}.exe` : `BareFrame-Setup-${safeVer}.exe`;
  const destPath = path.join(os.tmpdir(), fileName);
  return downloadFileWithProgress(downloadUrl, destPath, `BareFrame/${currentVersion}`, onProgress, {
    expectedBytes,
    minBytes: 10 * 1024 * 1024,
  });
}

/**
 * Extract, verify, and atomically activate a downloaded BareFrame-Patch.zip buffer/file.
 */
function applyPatchArchive({ zipPath, expectedSha256, latestVersion, electronMajor, patchRoot }) {
  const root = patchRoot || getPatchRoot();
  const patchesDir = path.join(root, 'patches');
  const activeFile = path.join(root, 'active-patch.json');
  const safeVer = String(latestVersion || 'latest').replace(/[^0-9A-Za-z._-]/g, '');
  const ts = Date.now();
  const stagingDir = path.join(patchesDir, `.staging-${safeVer}-${ts}`);

  fs.mkdirSync(patchesDir, { recursive: true });

  const zipBuf = fs.readFileSync(zipPath);
  const actualSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
  if (expectedSha256 && actualSha.toLowerCase() !== String(expectedSha256).toLowerCase()) {
    throw new Error('Patch integrity check failed (SHA-256 mismatch).');
  }

  try {
    extractZip(zipBuf, stagingDir);

    // Verify required files are present before activating
    const requiredFiles = [
      'package.json',
      'src/app-main.js',
      'src/preload.js',
      'src/renderer/index.html',
      'src/renderer/app.js',
    ];
    for (const rel of requiredFiles) {
      if (!fs.existsSync(path.join(stagingDir, rel))) {
        throw new Error(`Incomplete patch archive (missing ${rel}).`);
      }
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(stagingDir, 'package.json'), 'utf8'));
    if (!pkg || String(pkg.version) !== String(latestVersion)) {
      throw new Error(`Patch version mismatch (expected ${latestVersion}, got ${pkg && pkg.version}).`);
    }

    // Move into versioned directory (append timestamp if existing folder is locked)
    let finalDirName = `v${safeVer}`;
    let finalDir = path.join(patchesDir, finalDirName);
    if (fs.existsSync(finalDir)) {
      try {
        fs.rmSync(finalDir, { recursive: true, force: true });
      } catch {
        finalDirName = `v${safeVer}-${ts}`;
        finalDir = path.join(patchesDir, finalDirName);
      }
    }
    fs.renameSync(stagingDir, finalDir);

    // Atomically swap active-patch.json pointer
    const meta = {
      version: String(latestVersion),
      dir: finalDirName,
      electronVersion: (process.versions && process.versions.electron) || '',
      electronMajor: Number(electronMajor) || getCurrentElectronMajor(),
      sha256: actualSha,
      appliedAt: new Date().toISOString(),
    };
    const tmpMeta = `${activeFile}.${ts}.tmp`;
    fs.writeFileSync(tmpMeta, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpMeta, activeFile);

    return { applied: true, version: meta.version, patchDir: finalDir, activeFile };
  } catch (err) {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

async function downloadAndApplyPatch({
  downloadUrl,
  latestVersion,
  patchSha256,
  electronMajor,
  currentVersion,
  onProgress,
  expectedBytes = 0,
  patchRoot,
}) {
  if (!patchSha256 || !/^[a-f0-9]{64}$/i.test(patchSha256)) {
    throw new Error('Missing or invalid patch SHA-256 digest.');
  }
  const safeVer = String(latestVersion || 'latest').replace(/[^0-9A-Za-z._-]/g, '');
  const zipPath = path.join(os.tmpdir(), `BareFrame-Patch-${safeVer}-${Date.now()}.zip`);

  try {
    const dl = await downloadFileWithProgress(
      downloadUrl,
      zipPath,
      `BareFrame/${currentVersion}`,
      onProgress,
      { expectedBytes, minBytes: 4096 }
    );

    if (dl.sha256.toLowerCase() !== patchSha256.toLowerCase()) {
      throw new Error('Patch integrity check failed (SHA-256 mismatch).');
    }

    if (onProgress) {
      onProgress({
        pct: 100,
        receivedBytes: dl.sizeBytes,
        totalBytes: dl.sizeBytes,
        receivedDisplay: formatBytes(dl.sizeBytes),
        totalDisplay: formatBytes(dl.sizeBytes),
        speedMBps: 0,
        status: 'Verifying & applying patch…',
      });
    }

    return applyPatchArchive({
      zipPath,
      expectedSha256: patchSha256,
      latestVersion,
      electronMajor,
      patchRoot,
    });
  } finally {
    try { fs.unlinkSync(zipPath); } catch {}
  }
}

module.exports = {
  checkForUpdate,
  downloadUpdate,
  downloadAndApplyPatch,
  applyPatchArchive,
  isNewerVersion,
  formatBytes,
  getPatchRoot,
};
