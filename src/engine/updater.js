const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function httpsGetJson(url, userAgent) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': userAgent, Accept: 'application/vnd.github+json' }, timeout: 15000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(httpsGetJson(res.headers.location, userAgent));
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

function downloadFileWithProgress(url, destPath, userAgent, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': userAgent }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        return resolve(downloadFileWithProgress(res.headers.location, destPath, userAgent, onProgress, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastEmit = 0;
      const file = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (onProgress && (now - lastEmit > 120 || received === totalBytes)) {
          lastEmit = now;
          const pct = totalBytes > 0 ? Math.min(100, Math.round((received / totalBytes) * 100)) : 0;
          onProgress({
            pct,
            receivedMB: Number((received / 1048576).toFixed(1)),
            totalMB: Number((totalBytes / 1048576).toFixed(1)),
          });
        }
      });

      res.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          if (received < 10 * 1024 * 1024) {
            try { fs.unlinkSync(destPath); } catch {}
            return reject(new Error('Downloaded file was incomplete or corrupted.'));
          }
          resolve({ path: destPath, sizeBytes: received });
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
  const asset =
    assets.find((a) => a.name.toLowerCase() === preferredName.toLowerCase()) ||
    assets.find((a) => /\.exe$/i.test(a.name));

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    isPortable,
    releaseUrl: release.html_url || `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    downloadUrl: asset ? asset.browser_download_url : null,
    assetName: asset ? asset.name : preferredName,
    sizeMB: asset ? Number((asset.size / 1048576).toFixed(1)) : 0,
    notes: (release.body || '').trim().slice(0, 600),
  };
}

async function downloadUpdate(downloadUrl, latestVersion, isPortable, currentVersion, onProgress) {
  const safeVer = String(latestVersion || 'latest').replace(/[^0-9A-Za-z._-]/g, '');
  const fileName = isPortable ? `BareFrame-Portable-${safeVer}.exe` : `BareFrame-Setup-${safeVer}.exe`;
  const destPath = path.join(os.tmpdir(), fileName);
  return downloadFileWithProgress(downloadUrl, destPath, `BareFrame/${currentVersion}`, onProgress);
}

module.exports = { checkForUpdate, downloadUpdate, isNewerVersion };
