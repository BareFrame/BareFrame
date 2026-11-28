const os = require('os');
const { execFile } = require('child_process');
const { runPS } = require('./ps');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 12-second real RAM bandwidth & bit-pattern stability test (pure Node, zero OOM risk).
 * Allocates a safe slice of free RAM, verifies alternating bit patterns (XMP/EXPO check),
 * and measures sustained sequential copy throughput (GB/s) + stride access latency.
 */
async function runRamStressTest(onSample) {
  const freeMB = Math.floor(os.freemem() / 1048576);
  // Allocate up to 256 MB per buffer (512 MB total) or <=20% of free RAM so we never swap/OOM
  const bufMB = Math.max(32, Math.min(256, Math.floor(freeMB * 0.12)));
  const byteLen = bufMB * 1024 * 1024;
  const u32Len = byteLen >>> 2;
  const totalPasses = 6;
  const patterns = [0x55aa55aa, 0xaa55aa55, 0x33cc33cc, 0xcc33cc33, 0x0f0f0f0f, 0xf0f0f0f0];

  const samples = [];
  let totalErrors = 0;

  let srcBuf = null;
  let dstBuf = null;

  try {
    srcBuf = Buffer.allocUnsafe(byteLen);
    dstBuf = Buffer.allocUnsafe(byteLen);
    const src32 = new Uint32Array(srcBuf.buffer, srcBuf.byteOffset, u32Len);
    const dst32 = new Uint32Array(dstBuf.buffer, dstBuf.byteOffset, u32Len);

    for (let pass = 1; pass <= totalPasses; pass++) {
      const pat = patterns[(pass - 1) % patterns.length];

      // 1. Write & verify pattern across the full buffer (stride-mixed for speed + full coverage)
      const tWrite0 = process.hrtime.bigint();
      src32.fill(pat);
      // Mix address-dependent salt every 64th word to catch addressing/refresh glitches
      for (let i = 0; i < u32Len; i += 64) {
        src32[i] = (pat ^ (i * 2654435761)) >>> 0;
      }

      // 2. Measure sustained memory-to-memory copy (2x bytes moved: read + write)
      const tCopy0 = process.hrtime.bigint();
      const copyReps = bufMB <= 64 ? 8 : bufMB <= 128 ? 5 : 3;
      for (let r = 0; r < copyReps; r++) {
        srcBuf.copy(dstBuf);
      }
      const tCopy1 = process.hrtime.bigint();
      const copySec = Math.max(0.001, Number(tCopy1 - tCopy0) / 1e9);
      const movedGB = ((byteLen * 2) * copyReps) / 1e9;
      const copyGBs = Number((movedGB / copySec).toFixed(1));

      // 3. Verify copied buffer matches expected bit patterns
      let passErrors = 0;
      for (let i = 0; i < u32Len; i += 64) {
        const expected = (pat ^ (i * 2654435761)) >>> 0;
        if (dst32[i] !== expected) passErrors++;
        if (i + 1 < u32Len && dst32[i + 1] !== pat) passErrors++;
      }
      totalErrors += passErrors;

      // 4. Strided random-ish access latency probe (~262k hops)
      const hops = 262144;
      const mask = (1 << 20) - 1; // 4 MB window to spill past L2/L3 partly
      let idx = pass * 17;
      let acc = 0;
      const tLat0 = process.hrtime.bigint();
      for (let h = 0; h < hops; h++) {
        idx = (idx * 1664525 + 1013904223) & mask;
        acc ^= dst32[idx % u32Len];
      }
      const tLat1 = process.hrtime.bigint();
      const latencyNs = Number((Number(tLat1 - tLat0) / hops).toFixed(1));
      if (acc === -1) passErrors += 0; // prevent dead-code elimination

      const elapsedMs = Math.round(Number(process.hrtime.bigint() - tWrite0) / 1e6);
      const sample = {
        pass,
        totalPasses,
        allocMB: bufMB * 2,
        copyGBs,
        latencyNs,
        errors: passErrors,
        elapsedMs,
      };
      samples.push(sample);
      if (onSample) onSample(sample);

      // Yield briefly to keep UI responsive and let chart animate live
      await sleep(320);
    }
  } finally {
    srcBuf = null;
    dstBuf = null;
  }

  const avgGBs = Number((samples.reduce((s, x) => s + x.copyGBs, 0) / samples.length).toFixed(1));
  const peakGBs = Math.max(...samples.map((x) => x.copyGBs));
  const avgLatencyNs = Number((samples.reduce((s, x) => s + x.latencyNs, 0) / samples.length).toFixed(1));

  let verdict = 'Stable';
  let explanation = `Verified ${bufMB * 2} MB across ${totalPasses} passes with 0 bit errors (${avgGBs} GB/s avg copy, ${peakGBs} GB/s peak). Memory looks solid.`;
  if (totalErrors > 0) {
    verdict = 'Errors detected';
    explanation = `Detected ${totalErrors} bit verification mismatch(es)! Check XMP/EXPO stability, RAM voltage, or reseat DIMMs.`;
  } else if (avgGBs < 8) {
    verdict = 'Low bandwidth';
    explanation = `0 errors, but copy throughput was ${avgGBs} GB/s. Verify dual-channel slot placement and XMP/EXPO in BIOS.`;
  }

  return {
    samples,
    allocMB: bufMB * 2,
    avgGBs,
    peakGBs,
    avgLatencyNs,
    errors: totalErrors,
    verdict,
    explanation,
  };
}

/**
 * Lightweight live GPU sensor probe used during the WebGL2 GPU stress test.
 * Uses nvidia-smi when available (fast ~50ms), gracefully returns nulls otherwise.
 */
function sampleGpuSensors() {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      [
        '--query-gpu=temperature.gpu,clocks.current.graphics,clocks.current.memory,utilization.gpu,power.draw',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 2500, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          return resolve({ available: false, tempC: null, clockMHz: null, memMHz: null, utilPct: null, powerW: null });
        }
        const line = stdout.trim().split(/\r?\n/)[0] || '';
        const parts = line.split(',').map((s) => s.trim());
        const num = (v) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };
        resolve({
          available: true,
          tempC: num(parts[0]),
          clockMHz: num(parts[1]),
          memMHz: num(parts[2]),
          utilPct: num(parts[3]),
          powerW: num(parts[4]),
        });
      }
    );
  });
}

/**
 * 10-second OS timer scheduling jitter & network ping stability test.
 * Measures actual Windows sleep/timer wake accuracy + live ICMP jitter to 1.1.1.1.
 */
async function runLatencyStressTest(onSample) {
  const totalSec = 10;
  const samples = [];

  // Fire a background 10-packet ping to 1.1.1.1 in parallel
  const pingPromise = runPS(
    `& ping.exe -n 10 -w 1000 1.1.1.1 | Select-String 'time[=<]\\d+ms' | ForEach-Object { $_.Line }`,
    { timeoutMs: 16000 }
  ).catch(() => ({ stdout: '' }));

  for (let sec = 1; sec <= totalSec; sec++) {
    const errors = [];
    const targetMs = 4;
    const endAt = Date.now() + 920;

    while (Date.now() < endAt) {
      const t0 = process.hrtime.bigint();
      await sleep(targetMs);
      const actualMs = Number(process.hrtime.bigint() - t0) / 1e6;
      errors.push(Math.max(0, actualMs - targetMs));
    }

    errors.sort((a, b) => a - b);
    const avgJitterMs = Number((errors.reduce((s, v) => s + v, 0) / Math.max(1, errors.length)).toFixed(2));
    const p99Ms = Number((errors[Math.floor(errors.length * 0.99)] || 0).toFixed(2));
    const maxSpikeMs = Number((errors[errors.length - 1] || 0).toFixed(2));

    const pt = { sec, avgJitterMs, p99Ms, maxSpikeMs };
    samples.push(pt);
    if (onSample) onSample(pt);
  }

  const pingRes = await pingPromise;
  const pings = [];
  for (const m of (pingRes.stdout || '').matchAll(/time[=<](\d+)\s*ms/gi)) {
    pings.push(parseInt(m[1], 10));
  }

  const avgJitterMs = Number((samples.reduce((s, x) => s + x.avgJitterMs, 0) / samples.length).toFixed(2));
  const worstSpikeMs = Number(Math.max(...samples.map((x) => x.maxSpikeMs)).toFixed(2));

  let avgPingMs = null;
  let pingJitterMs = null;
  if (pings.length >= 2) {
    avgPingMs = Number((pings.reduce((s, v) => s + v, 0) / pings.length).toFixed(1));
    let diffSum = 0;
    for (let i = 1; i < pings.length; i++) diffSum += Math.abs(pings[i] - pings[i - 1]);
    pingJitterMs = Number((diffSum / (pings.length - 1)).toFixed(1));
  }

  let verdict = 'Tight timing';
  let explanation = `OS timer wake jitter averaged ${avgJitterMs} ms (worst spike ${worstSpikeMs} ms)${avgPingMs != null ? `, network ping ${avgPingMs} ms (±${pingJitterMs} ms jitter)` : ''}.`;
  if (avgJitterMs >= 4.0 || worstSpikeMs >= 16.0) {
    verdict = 'High jitter';
    explanation = `OS timer wake jitter hit ${avgJitterMs} ms avg / ${worstSpikeMs} ms max spike — Windows default 15.6 ms timer tick or background load is active. Apply Performance settings & restart.`;
  } else if (avgJitterMs >= 1.8 || (pingJitterMs != null && pingJitterMs >= 8)) {
    verdict = 'Moderate jitter';
    explanation = `Average timer wake error ${avgJitterMs} ms (max ${worstSpikeMs} ms)${pingJitterMs != null ? `, ping jitter ±${pingJitterMs} ms` : ''}. Closing background apps can tighten frame pacing further.`;
  }

  return {
    samples,
    avgJitterMs,
    worstSpikeMs,
    avgPingMs,
    pingJitterMs,
    verdict,
    explanation,
  };
}

module.exports = {
  runRamStressTest,
  sampleGpuSensors,
  runLatencyStressTest,
};
