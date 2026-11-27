const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Pure-Node parser for Valorant ShooterGame*.log files.
 * Extracts real match performance blocks (Avg Frametime/FPS, <240 dips, >240/>360/>480,
 * Engine Latency, GPU time, CPU/RAM util) to plot genuine before-vs-after progression.
 */
function parseValLogFile(filePath) {
  const stat = fs.statSync(filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  const blocks = [];
  const marker = 'End of Round Perf statistics';
  let idx = raw.indexOf(marker);

  while (idx !== -1) {
    const slice = raw.slice(idx, idx + 4500);
    const rhiEnd = slice.indexOf('RHI:');
    const chunk = rhiEnd !== -1 ? slice.slice(0, rhiEnd + 40) : slice;

    const getNum = (pattern) => {
      const m = chunk.match(pattern);
      return m ? parseFloat(m[1]) : 0;
    };

    const roundMatch = chunk.match(/Round (\d+) Performance:/);
    const totalFrames = getNum(/Total Frames:\s*(\d+)/);
    const totalTime = getNum(/Total Time\(secs\):\s*([\d.]+)/);
    const avgFrametime = getNum(/Avg\.Frametime \(ms\):\s*([\d.]+)/);

    // Filter out tiny menu/loading rounds (< 3000 frames or < 25s)
    if (totalFrames >= 3000 && totalTime >= 25 && avgFrametime > 0) {
      const gt144 = getNum(/Game Thread Frames Over 144 fps:\s*(\d+)/);
      const gt240 = getNum(/Game Thread Frames Over 240 fps:\s*(\d+)/);
      const gt360 = getNum(/Game Thread Frames Over 360 fps:\s*(\d+)/);
      const gt480 = getNum(/Game Thread Frames Over 480 fps:\s*(\d+)/);
      const gtUnder144 =
        getNum(/Game Thread Frames Under 1 fps:\s*(\d+)/) +
        getNum(/Game Thread Frames Over 1 fps:\s*(\d+)/) +
        getNum(/Game Thread Frames Over 10 fps:\s*(\d+)/) +
        getNum(/Game Thread Frames Over 15 fps:\s*(\d+)/) +
        getNum(/Game Thread Frames Over 30 fps:\s*(\d+)/) +
        getNum(/Game Thread Frames Over 60 fps:\s*(\d+)/) +
        getNum(/Game Thread Frames Over 120 fps:\s*(\d+)/);

      const over240 = gt240 + gt360 + gt480;
      const over360 = gt360 + gt480;
      const under240 = gt144 + gtUnder144;
      const gpuTime = getNum(/GPU Time\(mean\):\s*([\d.]+)/);
      const avgFps = Math.round(1000 / avgFrametime);
      const roundNum = roundMatch ? parseInt(roundMatch[1], 10) : 0;
      const mode = roundNum === 0 && totalTime >= 150 ? 'TDM / Continuous' : `5v5 (Rd ${roundNum})`;

      blocks.push({
        fileName: path.basename(filePath),
        timestamp: stat.mtime.toISOString(),
        dateLabel: stat.mtime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        mode,
        totalFrames,
        totalTimeSec: Math.round(totalTime),
        avgFrametimeMs: Number(avgFrametime.toFixed(2)),
        avgFps,
        pctUnder240: Number(((under240 / totalFrames) * 100).toFixed(1)),
        pctOver240: Number(((over240 / totalFrames) * 100).toFixed(1)),
        pctOver360: Number(((over360 / totalFrames) * 100).toFixed(2)),
        framesOver480: gt480,
        avgEngineLatencyMs: Number(getNum(/Avg\. Engine Latency \(ms\):\s*([\d.]+)/).toFixed(2)),
        avgWorkMs: Number(getNum(/Avg\. Work \(ms\):\s*([\d.]+)/).toFixed(2)),
        gpuTimeMs: Number(gpuTime.toFixed(2)),
        gpuCapacityFps: gpuTime > 0 ? Math.round(1000 / gpuTime) : 0,
        cpuUtilMean: Number(getNum(/Valorant CPU Util\(mean\):\s*([\d.]+)/).toFixed(0)),
        sysMemPct: Number(getNum(/System Memory Util\(mean\):\s*([\d.]+)/).toFixed(1)),
        bottleneck: gpuTime > 0 && avgFrametime > gpuTime * 1.45 ? 'CPU-Bound' : gpuTime > avgFrametime * 0.85 ? 'GPU-Bound' : 'Balanced',
      });
    }

    idx = raw.indexOf(marker, idx + marker.length);
  }

  return blocks;
}

function getValorantTelemetry() {
  const logsDir = path.join(os.homedir(), 'AppData', 'Local', 'VALORANT', 'Saved', 'Logs');
  if (!fs.existsSync(logsDir)) {
    return { installed: false, sessions: [], summary: null };
  }

  const files = fs
    .readdirSync(logsDir)
    .filter((f) => /^ShooterGame.*\.log$/i.test(f))
    .map((f) => {
      const full = path.join(logsDir, f);
      return { name: f, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime)
    .slice(-10);

  // Pick the most representative (longest/last) match block from each log session
  const sessions = [];
  for (const f of files) {
    try {
      const blocks = parseValLogFile(f.full);
      if (blocks.length > 0) {
        // Prefer longest TDM or latest substantial round
        const best = blocks.reduce((a, b) => (b.totalFrames >= a.totalFrames ? b : a), blocks[0]);
        sessions.push(best);
      }
    } catch {}
  }

  let summary = null;
  if (sessions.length > 0) {
    const first = sessions[0];
    const latest = sessions[sessions.length - 1];
    const fpsGainPct = first.avgFps > 0 ? Number((((latest.avgFps - first.avgFps) / first.avgFps) * 100).toFixed(1)) : 0;
    const dipReductionPct = first.pctUnder240 > 0 ? Number((((first.pctUnder240 - latest.pctUnder240) / first.pctUnder240) * 100).toFixed(1)) : 0;
    summary = {
      sessionCount: sessions.length,
      latestFps: latest.avgFps,
      latestFrametimeMs: latest.avgFrametimeMs,
      latestPctOver240: latest.pctOver240,
      latestPctUnder240: latest.pctUnder240,
      latestFramesOver480: latest.framesOver480,
      latestGpuCapacityFps: latest.gpuCapacityFps,
      latestBottleneck: latest.bottleneck,
      fpsGainPct,
      dipReductionPct,
    };
  }

  return { installed: true, logsDir, sessions, summary };
}

module.exports = { getValorantTelemetry };
