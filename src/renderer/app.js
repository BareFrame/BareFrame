const state = {
  audit: null,
  tweaks: [],
  selectedTweaks: new Set(),
  throttleSamples: [],
  telemetry: null,
  hogs: [],
  support: null,
};

const $ = (id) => document.getElementById(id);

function showToast(msg, duration = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), duration);
}

function confirmModal(title, body) {
  return new Promise((resolve) => {
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    $('modal-backdrop').classList.remove('hidden');
    const cleanup = (val) => {
      $('modal-backdrop').classList.add('hidden');
      $('modal-cancel').onclick = null;
      $('modal-confirm').onclick = null;
      resolve(val);
    };
    $('modal-cancel').onclick = () => cleanup(false);
    $('modal-confirm').onclick = () => cleanup(true);
  });
}

// Window Controls
$('btn-min').onclick = () => window.frameforge.minimize();
$('btn-max').onclick = () => window.frameforge.maximize();
$('btn-close').onclick = () => window.frameforge.close();
$('btn-open-backups').onclick = () => window.frameforge.openBackups();

// Tab Navigation
function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
  if (tabId === 'telemetry' && !state.telemetry) loadTelemetry();
  if (tabId === 'boost') loadHogs();
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});
$('btn-quick-opt').onclick = () => switchTab('tweaks');

// ---------------- AUDIT / OVERVIEW ----------------
async function loadAudit() {
  $('btn-rescan').disabled = true;
  $('btn-rescan').textContent = 'Scanning…';
  try {
    const data = await window.frameforge.runAudit();
    state.audit = data;
    renderAudit(data);
    renderTweaks();
    loadBiosGuide(data.hardware.boardVendor, data.hardware.boardModel);
  } catch (err) {
    showToast(`Audit error: ${err.message}`);
  } finally {
    $('btn-rescan').disabled = false;
    $('btn-rescan').textContent = 'Re-Scan PC';
  }
}

function renderAudit(d) {
  const badge = $('admin-badge');
  if (d.isAdmin) {
    badge.textContent = '● Administrator Active';
    badge.className = 'admin-badge is-admin';
  } else {
    badge.textContent = '▲ Standard User (Run as Admin for kernel tweaks)';
    badge.className = 'admin-badge no-admin';
  }

  // Score ring
  const circ = 364.4;
  const offset = circ - (circ * d.score) / 100;
  const ring = $('score-ring-fg');
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = d.score >= 85 ? '#00E5A0' : d.score >= 60 ? '#F59E0B' : '#FF4655';
  $('score-num').textContent = d.score;
  $('score-verdict').textContent =
    d.score >= 90 ? 'Tournament Ready' : d.score >= 70 ? 'Well Optimized' : d.score >= 45 ? 'Bottlenecks Found' : 'Heavy Overhead';
  const doneCount = Object.values(d.status).filter(Boolean).length;
  const totalCount = Object.keys(d.status).length;
  $('score-sub').textContent = `${doneCount}/${totalCount} subsystems optimized`;
  $('nav-tweaks-badge').textContent = `${doneCount}/${totalCount}`;

  // Hardware
  const h = d.hardware;
  $('hw-cpu').textContent = `${h.cpuName} (${h.cpuCores}C/${h.cpuThreads}T)`;
  $('hw-gpu').textContent = `${h.gpuName}${h.gpuTempC != null ? ` · ${h.gpuTempC}°C` : ''}`;
  $('hw-ram').textContent = `${h.ramTotalGB} GB (${h.ramSticks}× stick @ ${h.ramSpeedMHz} MHz · ${h.ramFreeGB} GB free)`;
  $('hw-board').textContent = `${h.boardVendor} ${h.boardModel} (BIOS ${h.biosVersion})`;
  $('hw-disp').textContent = `${h.resolution} @ ${h.refreshRate}Hz · ReBAR ${h.rebarMB >= 4096 ? `${Math.round(h.rebarMB / 1024)} GB ON` : 'Check BIOS'}`;
  $('hw-sys').textContent = `${h.activePowerPlan} · ${h.nicName} · VBS ${d.details.vbsStatus === 0 ? 'OFF (Bare Metal)' : 'ON'}`;

  // Bottlenecks
  const list = $('bottlenecks-list');
  const countPill = $('bottleneck-count');
  if (d.bottlenecks.length === 0) {
    countPill.textContent = '0 Bottlenecks';
    countPill.className = 'pill-green';
    list.innerHTML = `<div class="empty-state" style="color:#00E5A0;">All audited Windows, hardware, and Valorant subsystems are tuned for bare-metal performance!</div>`;
  } else {
    countPill.textContent = `${d.bottlenecks.length} Found`;
    countPill.className = 'pill-amber';
    list.innerHTML = d.bottlenecks
      .map(
        (b) => `
      <div class="bottleneck-item">
        <span class="${b.severity === 'HIGH' ? 'pill-red' : b.severity === 'MED' ? 'pill-amber' : 'pill-cyan'}">${b.severity}</span>
        <div>
          <div class="bottleneck-title">${b.title}</div>
          <div class="bottleneck-detail">${b.detail}</div>
        </div>
      </div>`
      )
      .join('');
  }
}

$('btn-rescan').onclick = loadAudit;

// ---------------- TWEAKS ----------------
async function initTweaks() {
  state.tweaks = await window.frameforge.getTweaks();
  state.tweaks.forEach((t) => {
    if (!t.optIn) state.selectedTweaks.add(t.id);
  });
  renderTweaks();
}

function renderTweaks() {
  const container = $('tweaks-list');
  if (!state.tweaks.length) return;
  const statusMap = state.audit?.status || {};

  container.innerHTML = state.tweaks
    .map((t) => {
      const done = Boolean(statusMap[t.id]);
      const checked = state.selectedTweaks.has(t.id) ? 'checked' : '';
      const impactCls = t.impact.includes('HIGH') ? 'pill-red' : 'pill-cyan';
      const safetyCls = t.optIn ? 'pill-amber' : 'pill-green';
      return `
      <label class="tweak-row ${t.optIn ? 'opt-in' : ''}">
        <input type="checkbox" class="tweak-check" data-id="${t.id}" ${checked} />
        <div class="tweak-info">
          <div class="tweak-top">
            <span class="tweak-name">${t.name}</span>
            <span class="${impactCls}">${t.impact}</span>
            <span class="${safetyCls}">${t.safety}</span>
            ${t.requiresReboot ? '<span class="pill-neutral">Reboot</span>' : ''}
          </div>
          <div class="tweak-desc">${t.description}</div>
        </div>
        <div class="tweak-status">
          <span class="${done ? 'pill-green' : 'pill-neutral'}">${done ? 'OPTIMIZED' : 'STOCK'}</span>
        </div>
      </label>`;
    })
    .join('');

  container.querySelectorAll('.tweak-check').forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) state.selectedTweaks.add(chk.dataset.id);
      else state.selectedTweaks.delete(chk.dataset.id);
    };
  });
}

$('btn-select-safe').onclick = () => {
  state.selectedTweaks.clear();
  state.tweaks.forEach((t) => {
    if (!t.optIn) state.selectedTweaks.add(t.id);
  });
  renderTweaks();
};

window.frameforge.onTweakLog((line) => {
  const pre = $('tweak-console');
  pre.textContent += `\n${line}`;
  pre.scrollTop = pre.scrollHeight;
});

window.frameforge.onTweakProgress((prog) => {
  $('hero-progress-label').textContent = prog.label;
  $('hero-progress-pct').textContent = `${prog.pct}%`;
  $('hero-progress-fill').style.width = `${prog.pct}%`;
  $('hero-progress-step').textContent = `Step ${Math.min(prog.step, prog.total)} of ${prog.total}`;
});

function renderResultsBreakdown(res) {
  const card = $('hero-results-card');
  const list = $('hero-results-list');
  $('hero-results-title').textContent = `✓ Optimization Complete — ${res.applied} Modules Applied`;
  $('hero-results-sub').textContent = res.requiresReboot
    ? 'Reboot your PC once so kernel, timer, and Bare-Metal changes activate completely. (For BIOS power limits, open BIOS Unlock Guide.)'
    : 'All optimizations are live immediately. Backup & Restore Point saved.';

  list.innerHTML = (res.results || [])
    .map((r) => {
      const cls = r.status === 'DONE' ? '' : r.status === 'SKIPPED' ? 'is-skip' : 'is-err';
      const icon = r.status === 'DONE' ? '✓' : r.status === 'SKIPPED' ? '!' : '✕';
      return `
      <div class="result-item ${cls}">
        <span class="result-check">${icon}</span>
        <div>
          <div class="result-name">${r.name}</div>
          <div class="result-detail">${r.detail}</div>
        </div>
      </div>`;
    })
    .join('');

  card.classList.remove('hidden');
}

$('btn-hero-optimize').onclick = async () => {
  const includeVbs = $('chk-hero-vbs').checked;
  const ids = state.tweaks.filter((t) => includeVbs || !t.optIn).map((t) => t.id);

  if (includeVbs) {
    const ok = await confirmModal(
      'Run Full Bare-Metal Optimization?',
      `BareFrame will create a System Restore Point & backup first, then apply all ${ids.length} optimizations including Bare-Metal VBS/HVCI OFF (+10–18% CPU FPS; disables WSL2/Hyper-V, keeps TPM 2.0 & Secure Boot ON). Continue?`
    );
    if (!ok) return;
  }

  $('hero-idle-state').classList.add('hidden');
  $('hero-results-card').classList.add('hidden');
  $('hero-progress-state').classList.remove('hidden');
  $('hero-progress-fill').style.width = '3%';
  $('hero-progress-pct').textContent = '3%';
  $('hero-progress-label').textContent = 'Creating System Restore Point & Registry/Config Backups…';
  $('tweak-console').textContent = `Running 1-Click Optimization (${ids.length} modules)…`;

  try {
    const res = await window.frameforge.applyTweaks(ids);
    $('hero-progress-fill').style.width = '100%';
    $('hero-progress-pct').textContent = '100%';
    $('hero-progress-label').textContent = `All ${res.applied} optimizations completed!`;
    renderResultsBreakdown(res);
    showToast(`Optimization complete! ${res.applied} modules applied.`);
    await loadAudit();
    maybePromptTip(
      `${res.applied} Optimizations Applied!`,
      'Your PC is now tuned with full backup & 1-click revert. BareFrame is 100% free & open-source — leave a tip on Ko-fi if you love the extra frames!'
    );
  } catch (err) {
    showToast(`Error: ${err.message}`);
  } finally {
    setTimeout(() => {
      $('hero-progress-state').classList.add('hidden');
      $('hero-idle-state').classList.remove('hidden');
    }, 900);
  }
};

$('btn-hero-revert').onclick = () => $('btn-revert-all').click();
$('btn-results-reboot').onclick = () => $('btn-reboot-now').click();
$('btn-results-bios').onclick = () => switchTab('throttle');
$('btn-results-tip').onclick = () => $('btn-tip-sidebar').click();

$('btn-apply-tweaks').onclick = async () => {
  const ids = [...state.selectedTweaks];
  if (ids.length === 0) return showToast('Select at least one tweak first.');
  if (ids.includes('baremetal_vbs')) {
    const ok = await confirmModal(
      'Bare-Metal VBS Selected',
      'Disabling VBS & Hypervisor gives +10–18% CPU FPS, but disables WSL2, Docker Desktop, and Hyper-V until reverted. TPM 2.0 & Secure Boot stay ON. Continue?'
    );
    if (!ok) return;
  }
  $('tweak-console').textContent = `Applying ${ids.length} optimization(s)… creating backup & Restore Point first…`;
  $('btn-apply-tweaks').disabled = true;
  try {
    const res = await window.frameforge.applyTweaks(ids);
    $('tweak-console').textContent += `\n\n✓ Finished applying ${res.applied} module(s).${res.requiresReboot ? ' Reboot recommended to activate kernel changes.' : ''}`;
    if (res.requiresReboot) $('btn-reboot-now').classList.remove('hidden');
    showToast(`Applied ${res.applied} optimizations!`);
    await loadAudit();
    maybePromptTip(
      `Applied ${res.applied} Optimizations!`,
      'Your system is now tuned with full backups & restore point saved. BareFrame is 100% free & open-source — if it boosted your FPS, consider leaving a tip on Ko-fi!'
    );
  } catch (err) {
    $('tweak-console').textContent += `\n[ERROR] ${err.message}`;
    showToast(`Error: ${err.message}`);
  } finally {
    $('btn-apply-tweaks').disabled = false;
  }
};

$('btn-revert-all').onclick = async () => {
  const ok = await confirmModal(
    'Revert All Optimizations?',
    'This restores Windows defaults for MMCSS, Kernel timers, Power Plan, Memory Compression, Services, USB/Ethernet power saving, and VBS/Hypervisor.'
  );
  if (!ok) return;
  $('tweak-console').textContent = 'Reverting all BareFrame tweaks back to stock Windows defaults…';
  $('btn-revert-all').disabled = true;
  try {
    const res = await window.frameforge.revertTweaks([]);
    $('tweak-console').textContent += `\n\n✓ Reverted ${res.reverted} module(s). Reboot to finalize.`;
    $('btn-reboot-now').classList.remove('hidden');
    showToast('All settings reverted to defaults.');
    await loadAudit();
  } catch (err) {
    $('tweak-console').textContent += `\n[ERROR] ${err.message}`;
  } finally {
    $('btn-revert-all').disabled = false;
  }
};

$('btn-reboot-now').onclick = async () => {
  const ok = await confirmModal('Reboot PC Now?', 'Windows will restart in 8 seconds so all kernel and timer tweaks take full effect.');
  if (ok) {
    await window.frameforge.rebootWindows();
    showToast('Rebooting in 8 seconds…');
  }
};

// ---------------- THROTTLE TEST & BIOS ----------------
async function loadBiosGuide(vendor, model) {
  const guide = await window.frameforge.getBiosGuide(vendor, model);
  $('bios-card-title').textContent = `${guide.brand} BIOS Playbook`;
  $('bios-key-pill').textContent = `Key: ${guide.key}`;
  $('bios-steps').innerHTML = guide.steps.map((s) => `<li>${s}</li>`).join('');
}

function renderThrottleChart(samples) {
  const wrap = $('throttle-chart-wrap');
  if (!samples.length) return;
  const W = 540, H = 195, padL = 48, padR = 16, padT = 18, padB = 28;
  const maxVal = Math.max(...samples.map((s) => s.avgMHz), 4200) + 200;
  const minVal = Math.max(1500, Math.min(...samples.map((s) => s.avgMHz)) - 350);

  const xOf = (sec) => padL + ((sec / 35) * (W - padL - padR));
  const yOf = (mhz) => padT + ((maxVal - mhz) / (maxVal - minVal)) * (H - padT - padB);

  const pts = samples.map((s) => `${xOf(s.sec).toFixed(1)},${yOf(s.avgMHz).toFixed(1)}`).join(' ');
  const gridVals = [maxVal, Math.round((maxVal + minVal) / 2), minVal];

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="195">
      ${gridVals
        .map(
          (v) => `
        <line x1="${padL}" y1="${yOf(v)}" x2="${W - padR}" y2="${yOf(v)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>
        <text x="${padL - 6}" y="${yOf(v) + 4}" fill="#8B97AD" font-size="10" text-anchor="end">${v}</text>`
        )
        .join('')}
      <polyline fill="none" stroke="#00E5A0" stroke-width="2.5" points="${pts}" />
      ${samples
        .map(
          (s) => `
        <circle cx="${xOf(s.sec)}" cy="${yOf(s.avgMHz)}" r="4.5" fill="#FF4655" stroke="#fff" stroke-width="1.2"/>
        <text x="${xOf(s.sec)}" y="${yOf(s.avgMHz) - 9}" fill="#F1F5F9" font-size="10" font-weight="700" text-anchor="middle">${s.avgMHz}</text>
        <text x="${xOf(s.sec)}" y="${H - 6}" fill="#8B97AD" font-size="10" text-anchor="middle">T+${s.sec}s</text>`
        )
        .join('')}
    </svg>`;
}

window.frameforge.onThrottleSample((sample) => {
  state.throttleSamples.push(sample);
  renderThrottleChart(state.throttleSamples);
  $('throttle-summary').textContent = `Sampling T+${sample.sec}s / 34s — Active P-Core Avg: ${sample.avgMHz} MHz (Peak: ${sample.peakMHz} MHz)…`;
});

$('btn-run-throttle').onclick = async () => {
  state.throttleSamples = [];
  $('btn-run-throttle').disabled = true;
  $('btn-run-throttle').textContent = 'Testing (35s)…';
  $('throttle-verdict-pill').textContent = 'Running…';
  $('throttle-verdict-pill').className = 'pill-cyan';
  $('throttle-summary').textContent = 'Applying sustained 6-thread CPU load to check 28s Tau / PL1 & thermal stability…';
  try {
    const res = await window.frameforge.runThrottleTest();
    renderThrottleChart(res.points);
    const pill = $('throttle-verdict-pill');
    pill.textContent = res.verdict;
    pill.className = res.verdict === 'ROCK SOLID' ? 'pill-green' : res.verdict === 'MILD THROTTLE' ? 'pill-amber' : 'pill-red';
    $('throttle-summary').textContent = res.explanation;
  } catch (err) {
    $('throttle-summary').textContent = `Error: ${err.message}`;
  } finally {
    $('btn-run-throttle').disabled = false;
    $('btn-run-throttle').textContent = 'Run 35s Clock Stress Test';
  }
};

$('btn-reboot-bios').onclick = async () => {
  const ok = await confirmModal(
    'Reboot Straight into UEFI BIOS?',
    'Your PC will restart in 8 seconds directly into your motherboard BIOS setup screen. Save any open work first.'
  );
  if (ok) {
    await window.frameforge.rebootToBios();
    showToast('Rebooting into UEFI BIOS in 8 seconds…');
  }
};

// ---------------- VALORANT TELEMETRY ----------------
async function loadTelemetry() {
  try {
    const data = await window.frameforge.getTelemetry();
    state.telemetry = data;
    renderTelemetry(data);
  } catch (err) {
    showToast(`Telemetry error: ${err.message}`);
  }
}

function renderTelemetry(data) {
  const kpis = $('telemetry-kpis');
  const chartWrap = $('telemetry-chart-wrap');
  const tbody = $('telemetry-tbody');

  if (!data.installed || !data.sessions.length) {
    kpis.innerHTML = '';
    chartWrap.innerHTML = `<div class="empty-state">No completed Valorant match logs found in %LOCALAPPDATA%\\VALORANT\\Saved\\Logs\\. Play one TDM or match and click Refresh!</div>`;
    tbody.innerHTML = '';
    return;
  }

  const s = data.summary;
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Latest Match Avg FPS</div>
      <div class="kpi-val accent-mint">${s.latestFps} FPS</div>
      <div class="kpi-sub">${s.latestFrametimeMs} ms frametime</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Session FPS Progression</div>
      <div class="kpi-val ${s.fpsGainPct >= 0 ? 'accent-mint' : 'accent-crimson'}">${s.fpsGainPct >= 0 ? '+' : ''}${s.fpsGainPct}%</div>
      <div class="kpi-sub">Across ${s.sessionCount} parsed logs</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Time Above 240 FPS</div>
      <div class="kpi-val accent-cyan">${s.latestPctOver240}%</div>
      <div class="kpi-sub">Only ${s.latestPctUnder240}% dipped &lt;240</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">GPU Headroom</div>
      <div class="kpi-val">${s.latestGpuCapacityFps} FPS</div>
      <div class="kpi-sub">Verdict: ${s.latestBottleneck}</div>
    </div>`;

  const bp = $('telemetry-bottleneck-pill');
  bp.textContent = `Bottleneck: ${s.latestBottleneck}`;
  bp.className = s.latestBottleneck === 'CPU-Bound' ? 'pill-amber' : 'pill-cyan';

  const tipBanner = $('telemetry-tip-banner');
  if (s.fpsGainPct >= 5) {
    $('telemetry-tip-headline').textContent = `BareFrame boosted your Valorant avg FPS by +${s.fpsGainPct}% (${s.latestFps} FPS) for $0!`;
    tipBanner.classList.remove('hidden');
  } else {
    tipBanner.classList.add('hidden');
  }

  // Bar + Line Progression SVG
  const sessions = data.sessions;
  const W = 860, H = 210, padL = 46, padR = 24, padT = 24, padB = 34;
  const maxFps = Math.max(...sessions.map((x) => x.avgFps), 320) + 40;
  const slotW = (W - padL - padR) / Math.max(sessions.length, 1);
  const barW = Math.min(54, slotW * 0.55);
  const yFps = (f) => padT + ((maxFps - f) / maxFps) * (H - padT - padB);

  chartWrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="210">
      ${[0, 120, 240, 360]
        .filter((v) => v <= maxFps)
        .map(
          (v) => `
        <line x1="${padL}" y1="${yFps(v)}" x2="${W - padR}" y2="${yFps(v)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>
        <text x="${padL - 8}" y="${yFps(v) + 4}" fill="#8B97AD" font-size="10" text-anchor="end">${v}</text>`
        )
        .join('')}
      ${sessions
        .map((m, i) => {
          const cx = padL + i * slotW + slotW / 2;
          const top = yFps(m.avgFps);
          const h = H - padB - top;
          const isLast = i === sessions.length - 1;
          return `
            <rect x="${cx - barW / 2}" y="${top}" width="${barW}" height="${Math.max(2, h)}" rx="5"
                  fill="${isLast ? '#00E5A0' : 'rgba(255,70,85,0.72)'}" />
            <text x="${cx}" y="${top - 7}" fill="${isLast ? '#00E5A0' : '#F1F5F9'}" font-size="11" font-weight="800" text-anchor="middle">${m.avgFps} FPS</text>
            <text x="${cx}" y="${H - 15}" fill="#8B97AD" font-size="9.5" text-anchor="middle">${m.dateLabel}</text>
            <text x="${cx}" y="${H - 3}" fill="#F59E0B" font-size="9" text-anchor="middle">${m.pctUnder240}% &lt;240</text>`;
        })
        .join('')}
    </svg>`;

  tbody.innerHTML = [...sessions]
    .reverse()
    .map(
      (m, idx) => `
    <tr class="${idx === 0 ? 'latest-row' : ''}">
      <td>${m.dateLabel}</td>
      <td>${m.mode}</td>
      <td><strong style="color:${idx === 0 ? '#00E5A0' : '#fff'}">${m.avgFps}</strong></td>
      <td>${m.avgFrametimeMs} ms</td>
      <td>${m.pctUnder240}%</td>
      <td>${m.pctOver240}%</td>
      <td>${m.framesOver480}</td>
      <td>${m.avgEngineLatencyMs} ms</td>
      <td>${m.gpuTimeMs} ms (${m.gpuCapacityFps})</td>
      <td><span class="${m.bottleneck === 'CPU-Bound' ? 'pill-amber' : 'pill-cyan'}">${m.bottleneck}</span></td>
    </tr>`
    )
    .join('');
}

$('btn-refresh-telemetry').onclick = loadTelemetry;

// ---------------- PRE-MATCH BOOST ----------------
async function loadHogs() {
  try {
    const res = await window.frameforge.scanHogs();
    state.hogs = res.hogs || [];
    $('boost-free-ram').textContent = `${res.freeRamGB} / ${res.totalRamGB} GB`;
    $('boost-hog-count').textContent = state.hogs.length;
    const totalMB = state.hogs.reduce((s, h) => s + h.mb, 0);
    $('boost-reclaim-mb').textContent = `${Math.round(totalMB)} MB`;

    const list = $('boost-list');
    if (!state.hogs.length) {
      list.innerHTML = `<div class="empty-state" style="color:#00E5A0;">Zero heavy background apps detected — you're clean and ready to queue!</div>`;
      return;
    }

    list.innerHTML = state.hogs
      .map(
        (h) => `
      <label class="boost-row">
        <div class="boost-left">
          <input type="checkbox" class="tweak-check hog-check" data-name="${h.name}" ${h.isOverlay ? '' : 'checked'} />
          <div>
            <div style="font-weight:700">${h.name} ${h.isOverlay ? '<span class="pill-red">Overlay (Disable in App UI)</span>' : ''}</div>
            <div style="font-size:11.5px;color:#8B97AD">${h.count} process(es)</div>
          </div>
        </div>
        <div class="boost-meta">
          <span>${h.mb} MB</span>
          <span>${h.cpuSec}s CPU</span>
        </div>
      </label>`
      )
      .join('');
  } catch (err) {
    showToast(`Scan failed: ${err.message}`);
  }
}

$('btn-scan-hogs').onclick = loadHogs;
$('btn-purge-hogs').onclick = async () => {
  const names = [...document.querySelectorAll('.hog-check:checked')].map((c) => c.dataset.name);
  if (!names.length) return showToast('No processes selected to close.');
  const res = await window.frameforge.purgeHogs(names);
  showToast(`Closed ${res.closedCount} process(es), freed ~${res.freedMB} MB RAM!`);
  await loadHogs();
};
$('btn-launch-val').onclick = async () => {
  const res = await window.frameforge.launchValorant();
  if (res.stdout.includes('LAUNCHED')) showToast('Launching VALORANT…');
  else showToast('Riot Client not found at C:\\Riot Games\\Riot Client.');
};

// ---------------- TIP / SUPPORT MODAL ----------------
async function initSupport() {
  state.support = await window.frameforge.getSupportConfig();
  $('btn-tip-kofi').onclick = () => {
    window.frameforge.openExternal(state.support.kofiUrl);
    closeTipModal();
  };
  $('btn-tip-gh').onclick = () => {
    window.frameforge.openExternal(state.support.githubUrl);
    closeTipModal();
  };
}

function openTipModal(title, body) {
  if (title) $('tip-modal-title').textContent = title;
  if (body) $('tip-modal-body').textContent = body;
  $('chk-tip-optout').checked = localStorage.getItem('bf_tip_optout') === '1';
  $('tip-modal-backdrop').classList.remove('hidden');
}

function closeTipModal() {
  if ($('chk-tip-optout').checked) {
    localStorage.setItem('bf_tip_optout', '1');
  }
  $('tip-modal-backdrop').classList.add('hidden');
}

function maybePromptTip(title, body) {
  if (localStorage.getItem('bf_tip_optout') === '1') return;
  if (sessionStorage.getItem('bf_tip_shown_session') === '1') return;
  sessionStorage.setItem('bf_tip_shown_session', '1');
  setTimeout(() => openTipModal(title, body), 600);
}

$('btn-tip-sidebar').onclick = () =>
  openTipModal(
    'Support BareFrame (100% Free)',
    'BareFrame is completely free & open-source with zero ads or paid tweak packs. Tips on Ko-fi help cover Windows code-signing fees and keep updates coming!'
  );
$('btn-tip-banner').onclick = () =>
  openTipModal(
    'Glad BareFrame Boosted Your Frames!',
    'Every feature in BareFrame is 100% free forever. If you want to support development or help cover code-signing costs, any tip on Ko-fi is hugely appreciated!'
  );
$('btn-tip-close').onclick = closeTipModal;

// Boot sequence
initSupport();
initTweaks();
loadAudit();
