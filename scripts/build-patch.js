const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createZip } = require('../src/engine/zip');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function getElectronVersion() {
  try {
    const ePkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')
    );
    if (ePkg && ePkg.version) return String(ePkg.version);
  } catch {}
  const raw = (pkg.devDependencies && pkg.devDependencies.electron) || '35.0.0';
  return String(raw).replace(/^[^0-9]*/, '');
}

function walkFiles(dir, relBase) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = relBase ? `${relBase}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkFiles(full, rel));
    } else if (stat.isFile()) {
      out.push({ name: rel, data: fs.readFileSync(full) });
    }
  }
  return out;
}

function buildPatch() {
  const entries = [
    { name: 'package.json', data: fs.readFileSync(path.join(ROOT, 'package.json')) },
    ...walkFiles(path.join(ROOT, 'src'), 'src'),
  ];

  const iconPng = path.join(ROOT, 'assets', 'icon.png');
  if (fs.existsSync(iconPng)) {
    entries.push({ name: 'assets/icon.png', data: fs.readFileSync(iconPng) });
  }

  const zipBuf = createZip(entries);
  const sha256 = crypto.createHash('sha256').update(zipBuf).digest('hex');
  const electronVersion = getElectronVersion();
  const electronMajor = parseInt(electronVersion.split('.')[0], 10) || 35;

  fs.mkdirSync(DIST, { recursive: true });
  const zipPath = path.join(DIST, 'BareFrame-Patch.zip');
  const manifestPath = path.join(DIST, 'patch-manifest.json');

  fs.writeFileSync(zipPath, zipBuf);

  const manifest = {
    version: pkg.version,
    electronVersion,
    electronMajor,
    assetName: 'BareFrame-Patch.zip',
    sizeBytes: zipBuf.length,
    fileCount: entries.length,
    sha256,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(
    `Built BareFrame-Patch.zip v${manifest.version} (${(zipBuf.length / 1024).toFixed(1)} KB, ${entries.length} files, Electron ${electronVersion}, sha256=${sha256.slice(0, 12)}…)`
  );
  return { zipPath, manifestPath, manifest };
}

if (require.main === module) {
  buildPatch();
}

module.exports = { buildPatch };
