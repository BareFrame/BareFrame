/* ==========================================================================
   BareFrame Desktop — Renderer & Interruptible Spring Physics
   Follows Apple Fluid Interfaces:
   - Interruptible 1D critically-damped springs (damping 1.0, response 0.30–0.36)
   - Pointer-down instant tab switching + spring active nav pill
   - Spring-driven readiness bar & progress fill
   - Scroll edge depth awareness + modal background dim/recess
   - Reduced-motion compliance
   ========================================================================== */

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class Spring1D {
  constructor(initialValue, { damping = 1.0, response = 0.32, onUpdate } = {}) {
    this.value = initialValue;
    this.target = initialValue;
    this.velocity = 0;
    this.damping = damping;
    this.response = response;
    this.onUpdate = onUpdate || (() => {});
    this.raf = null;
    this.lastTime = 0;
  }

  setImmediate(val) {
    this.stop();
    this.value = val;
    this.target = val;
    this.velocity = 0;
    this.onUpdate(val);
  }

  animateTo(target, { damping = this.damping, response = this.response } = {}) {
    this.target = target;
    this.damping = damping;
    this.response = response;

    if (prefersReducedMotion()) {
      this.setImmediate(target);
      return;
    }

    if (!this.raf) {
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this._tick);
    }
  }

  stop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  _tick = (now) => {
    const dt = Math.min(0.032, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const omega = (2 * Math.PI) / Math.max(0.05, this.response);
    const k = omega * omega;
    const c = 2 * this.damping * omega;

    const displacement = this.value - this.target;
    const accel = -k * displacement - c * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;

    if (Math.abs(this.value - this.target) < 0.05 && Math.abs(this.velocity) < 0.5) {
      this.value = this.target;
      this.velocity = 0;
      this.onUpdate(this.value);
      this.raf = null;
      return;
    }

    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this._tick);
  };
}

const state = {
  gameId: localStorage.getItem('bf_selected_game') || null,
  games: [],
  installedGames: {},
  pendingGameId: null,
  audit: null,
  tweaks: [],
  selectedTweaks: new Set(),
  throttleSamples: [],
  telemetry: null,
  hogs: [],
  support: null,
};

function getActiveGame() {
  return state.games.find((g) => g.id === state.gameId) || state.games[0] || {
    id: 'valorant',
    name: 'VALORANT',
    shortName: 'VALORANT',
    antiCheat: 'Riot Vanguard',
    tweakSummary: 'IFEO High, Defender exclusions & game config tweaks',
    launchLabel: 'Launch VALORANT',
    vbsNote: 'Leaves TPM 2.0 & Secure Boot enabled. Disables WSL2/Hyper-V until reverted.',
    hasTelemetry: true,
  };
}

const $ = (id) => document.getElementById(id);

function syncModalDim() {
  const anyOpen = [
    'modal-backdrop',
    'update-modal-backdrop',
    'tip-modal-backdrop',
    'game-picker-overlay',
  ].some((id) => {
    const el = $(id);
    return el && !el.classList.contains('hidden');
  });
  document.body.classList.toggle('modal-active', anyOpen);
}

function showToast(msg, duration = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(el._t);
  clearTimeout(el._hideT);
  el._t = setTimeout(() => {
    el.classList.remove('is-visible');
    el._hideT = setTimeout(() => el.classList.add('hidden'), 240);
  }, duration);
}

function confirmModal(title, body) {
  return new Promise((resolve) => {
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    $('modal-backdrop').classList.remove('hidden');
    syncModalDim();
    const cleanup = (val) => {
      $('modal-backdrop').classList.add('hidden');
      syncModalDim();
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

// Scroll Edge Awareness (§12)
const mainContent = $('main-content');
mainContent.addEventListener('scroll', () => {
  mainContent.classList.toggle('is-scrolled', mainContent.scrollTop > 8);
}, { passive: true });

// Interruptible Spring Navigation Indicator (§3, §4)
const navPill = $('nav-active-pill');
const navPillY = new Spring1D(0, {
  damping: 1.0,
  response: 0.28,
  onUpdate: (y) => {
    navPill.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
  },
});

function moveNavPill(btn, immediate = false) {
  if (!btn || !navPill) return;
  const targetY = btn.offsetTop;
  navPill.style.height = `${btn.offsetHeight}px`;
  if (immediate) navPillY.setImmediate(targetY);
  else navPillY.animateTo(targetY);
}

const TAB_ORDER = ['overview', 'tweaks', 'throttle', 'telemetry', 'boost'];
let currentTabId = 'overview';

function switchTab(tabId) {
  if (tabId === currentTabId) return;
  const prevIdx = TAB_ORDER.indexOf(currentTabId);
  const nextIdx = TAB_ORDER.indexOf(tabId);
  const dirClass = nextIdx >= prevIdx ? 'enter-down' : 'enter-up';
  currentTabId = tabId;

  let activeBtn = null;
  document.querySelectorAll('.nav-item').forEach((b) => {
    const active = b.dataset.tab === tabId;
    b.classList.toggle('active', active);
    if (active) activeBtn = b;
  });
  moveNavPill(activeBtn);
  document.querySelectorAll('.tab-panel').forEach((p) => {
    const isTarget = p.id === `tab-${tabId}`;
    p.classList.remove('enter-down', 'enter-up');
    p.classList.toggle('active', isTarget);
    if (isTarget) {
      void p.offsetWidth;
      p.classList.add(dirClass);
    }
  });
  mainContent.scrollTop = 0;
  mainContent.classList.remove('is-scrolled');
  if (tabId === 'telemetry' && !state.telemetry) loadTelemetry();
  if (tabId === 'boost') loadHogs();
}

// Respond immediately on pointerdown for zero perceived latency (§1)
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('pointerdown', () => switchTab(btn.dataset.tab));
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
$('btn-quick-opt').onclick = () => switchTab('tweaks');
requestAnimationFrame(() => moveNavPill(document.querySelector('.nav-item.active'), true));

// Spring-driven Readiness & Progress Bars
const scoreSpring = new Spring1D(0, {
  damping: 1.0,
  response: 0.42,
  onUpdate: (v) => {
    const clamped = Math.max(0, Math.min(100, v));
    const rounded = Math.round(clamped);
    const scoreEl = $('score-num');
    const barFill = $('score-bar-fill');
    scoreEl.textContent = String(rounded);
    scoreEl.className = `score-num ${rounded >= 80 ? 'is-good' : rounded < 55 ? 'is-low' : ''}`.trim();
    barFill.style.width = `${clamped.toFixed(1)}%`;
    barFill.style.background = rounded >= 80 ? '#2B7FFF' : rounded >= 55 ? '#6CB2FF' : '#F96A1B';
  },
});

const heroProgSpring = new Spring1D(0, {
  damping: 1.0,
  response: 0.3,
  onUpdate: (v) => {
    const c = Math.max(0, Math.min(100, v));
    $('hero-progress-fill').style.width = `${c.toFixed(1)}%`;
    $('hero-progress-pct').textContent = `${Math.round(c)}%`;
  },
});

// ---------------- AUDIT / OVERVIEW ----------------
async function loadAudit() {
  $('btn-rescan').disabled = true;
  $('btn-rescan').textContent = 'Scanning…';
  try {
    const data = await window.frameforge.runAudit(state.gameId || 'valorant');
    state.audit = data;
    renderAudit(data);
    renderTweaks();
    loadBiosGuide(data.hardware.boardVendor, data.hardware.boardModel);
  } catch (err) {
    showToast(`Audit error: ${err.message}`);
  } finally {
    $('btn-rescan').disabled = false;
    $('btn-rescan').textContent = 'Re-Scan';
  }
}

function renderAudit(d) {
  const badge = $('admin-badge');
  if (d.isAdmin) {
    badge.textContent = 'Admin ready';
    badge.className = 'admin-badge is-admin';
    badge.style.cursor = 'default';
    badge.onclick = null;
  } else {
    badge.textContent = 'Standard mode';
    badge.className = 'admin-badge no-admin';
    badge.style.cursor = 'pointer';
    badge.title = 'Relaunch with Administrator privileges to apply system tweaks';
    badge.onclick = () => ensureAdmin('Enable Administrator Mode');
  }

  scoreSpring.animateTo(d.score);

  $('score-verdict').textContent =
    d.score >= 90 ? 'Tuned' : d.score >= 70 ? 'Mostly tuned' : d.score >= 45 ? 'Bottlenecks found' : 'Stock overhead';
  const doneCount = Object.values(d.status).filter(Boolean).length;
  const totalCount = Object.keys(d.status).length;
  $('score-sub').textContent = `${doneCount} of ${totalCount} subsystems tuned`;
  $('nav-tweaks-badge').textContent = `${doneCount}/${totalCount}`;

  // Hardware
  const h = d.hardware;
  $('hw-cpu').textContent = `${h.cpuName} (${h.cpuCores}C/${h.cpuThreads}T)`;
  $('hw-gpu').textContent = `${h.gpuName}${h.gpuTempC != null ? `, ${h.gpuTempC}°C` : ''}`;
  $('hw-ram').textContent = `${h.ramTotalGB} GB (${h.ramSticks}× ${h.ramSpeedMHz} MHz, ${h.ramFreeGB} GB free)`;
  $('hw-board').textContent = `${h.boardVendor} ${h.boardModel} (BIOS ${h.biosVersion})`;
  $('hw-disp').textContent = `${h.resolution} at ${h.refreshRate} Hz, ReBAR ${h.rebarMB >= 4096 ? `${Math.round(h.rebarMB / 1024)} GB on` : 'check BIOS'}`;
  $('hw-sys').textContent = `${h.activePowerPlan}, ${h.nicName}, VBS ${d.details.vbsStatus === 0 ? 'off (Bare-Metal)' : 'on'}`;

  // Bottlenecks
  const list = $('bottlenecks-list');
  const countPill = $('bottleneck-count');
  if (d.bottlenecks.length === 0) {
    const g = getActiveGame();
    countPill.textContent = 'All clear';
    countPill.className = 'pill-blue';
    list.innerHTML = `<div class="empty-state" style="color:#6CB2FF;">All audited Windows, hardware, and ${g.shortName} subsystems are tuned.</div>`;
  } else {
    countPill.textContent = `${d.bottlenecks.length} found`;
    countPill.className = 'pill-red';
    const sevLabel = { HIGH: 'High', MED: 'Medium', LOW: 'Low' };
    list.innerHTML = d.bottlenecks
      .map(
        (b) => `
      <div class="bottleneck-item">
        <span class="${b.severity === 'HIGH' ? 'pill-red' : b.severity === 'MED' ? 'pill-opt' : 'pill-blue'}">${sevLabel[b.severity] || b.severity}</span>
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
  state.tweaks = await window.frameforge.getTweaks(state.gameId || 'valorant');
  state.selectedTweaks.clear();
  state.tweaks.forEach((t) => {
    if (!t.optIn) state.selectedTweaks.add(t.id);
  });
  renderTweaks();
}

function renderTweaks() {
  const container = $('tweaks-list');
  if (!state.tweaks.length) return;
  const statusMap = state.audit?.status || {};

  const impactLabel = { 'VERY HIGH': 'Very high', HIGH: 'High', MED: 'Medium', LOW: 'Low' };
  container.innerHTML = state.tweaks
    .map((t) => {
      const done = Boolean(statusMap[t.id]);
      const checked = state.selectedTweaks.has(t.id) ? 'checked' : '';
      const impactCls = t.impact.includes('HIGH') ? 'pill-red' : 'pill-neutral';
      return `
      <div class="tweak-card ${t.optIn ? 'opt-in' : ''}">
        <div class="tweak-row-compact">
          <label class="tweak-check-wrap">
            <span class="apple-switch">
              <input type="checkbox" class="tweak-check" data-id="${t.id}" ${checked} />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </span>
            <span class="tweak-name">${t.name}</span>
          </label>
          <div class="tweak-badges">
            <span class="${impactCls}">${impactLabel[t.impact] || t.impact}</span>
            ${t.optIn ? '<span class="pill-opt">Opt-in</span>' : ''}
            ${t.requiresReboot ? '<span class="pill-neutral">Reboot</span>' : ''}
            <span class="${done ? 'pill-blue' : 'pill-neutral'}">${done ? 'Applied' : 'Stock'}</span>
            <button type="button" class="expand-btn" aria-expanded="false" title="Show details">+</button>
          </div>
        </div>
        <div class="tweak-drawer-collapse">
          <div class="tweak-drawer-inner">
            <div class="tweak-desc-drawer">${t.description}</div>
          </div>
        </div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('.tweak-check').forEach((chk) => {
    chk.onchange = () => {
      if (chk.checked) state.selectedTweaks.add(chk.dataset.id);
      else state.selectedTweaks.delete(chk.dataset.id);
    };
  });

  container.querySelectorAll('.expand-btn').forEach((btn) => {
    btn.onclick = () => {
      const card = btn.closest('.tweak-card');
      const open = card.classList.toggle('is-open');
      btn.textContent = open ? '−' : '+';
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('is-open', open);
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

let consoleLineCount = 0;
function resetConsole(initialLine) {
  consoleLineCount = 1;
  $('tweak-console').textContent = initialLine;
  const pill = $('console-count-pill');
  if (pill) pill.textContent = '1 line';
}

window.frameforge.onTweakLog((line) => {
  const pre = $('tweak-console');
  pre.textContent += `\n${line}`;
  pre.scrollTop = pre.scrollHeight;
  consoleLineCount++;
  const pill = $('console-count-pill');
  if (pill) pill.textContent = `${consoleLineCount} lines`;
});

window.frameforge.onTweakProgress((prog) => {
  $('hero-progress-label').textContent = prog.label;
  heroProgSpring.animateTo(prog.pct);
  $('hero-progress-step').textContent = `Step ${Math.min(prog.step, prog.total)} of ${prog.total}`;
});

function renderResultsBreakdown(res) {
  const card = $('hero-results-card');
  const list = $('hero-results-list');
  $('hero-results-title').textContent = `Optimization complete (${res.applied} modules applied)`;
  $('hero-results-sub').textContent = res.requiresReboot
    ? 'Expand any row for details. Reboot once so kernel and Bare-Metal settings activate.'
    : 'All applied settings are active now. Expand any row for details.';

  list.innerHTML = (res.results || [])
    .map((r) => {
      const cls = r.status === 'DONE' ? '' : r.status === 'SKIPPED' ? 'is-skip' : 'is-err';
      const tag = r.status === 'DONE' ? 'OK' : r.status === 'SKIPPED' ? 'SKIP' : 'ERR';
      return `
      <details class="result-item ${cls}">
        <summary class="result-summary">
          <span class="result-summary-left">
            <span class="result-check">${tag}</span>
            <span class="result-name">${r.name}</span>
          </span>
          <span class="expand-symbol" aria-hidden="true"></span>
        </summary>
        <div class="result-detail">${r.detail}</div>
      </details>`;
    })
    .join('');

  card.classList.remove('hidden');
}

async function ensureAdmin(actionLabel) {
  if (state.audit?.isAdmin) return true;
  const ok = await confirmModal(
    'Administrator Permission Required',
    `BareFrame starts in standard mode so logs and Pre-Match Boost open without UAC prompts. "${actionLabel}" modifies Windows settings — approve the Windows UAC prompt once for this session.`
  );
  if (!ok) return false;
  showToast('Requesting Administrator elevation…');
  const res = await window.frameforge.relaunchAsAdmin();
  if (!res.ok) showToast('Elevation canceled.');
  return false;
}

$('btn-hero-optimize').onclick = async () => {
  if (!(await ensureAdmin('Run Optimization'))) return;
  const includeVbs = $('chk-hero-vbs').checked;
  const ids = state.tweaks.filter((t) => includeVbs || !t.optIn).map((t) => t.id);

  if (includeVbs) {
    const ok = await confirmModal(
      'Run Full Optimization (with Bare-Metal Mode)?',
      `BareFrame will create a System Restore Point and backups first, then apply ${ids.length} tweaks including Bare-Metal Mode (VBS/HVCI off; disables WSL2/Hyper-V while leaving TPM 2.0 and Secure Boot enabled). Continue?`
    );
    if (!ok) return;
  }

  $('hero-idle-state').classList.add('hidden');
  $('hero-results-card').classList.add('hidden');
  $('hero-progress-state').classList.remove('hidden');
  heroProgSpring.setImmediate(3);
  $('hero-progress-label').textContent = 'Creating System Restore Point & registry/config backups…';
  resetConsole(`Running optimization (${ids.length} modules)…`);

  try {
    const res = await window.frameforge.applyTweaks(ids, state.gameId || 'valorant');
    heroProgSpring.animateTo(100);
    $('hero-progress-label').textContent = `Completed (${res.applied} modules applied)`;
    renderResultsBreakdown(res);
    showToast(`Applied ${res.applied} modules.`);
    await loadAudit();
    maybePromptTip(
      `${res.applied} Modules Applied`,
      'Your system has been updated with automatic backups and 1-click revert. BareFrame is free and MIT open-source — optional Ko-fi tips help cover signing and maintenance.'
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
  if (!(await ensureAdmin('Apply Selected Tweaks'))) return;
  const ids = [...state.selectedTweaks];
  if (ids.length === 0) return showToast('Enable at least one optimization first.');
  if (ids.includes('baremetal_vbs')) {
    const ok = await confirmModal(
      'Bare-Metal Mode Selected',
      'Disabling VBS and Hyper-V improves CPU frame times but disables WSL2 and Docker Desktop until reverted. TPM 2.0 and Secure Boot remain enabled. Continue?'
    );
    if (!ok) return;
  }
  resetConsole(`Applying ${ids.length} module(s)… creating backup & Restore Point first…`);
  $('btn-apply-tweaks').disabled = true;
  try {
    const res = await window.frameforge.applyTweaks(ids, state.gameId || 'valorant');
    $('tweak-console').textContent += `\n\n[DONE] Applied ${res.applied} module(s).${res.requiresReboot ? ' Reboot recommended to activate kernel changes.' : ''}`;
    if (res.requiresReboot) $('btn-reboot-now').classList.remove('hidden');
    showToast(`Applied ${res.applied} modules.`);
    await loadAudit();
    maybePromptTip(
      `${res.applied} Modules Applied`,
      'Backups and a Restore Point were saved first. BareFrame is free and open-source — optional Ko-fi tips support code signing and updates.'
    );
  } catch (err) {
    $('tweak-console').textContent += `\n[ERROR] ${err.message}`;
    showToast(`Error: ${err.message}`);
  } finally {
    $('btn-apply-tweaks').disabled = false;
  }
};

$('btn-revert-all').onclick = async () => {
  if (!(await ensureAdmin('Revert All Optimizations'))) return;
  const ok = await confirmModal(
    'Revert All Optimizations?',
    'Restores Windows defaults for MMCSS, kernel timers, power plan, memory compression, services, USB/Ethernet power saving, IFEO priority, and VBS/Hyper-V.'
  );
  if (!ok) return;
  resetConsole('Reverting all BareFrame tweaks back to stock Windows defaults…');
  $('btn-revert-all').disabled = true;
  try {
    const res = await window.frameforge.revertTweaks([], state.gameId || 'valorant');
    $('tweak-console').textContent += `\n\n[DONE] Reverted ${res.reverted} module(s). Reboot to finalize.`;
    $('btn-reboot-now').classList.remove('hidden');
    showToast('All settings reverted to Windows defaults.');
    await loadAudit();
  } catch (err) {
    $('tweak-console').textContent += `\n[ERROR] ${err.message}`;
  } finally {
    $('btn-revert-all').disabled = false;
  }
};

$('btn-reboot-now').onclick = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const ok = await confirmModal('Reboot PC Now?', 'Windows will restart in 8 seconds so kernel and timer changes take full effect.');
  if (ok) {
    await window.frameforge.rebootWindows();
    showToast('Rebooting in 8 seconds…');
  }
};

// ---------------- THROTTLE TEST & BIOS ----------------
async function loadBiosGuide(vendor, model) {
  const guide = await window.frameforge.getBiosGuide(vendor, model);
  $('bios-card-title').textContent = `${guide.brand} BIOS Guide`;
  $('bios-key-pill').textContent = `Key: ${guide.key}`;
  $('bios-steps').innerHTML = guide.steps.map((s) => `<li>${s}</li>`).join('');
}

function renderThrottleChart(samples, isLive = false) {
  const wrap = $('throttle-chart-wrap');
  if (!samples.length) return;
  const W = 540, H = 195, padL = 48, padR = 16, padT = 18, padB = 28;
  const maxVal = Math.max(...samples.map((s) => s.avgMHz), 4200) + 200;
  const minVal = Math.max(1500, Math.min(...samples.map((s) => s.avgMHz)) - 350);

  const xOf = (sec) => padL + ((sec / 35) * (W - padL - padR));
  const yOf = (mhz) => padT + ((maxVal - mhz) / (maxVal - minVal)) * (H - padT - padB);

  const pts = samples.map((s) => `${xOf(s.sec).toFixed(1)},${yOf(s.avgMHz).toFixed(1)}`).join(' ');
  const gridVals = [maxVal, Math.round((maxVal + minVal) / 2), minVal];
  const lastSample = samples[samples.length - 1];

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="195">
      ${gridVals
        .map(
          (v) => `
        <line x1="${padL}" y1="${yOf(v)}" x2="${W - padR}" y2="${yOf(v)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>
        <text x="${padL - 6}" y="${yOf(v) + 4}" fill="#6B788E" font-family="Consolas,monospace" font-size="10" text-anchor="end">${v}</text>`
        )
        .join('')}
      <polyline fill="none" stroke="#2B7FFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />
      ${isLive && lastSample ? `<circle class="live-sample-ring" cx="${xOf(lastSample.sec)}" cy="${yOf(lastSample.avgMHz)}" r="5" fill="none" stroke="#F96A1B" stroke-width="1.5"/>` : ''}
      ${samples
        .map(
          (s) => `
        <circle cx="${xOf(s.sec)}" cy="${yOf(s.avgMHz)}" r="4" fill="#F96A1B" stroke="#0F141D" stroke-width="1.5"/>
        <text x="${xOf(s.sec)}" y="${yOf(s.avgMHz) - 9}" fill="#F4F6FA" font-family="Consolas,monospace" font-size="10" font-weight="600" text-anchor="middle">${s.avgMHz}</text>
        <text x="${xOf(s.sec)}" y="${H - 6}" fill="#6B788E" font-family="Consolas,monospace" font-size="10" text-anchor="middle">T+${s.sec}s</text>`
        )
        .join('')}
    </svg>`;
}

window.frameforge.onThrottleSample((sample) => {
  state.throttleSamples.push(sample);
  renderThrottleChart(state.throttleSamples, true);
  $('throttle-summary').textContent = `Sampling T+${sample.sec}s / 34s · Active P-Core Avg: ${sample.avgMHz} MHz (Peak: ${sample.peakMHz} MHz)`;
});

$('btn-run-throttle').onclick = async () => {
  state.throttleSamples = [];
  $('btn-run-throttle').disabled = true;
  $('btn-run-throttle').textContent = 'Testing (35s)…';
  $('throttle-verdict-pill').textContent = 'Running';
  $('throttle-verdict-pill').className = 'pill-blue';
  $('throttle-summary').textContent = 'Applying sustained 6-thread CPU load to measure 28s Tau / PL1 and thermal stability…';
  try {
    const res = await window.frameforge.runThrottleTest();
    renderThrottleChart(res.points);
    const pill = $('throttle-verdict-pill');
    pill.textContent = res.verdict;
    pill.className = res.verdict === 'ROCK SOLID' ? 'pill-blue' : res.verdict === 'MILD THROTTLE' ? 'pill-opt' : 'pill-red';
    $('throttle-summary').textContent = res.explanation;
  } catch (err) {
    $('throttle-summary').textContent = `Error: ${err.message}`;
  } finally {
    $('btn-run-throttle').disabled = false;
    $('btn-run-throttle').textContent = 'Run 35s Clock Test';
  }
};

$('btn-reboot-bios').onclick = async () => {
  if (!(await ensureAdmin('Reboot to UEFI BIOS'))) return;
  const ok = await confirmModal(
    'Reboot to UEFI BIOS?',
    'Your PC will restart in 8 seconds directly into UEFI firmware setup. Save any open work first.'
  );
  if (ok) {
    await window.frameforge.rebootToBios();
    showToast('Rebooting into UEFI BIOS in 8 seconds…');
  }
};

// ---------------- MATCH LOGS ----------------
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
    chartWrap.innerHTML = `<div class="empty-state">No completed VALORANT match logs found in %LOCALAPPDATA%\\VALORANT\\Saved\\Logs\\. Complete a match and click Refresh.</div>`;
    tbody.innerHTML = '';
    return;
  }

  const s = data.summary;
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Latest Match Avg FPS</div>
      <div class="kpi-val accent-blue">${s.latestFps} FPS</div>
      <div class="kpi-sub">${s.latestFrametimeMs} ms frametime</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Session Progression</div>
      <div class="kpi-val ${s.fpsGainPct >= 0 ? 'accent-blue' : 'accent-red'}">${s.fpsGainPct >= 0 ? '+' : ''}${s.fpsGainPct}%</div>
      <div class="kpi-sub">Across ${s.sessionCount} parsed logs</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Time Above 240 FPS</div>
      <div class="kpi-val">${s.latestPctOver240}%</div>
      <div class="kpi-sub">${s.latestPctUnder240}% dipped under 240</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">GPU Headroom</div>
      <div class="kpi-val">${s.latestGpuCapacityFps} FPS</div>
      <div class="kpi-sub">Verdict: ${s.latestBottleneck}</div>
    </div>`;

  const bp = $('telemetry-bottleneck-pill');
  bp.textContent = `Bottleneck: ${s.latestBottleneck}`;
  bp.className = s.latestBottleneck === 'CPU-Bound' ? 'pill-red' : 'pill-blue';

  const tipBanner = $('telemetry-tip-banner');
  if (s.fpsGainPct >= 5) {
    $('telemetry-tip-headline').textContent = `Local logs show +${s.fpsGainPct}% average FPS (${s.latestFps} FPS latest).`;
    tipBanner.classList.remove('hidden');
  } else {
    tipBanner.classList.add('hidden');
  }

  const sessions = data.sessions;
  const W = 860, H = 210, padL = 46, padR = 24, padT = 24, padB = 34;
  const maxFps = Math.max(...sessions.map((x) => x.avgFps), 320) + 40;
  const slotW = (W - padL - padR) / Math.max(sessions.length, 1);
  const barW = Math.min(46, slotW * 0.5);
  const yFps = (f) => padT + ((maxFps - f) / maxFps) * (H - padT - padB);

  chartWrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="210">
      ${[0, 120, 240, 360]
        .filter((v) => v <= maxFps)
        .map(
          (v) => `
        <line x1="${padL}" y1="${yFps(v)}" x2="${W - padR}" y2="${yFps(v)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>
        <text x="${padL - 8}" y="${yFps(v) + 4}" fill="#6D7689" font-family="Consolas,monospace" font-size="10" text-anchor="end">${v}</text>`
        )
        .join('')}
      ${sessions
        .map((m, i) => {
          const cx = padL + i * slotW + slotW / 2;
          const top = yFps(m.avgFps);
          const h = H - padB - top;
          const isLast = i === sessions.length - 1;
          return `
            <rect class="chart-bar-anim" style="animation-delay:${i * 35}ms" x="${cx - barW / 2}" y="${top}" width="${barW}" height="${Math.max(2, h)}" rx="5"
                  fill="${isLast ? '#2B7FFF' : 'rgba(249,106,27,0.78)'}" />
            <text x="${cx}" y="${top - 7}" fill="${isLast ? '#6CB2FF' : '#F4F6FA'}" font-family="Consolas,monospace" font-size="10.5" font-weight="600" text-anchor="middle">${m.avgFps}</text>
            <text x="${cx}" y="${H - 15}" fill="#6B788E" font-family="Consolas,monospace" font-size="9.5" text-anchor="middle">${m.dateLabel}</text>
            <text x="${cx}" y="${H - 3}" fill="#96A3B8" font-family="Consolas,monospace" font-size="9" text-anchor="middle">${m.pctUnder240}% &lt;240</text>`;
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
      <td><strong style="color:${idx === 0 ? '#5AC8FA' : '#F5F7FA'}">${m.avgFps}</strong></td>
      <td>${m.avgFrametimeMs} ms</td>
      <td>${m.pctUnder240}%</td>
      <td>${m.pctOver240}%</td>
      <td>${m.framesOver480}</td>
      <td>${m.avgEngineLatencyMs} ms</td>
      <td>${m.gpuTimeMs} ms (${m.gpuCapacityFps})</td>
      <td><span class="${m.bottleneck === 'CPU-Bound' ? 'pill-red' : 'pill-blue'}">${m.bottleneck}</span></td>
    </tr>`
    )
    .join('');
}

$('btn-refresh-telemetry').onclick = loadTelemetry;

// ---------------- PRE-MATCH BOOST ----------------
async function loadHogs() {
  try {
    const activeGame = getActiveGame();
    const res = await window.frameforge.scanHogs(activeGame.id);
    state.hogs = res.hogs || [];
    $('boost-free-ram').textContent = `${res.freeRamGB} / ${res.totalRamGB} GB`;
    $('boost-hog-count').textContent = state.hogs.length;
    const totalMB = state.hogs.reduce((s, h) => s + h.mb, 0);
    $('boost-reclaim-mb').textContent = `${Math.round(totalMB)} MB`;

    const list = $('boost-list');
    if (!state.hogs.length) {
      list.innerHTML = `<div class="empty-state" style="color:#5AC8FA;">No heavy background apps detected.</div>`;
      return;
    }

    list.innerHTML = state.hogs
      .map(
        (h) => `
      <label class="boost-row">
        <div class="boost-left">
          <span class="apple-switch">
            <input type="checkbox" class="hog-check" data-name="${h.name}" ${h.defaultCheck ? 'checked' : ''} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </span>
          <div>
            <div style="font-weight:600">${h.label || h.name} <span class="pill-neutral">${h.category || 'Background'}</span> ${h.isOverlay ? '<span class="pill-red">Overlay (disable in app)</span>' : ''}${h.keepForGame ? `<span class="pill-blue">Needed for ${activeGame.shortName}</span>` : ''}${h.needsAdmin ? '<span class="pill-opt">Needs admin</span>' : ''}</div>
            <div style="font-size:11.5px;color:#6B788E">${h.name}.exe (${h.count} process${h.count === 1 ? '' : 'es'})</div>
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
  if (!names.length) return showToast('No processes selected.');
  $('btn-purge-hogs').disabled = true;
  $('btn-purge-hogs').textContent = 'Closing…';
  try {
    const res = await window.frameforge.purgeHogs(names);
    const still = res.stillRunning || [];
    if (still.length > 0 && res.needsAdmin) {
      showToast(`${still.join(', ')} is running elevated and needs admin to close.`, 4500);
      await loadHogs();
      await ensureAdmin(`Close elevated apps (${still.join(', ')})`);
      return;
    }
    if (still.length > 0) {
      showToast(`Closed ${res.closedCount} process(es), freed ${res.freedMB} MB. Still running: ${still.join(', ')}.`, 4500);
    } else if (res.closedCount > 0) {
      showToast(`Closed ${res.closedCount} process(es), freed ~${res.freedMB} MB RAM.`);
    } else {
      showToast('Selected processes were already closed.');
    }
    await loadHogs();
  } catch (err) {
    showToast(`Close failed: ${err.message}`);
  } finally {
    $('btn-purge-hogs').disabled = false;
    $('btn-purge-hogs').textContent = 'Close Selected';
  }
};
$('btn-launch-val').onclick = async () => {
  const g = getActiveGame();
  const res = await window.frameforge.launchGame(g.id);
  if (res.stdout && res.stdout.includes('LAUNCHED')) showToast(`Launching ${g.name}…`);
  else showToast(`Could not auto-launch ${g.name} — verify it is installed.`);
};

// ---------------- SUPPORT SHEET ----------------
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
  syncModalDim();
}

function closeTipModal() {
  if ($('chk-tip-optout').checked) {
    localStorage.setItem('bf_tip_optout', '1');
  }
  $('tip-modal-backdrop').classList.add('hidden');
  syncModalDim();
}

function maybePromptTip(title, body) {
  if (localStorage.getItem('bf_tip_optout') === '1') return;
  if (sessionStorage.getItem('bf_tip_shown_session') === '1') return;
  sessionStorage.setItem('bf_tip_shown_session', '1');
  setTimeout(() => openTipModal(title, body), 600);
}

$('btn-tip-sidebar').onclick = () =>
  openTipModal(
    'Support BareFrame',
    'BareFrame is free and MIT open-source with no paywalls or ads. Optional Ko-fi tips (0% platform fee) help cover Windows code-signing and ongoing hardware testing.'
  );
$('btn-tip-banner').onclick = () =>
  openTipModal(
    'Support BareFrame',
    'BareFrame has no paid tiers or accounts. Optional Ko-fi tips help fund code-signing and updates.'
  );
$('btn-tip-close').onclick = closeTipModal;

// ---------------- AUTOMATIC UPDATER (Launch + Bottom Bar + Real Byte Progress) ----------------
let latestUpdateInfo = null;

const updateBarSpring = new Spring1D(0, {
  damping: 1.0,
  response: 0.24,
  onUpdate: (v) => {
    const c = Math.max(0, Math.min(100, v));
    const pctStr = `${c.toFixed(1)}%`;
    $('bottom-update-fill').style.width = pctStr;
    $('update-progress-fill').style.width = pctStr;
  },
});

function formatUpdateSize(info) {
  if (info.sizeDisplay) return info.sizeDisplay;
  if (info.sizeBytes > 0 && info.sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(info.sizeBytes / 1024))} KB`;
  }
  return info.sizeMB > 0 ? `${info.sizeMB} MB` : '';
}

function showBottomUpdateBar(info) {
  const isPatch = info.updateType === 'patch';
  const sizeTxt = formatUpdateSize(info);
  $('bottom-update-title').textContent = `BareFrame v${info.latestVersion} is ready`;
  $('bottom-update-meta').textContent = isPatch
    ? (sizeTxt ? `${sizeTxt} patch · Instant restart` : 'Lightweight app patch')
    : (sizeTxt ? `${sizeTxt} full installer (${info.assetName})` : info.assetName || '');
  $('btn-bottom-install-update').textContent = isPatch ? 'Install patch' : 'Install update';
  $('btn-bottom-install-update').disabled = false;
  $('btn-bottom-update-dismiss').classList.remove('hidden');
  $('bottom-update-prog').classList.add('hidden');
  $('bottom-update-bar').classList.remove('hidden');
  document.body.classList.add('has-bottom-update');
}

function hideBottomUpdateBar() {
  $('bottom-update-bar').classList.add('hidden');
  document.body.classList.remove('has-bottom-update');
}

let currentAppVersion = '0.1.0';

async function initUpdater() {
  try {
    const ver = await window.frameforge.getAppVersion();
    currentAppVersion = ver;
    const pill = $('app-version-pill');
    if (pill) pill.textContent = `v${ver}`;
    const betaPill = $('app-beta-pill');
    if (betaPill) betaPill.classList.toggle('hidden', !String(ver).startsWith('0.'));
  } catch {}
  runUpdateCheck();
  setInterval(() => runUpdateCheck(), 30 * 60 * 1000);
}

async function runUpdateCheck() {
  try {
    const info = await window.frameforge.checkForUpdate();
    latestUpdateInfo = info;
    if (info.hasUpdate && info.downloadUrl) {
      const upPill = $('btn-update-pill');
      upPill.textContent = `Update v${info.latestVersion}`;
      upPill.classList.remove('hidden');
      showBottomUpdateBar(info);
    }
  } catch {
    // Silent background update check
  }
}

function openUpdateModal(info) {
  const isPatch = info.updateType === 'patch';
  const sizeTxt = formatUpdateSize(info);
  $('update-modal-title').textContent = `Update to BareFrame v${info.latestVersion}`;
  $('update-modal-body').textContent = isPatch
    ? `Installed: v${info.currentVersion} → New: v${info.latestVersion} (${sizeTxt} verified patch). Downloads only changed app files from GitHub Releases, verifies SHA-256, and restarts automatically.`
    : `Installed: v${info.currentVersion} → New: v${info.latestVersion} (${info.assetName}, ${sizeTxt} full Electron installer). Downloads from GitHub Releases, installs silently, and relaunches automatically.`;
  $('update-progress-wrap').classList.add('hidden');
  $('btn-update-install').disabled = false;
  $('btn-update-install').textContent = isPatch ? 'Download & Apply Patch' : 'Download & Install';
  $('update-modal-backdrop').classList.remove('hidden');
  syncModalDim();
}

window.frameforge.onUpdateProgress((p) => {
  const speedPart = p.speedMBps > 0 && p.pct < 100 && (!p.totalBytes || p.totalBytes >= 1048576)
    ? ` · ${p.speedMBps} MB/s`
    : '';
  let sizePart = '';
  if (p.receivedDisplay) {
    sizePart = p.totalDisplay ? `${p.receivedDisplay} / ${p.totalDisplay}` : p.receivedDisplay;
  } else {
    sizePart = p.totalMB > 0 ? `${p.receivedMB} / ${p.totalMB} MB` : `${p.receivedMB} MB`;
  }
  const liveTxt =
    p.pct >= 100
      ? p.status || 'Installing & restarting BareFrame…'
      : `Downloading ${sizePart}${speedPart}`;

  updateBarSpring.animateTo(p.pct);
  $('update-progress-pct').textContent = `${p.pct}%`;
  $('update-progress-text').textContent = liveTxt;

  $('bottom-update-pct').textContent = `${p.pct}%`;
  $('bottom-update-status').textContent = liveTxt;
});

async function triggerInstallUpdate() {
  if (!latestUpdateInfo || !latestUpdateInfo.downloadUrl) return;
  const isPatch = latestUpdateInfo.updateType === 'patch';
  $('update-modal-backdrop').classList.add('hidden');
  syncModalDim();

  // Always show live progress in the bottom bar
  $('bottom-update-bar').classList.remove('hidden');
  document.body.classList.add('has-bottom-update');
  $('btn-bottom-update-dismiss').classList.add('hidden');
  $('btn-bottom-install-update').disabled = true;
  $('btn-bottom-install-update').textContent = isPatch ? 'Patching…' : 'Downloading…';
  $('bottom-update-prog').classList.remove('hidden');
  updateBarSpring.setImmediate(0);
  $('bottom-update-pct').textContent = '0%';
  $('bottom-update-status').textContent = 'Connecting to GitHub Releases…';

  $('btn-update-install').disabled = true;
  $('btn-update-install').textContent = isPatch ? 'Patching…' : 'Downloading…';
  $('update-progress-wrap').classList.remove('hidden');
  $('update-progress-pct').textContent = '0%';
  $('update-progress-text').textContent = 'Connecting to GitHub Releases…';

  try {
    await window.frameforge.installUpdate({
      downloadUrl: latestUpdateInfo.downloadUrl,
      latestVersion: latestUpdateInfo.latestVersion,
      isPortable: latestUpdateInfo.isPortable,
      sizeBytes: latestUpdateInfo.sizeBytes || 0,
      updateType: latestUpdateInfo.updateType || 'full',
      patchSha256: latestUpdateInfo.patchSha256 || null,
      electronMajor: latestUpdateInfo.electronMajor || 0,
    });
    updateBarSpring.animateTo(100);
    $('bottom-update-pct').textContent = '100%';
    $('bottom-update-status').textContent = isPatch
      ? 'Patch applied — restarting BareFrame…'
      : 'Installing & restarting BareFrame…';
    $('btn-bottom-install-update').textContent = 'Restarting…';
    showToast(isPatch ? 'Patch applied — restarting BareFrame…' : 'Installing update and restarting BareFrame…');
  } catch (err) {
    showToast(`Update failed: ${err.message}`);
    $('btn-bottom-install-update').disabled = false;
    $('btn-bottom-install-update').textContent = 'Retry Update';
    $('btn-bottom-update-dismiss').classList.remove('hidden');
    $('btn-update-install').disabled = false;
    $('btn-update-install').textContent = 'Retry Update';
  }
}

$('btn-update-pill').onclick = () => {
  if (latestUpdateInfo) showBottomUpdateBar(latestUpdateInfo);
};
$('btn-bottom-install-update').onclick = triggerInstallUpdate;
$('btn-bottom-update-dismiss').onclick = hideBottomUpdateBar;
$('btn-update-later').onclick = () => {
  $('update-modal-backdrop').classList.add('hidden');
  syncModalDim();
};
$('btn-update-install').onclick = triggerInstallUpdate;

// ---------------- GAME PROFILE SELECTOR (FIRST BOOT + SWITCHER) ----------------
function applyGameUi() {
  const g = getActiveGame();
  $('sidebar-game-name').textContent = g.shortName;
  $('overview-title').textContent = g.id === 'all' ? 'Overview' : g.name;
  $('overview-subtitle').textContent =
    `${g.antiCheat} safe, automatic Restore Point, and 12 tailored optimizations with one-click rollback`;
  $('hero-cta-desc').textContent =
    `Tailored for ${g.name}. Creates a System Restore Point and backups first, then applies Windows scheduler, kernel timer, power plan, USB/Ethernet, GPU MSI-X, Memory Compression, ShadowPlay, and ${g.shortName}-specific adjustments (${g.tweakSummary}).`;
  $('hero-vbs-sub').textContent = g.vbsNote;

  const launchBtn = $('btn-launch-val');
  if (g.launchLabel) {
    launchBtn.textContent = g.launchLabel;
    launchBtn.classList.remove('hidden');
  } else {
    launchBtn.classList.add('hidden');
  }

  const telNotice = $('telemetry-game-notice');
  if (g.hasTelemetry) {
    telNotice.classList.add('hidden');
  } else {
    telNotice.textContent = `Active profile: ${g.name}. Automated local log parsing currently reads VALORANT (ShooterGame.log); parsers for ${g.name} are planned next. Any local VALORANT logs still display below.`;
    telNotice.classList.remove('hidden');
  }
}

function renderGamePickerCards(animateStagger = false) {
  const grid = $('game-picker-grid');
  grid.innerHTML = state.games
    .map((g, idx) => {
      const selected = state.pendingGameId === g.id;
      const installed = Boolean(state.installedGames[g.id]) && g.id !== 'all';
      return `
      <button type="button" class="game-card ${selected ? 'selected' : ''} ${animateStagger ? 'game-card-enter' : ''}" style="${animateStagger ? `animation-delay:${idx * 28}ms` : ''}" data-game-id="${g.id}">
        <div class="game-card-top">
          <div>
            <div class="game-card-name">${g.name}</div>
            <div class="game-card-meta">${g.engine.replace(/\s*·\s*/g, ', ')}, ${g.antiCheat.replace(/\s*·\s*/g, ', ')}</div>
          </div>
          <div class="game-card-badges">
            ${installed ? '<span class="game-installed-tag">Installed</span>' : ''}
            <span class="game-check-indicator">${selected ? '✓' : ''}</span>
          </div>
        </div>
        <div class="game-card-desc">${g.tweakSummary}</div>
      </button>`;
    })
    .join('');

  grid.querySelectorAll('.game-card').forEach((card) => {
    card.addEventListener('pointerdown', () => {
      state.pendingGameId = card.dataset.gameId;
      updateGamePickerSelection();
    });
    card.ondblclick = () => {
      state.pendingGameId = card.dataset.gameId;
      confirmGameSelection();
    };
  });
}

function updateGamePickerSelection(animateStagger = false) {
  renderGamePickerCards(animateStagger);
  const confirmBtn = $('btn-game-picker-confirm');
  const note = $('game-picker-selected-note');
  const chosen = state.games.find((g) => g.id === state.pendingGameId);
  if (chosen) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = `Continue with ${chosen.shortName}`;
    note.textContent = `${chosen.name} selected (12 tailored optimizations ready)`;
  } else {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Continue';
    note.textContent = 'Select a game profile to continue.';
  }
}

function openGamePicker(isFirstBoot = false) {
  const isBeta = String(currentAppVersion).startsWith('0.');
  $('game-picker-kicker').textContent = isFirstBoot
    ? (isBeta ? `BareFrame Beta (v${currentAppVersion})` : `BareFrame v${currentAppVersion}`)
    : 'Switch game profile';
  $('btn-game-picker-cancel').classList.toggle('hidden', isFirstBoot);
  if (!state.pendingGameId) {
    state.pendingGameId = state.gameId || Object.keys(state.installedGames).find((k) => k !== 'all' && state.installedGames[k]) || 'valorant';
  } else if (!isFirstBoot) {
    state.pendingGameId = state.gameId;
  }
  updateGamePickerSelection(true);
  $('game-picker-overlay').classList.remove('hidden');
  syncModalDim();
}

async function confirmGameSelection() {
  if (!state.pendingGameId) return;
  const changed = state.gameId !== state.pendingGameId;
  state.gameId = state.pendingGameId;
  localStorage.setItem('bf_selected_game', state.gameId);
  $('game-picker-overlay').classList.add('hidden');
  syncModalDim();
  applyGameUi();
  await initTweaks();
  await loadAudit();
  if ($('tab-boost').classList.contains('active')) loadHogs();
  if (changed) showToast(`Profile switched to ${getActiveGame().name}.`);
}

$('btn-switch-game').onclick = () => openGamePicker(false);
$('btn-game-picker-cancel').onclick = () => {
  $('game-picker-overlay').classList.add('hidden');
  syncModalDim();
};
$('btn-game-picker-confirm').onclick = confirmGameSelection;

async function bootApp() {
  initSupport();

  const [ver, games, installed] = await Promise.all([
    window.frameforge.getAppVersion().catch(() => '0.1.0'),
    window.frameforge.getGames(),
    window.frameforge.detectGames(),
  ]);
  currentAppVersion = ver;
  const pill = $('app-version-pill');
  if (pill) pill.textContent = `v${ver}`;
  const betaPill = $('app-beta-pill');
  if (betaPill) betaPill.classList.toggle('hidden', !String(ver).startsWith('0.'));

  runUpdateCheck();
  setInterval(() => runUpdateCheck(), 30 * 60 * 1000);

  state.games = games || [];
  state.installedGames = installed || {};

  if (!state.gameId || !state.games.some((g) => g.id === state.gameId)) {
    state.pendingGameId = Object.keys(state.installedGames).find((k) => k !== 'all' && state.installedGames[k]) || 'valorant';
    openGamePicker(true);
  } else {
    applyGameUi();
    await initTweaks();
    await loadAudit();
  }
}

bootApp();
