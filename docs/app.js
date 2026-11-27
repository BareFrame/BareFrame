/* ==========================================================================
   FrameForge — Apple Fluid Physics Engine (Zero Dependencies)
   Implements:
   - Interruptible analytical springs (damping ratio + response, §4)
   - Velocity handoff (§5) & Apple's exponential momentum projection (§6)
   - Progressive rubber-banding at boundaries (§9)
   - 1:1 Pointer Events + setPointerCapture with grab-offset preservation (§2)
   - Reduced-motion compliance (§14)
   ========================================================================== */

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Interruptible 1D Spring Driver using Apple's (dampingRatio, response) parameters.
 * Always animates from the live presentation value and preserves velocity on retarget.
 */
class Spring1D {
  constructor(initialValue, { damping = 1.0, response = 0.36, onUpdate, onComplete } = {}) {
    this.value = initialValue;
    this.target = initialValue;
    this.velocity = 0;
    this.damping = damping;
    this.response = response;
    this.onUpdate = onUpdate || (() => {});
    this.onComplete = onComplete || null;
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

  animateTo(target, { velocity = null, damping = this.damping, response = this.response, onComplete = null } = {}) {
    this.target = target;
    this.damping = damping;
    this.response = response;
    this.onComplete = onComplete;
    if (velocity !== null) this.velocity = velocity;

    if (prefersReducedMotion()) {
      this.setImmediate(target);
      if (this.onComplete) this.onComplete();
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

    // Convert Apple (dampingRatio, response) to stiffness k & damping c
    const omega = (2 * Math.PI) / Math.max(0.05, this.response);
    const k = omega * omega;
    const c = 2 * this.damping * omega;

    const displacement = this.value - this.target;
    const accel = -k * displacement - c * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;

    const settled = Math.abs(this.value - this.target) < 0.05 && Math.abs(this.velocity) < 0.5;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.onUpdate(this.value);
      this.raf = null;
      if (this.onComplete) this.onComplete();
      return;
    }

    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this._tick);
  };
}

// Apple's exact momentum projection (§6)
function projectMomentum(velocityPxPerSec, decelerationRate = 0.998) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Apple's progressive rubber-banding (§9)
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* --------------------------------------------------------------------------
   1. Scroll-Aware Translucent Chrome (§12)
   -------------------------------------------------------------------------- */
const topbar = document.getElementById('topbar');
function syncTopbar() {
  topbar.classList.toggle('scrolled', window.scrollY > 12);
}
window.addEventListener('scroll', syncTopbar, { passive: true });
syncTopbar();

/* --------------------------------------------------------------------------
   2. Interactive 1-Click Optimize Prototype (Spring Gauge + Progress + Breakdown)
   -------------------------------------------------------------------------- */
const TWEAKS_DATA = [
  { name: 'CPU Scheduler & MMCSS Games', desc: 'SystemResponsiveness=0, Games Priority 6 / High, Win32PrioritySeparation=0x26.', opt: false },
  { name: 'Global Timer & Static Desktop Tick', desc: 'GlobalTimerResolutionRequests=1, PowerThrottlingOff=1, disabledynamictick yes (desktops).', opt: false },
  { name: 'Ultimate Hybrid P-Core Power Plan', desc: '0% core parking, Aggressive boost, P-core scheduling priority, USB/PCIe sleep OFF.', opt: false },
  { name: 'USB & Peripheral Power-Saving OFF', desc: 'Stops Windows from suspending USB Root Hubs, wireless mice & high-polling keyboards.', opt: false },
  { name: 'GPU MSI-X & High Interrupt Priority', desc: 'Auto-detects NVIDIA/AMD PCIe GPU & audio controller; enables MSI-X High Priority.', opt: false },
  { name: 'Wired Ethernet Low-Latency Tuning', desc: 'Disables EEE, Green Ethernet, Flow Control & Interrupt Moderation on wired NIC.', opt: false },
  { name: 'Memory Compression & Services OFF', desc: 'Disables RAM compression (≥16GB), SysMain, DiagTrack, WerSvc & CEIP tasks.', opt: false },
  { name: 'Defender Game Folder Exclusions', desc: 'Excludes Riot Games & VALORANT AppData from mid-match real-time AV scans.', opt: false },
  { name: 'Game Mode, GameDVR OFF & IFEO High', desc: 'Locks Game Mode ON, GameDVR & background UWP apps OFF, game CPU priority High.', opt: false },
  { name: 'Valorant .ini Scalability Cleanup', desc: 'Sets hidden sg.*Quality=0 & ImproveClarity=False while keeping res, sens & crosshairs.', opt: false },
  { name: 'ShadowPlay Background Capture OFF', desc: 'Disables 120 FPS ShadowPlay recording flags to eliminate D3D capture hook overhead.', opt: false },
  { name: 'Bare-Metal Mode (VBS & HVCI OFF)', desc: '+10–18% CPU FPS by removing Hyper-V virtualization tax. Keeps TPM & Secure Boot ON.', opt: true },
];

const RING_CIRC = 414.69;
const demoRing = document.getElementById('demo-ring');
const demoScoreEl = document.getElementById('demo-score');
const demoVerdict = document.getElementById('demo-verdict');
const stageChip = document.getElementById('stage-status-chip');
const btnDemoOpt = document.getElementById('btn-demo-optimize');
const btnDemoDownload = document.getElementById('btn-demo-download');
const btnDemoReset = document.getElementById('btn-demo-reset');
const demoVbsChk = document.getElementById('demo-vbs-chk');
const demoProgWrap = document.getElementById('demo-progress-wrap');
const demoProgBar = document.getElementById('demo-progress-bar');
const demoProgText = document.getElementById('demo-progress-text');
const demoProgPct = document.getElementById('demo-progress-pct');
const demoDoneGrid = document.getElementById('demo-done-grid');

demoVbsChk.addEventListener('change', () => {
  if (!btnDemoReset.classList.contains('hidden')) {
    scoreSpring.animateTo(demoVbsChk.checked ? 100 : 85);
    demoVerdict.textContent = demoVbsChk.checked ? 'Tournament Ready · Bare-Metal' : 'Well Optimized (VBS On)';
  }
});

const scoreSpring = new Spring1D(42, {
  damping: 1.0,
  response: 0.45,
  onUpdate: (v) => {
    const clamped = Math.max(0, Math.min(100, v));
    demoScoreEl.textContent = String(Math.round(clamped));
    demoRing.style.strokeDashoffset = (RING_CIRC * (1 - clamped / 100)).toFixed(2);
    demoRing.style.stroke = clamped >= 85 ? 'url(#bfRingGrad)' : clamped >= 65 ? '#38BDF8' : '#FF2D55';
  },
});

const progSpring = new Spring1D(0, {
  damping: 1.0,
  response: 0.32,
  onUpdate: (v) => {
    const c = Math.max(0, Math.min(100, v));
    demoProgBar.style.width = `${c.toFixed(1)}%`;
    demoProgPct.textContent = `${Math.round(c)}%`;
  },
});

let demoTimer = null;

function resetDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  scoreSpring.animateTo(42);
  progSpring.setImmediate(0);
  demoProgWrap.classList.add('hidden');
  demoDoneGrid.classList.add('hidden');
  demoDoneGrid.innerHTML = '';
  btnDemoReset.classList.add('hidden');
  btnDemoDownload.classList.add('hidden');
  btnDemoOpt.disabled = false;
  btnDemoOpt.querySelector('.btn-label').textContent = 'Preview Optimize';
  demoVerdict.textContent = 'Baseline Windows PC';
  stageChip.textContent = 'Ready';
}

btnDemoOpt.addEventListener('click', () => {
  clearInterval(demoTimer);
  const includeVbs = demoVbsChk.checked;
  const steps = includeVbs ? TWEAKS_DATA : TWEAKS_DATA.filter((t) => !t.opt);
  const targetScore = includeVbs ? 100 : 85;

  btnDemoOpt.disabled = true;
  btnDemoOpt.querySelector('.btn-label').textContent = 'Simulating…';
  btnDemoReset.classList.add('hidden');
  btnDemoDownload.classList.add('hidden');
  demoProgWrap.classList.remove('hidden');
  demoDoneGrid.classList.remove('hidden');
  demoDoneGrid.innerHTML = '';
  stageChip.textContent = 'Running Preview…';
  progSpring.setImmediate(4);
  scoreSpring.animateTo(46);

  let idx = 0;
  demoTimer = setInterval(() => {
    if (idx >= steps.length) {
      clearInterval(demoTimer);
      demoTimer = null;
      progSpring.animateTo(100);
      scoreSpring.animateTo(targetScore);
      demoProgText.textContent = `Preview complete (${steps.length} tweaks + System Restore Point)`;
      demoVerdict.textContent = includeVbs ? 'Tournament Ready · Bare-Metal' : 'Well Optimized (VBS On)';
      stageChip.textContent = 'Preview Complete';
      btnDemoOpt.disabled = false;
      btnDemoOpt.querySelector('.btn-label').textContent = 'Replay Preview';
      btnDemoDownload.classList.remove('hidden');
      btnDemoReset.classList.remove('hidden');
      return;
    }

    const item = steps[idx];
    const pct = ((idx + 1) / steps.length) * 100;
    demoProgText.textContent = `${idx + 1}/${steps.length} · ${item.name}`;
    progSpring.animateTo(pct);
    scoreSpring.animateTo(42 + ((targetScore - 42) * (idx + 1)) / steps.length);

    const chip = document.createElement('div');
    chip.className = 'done-chip';
    chip.innerHTML = `<i>✓</i><span>${item.name}</span>`;
    demoDoneGrid.appendChild(chip);
    requestAnimationFrame(() => chip.classList.add('in'));
    idx++;
  }, prefersReducedMotion() ? 40 : 190);
});

btnDemoReset.addEventListener('click', resetDemo);

/* --------------------------------------------------------------------------
   3. Interruptible Spring Segmented Control (Telemetry Tabs)
   -------------------------------------------------------------------------- */
const TELEMETRY_VIEWS = {
  tdm: [
    { val: '+35%', cls: 'blue', lbl: 'Average FPS gain', note: '220 → 298 FPS in nonstop TDM' },
    { val: '−84%', cls: 'red', lbl: 'Fewer sudden FPS dips', note: 'Sub-240 drops cut from 32.3% to 5.2%' },
    { val: '94.5%', cls: 'ice', lbl: 'Match held above 240 FPS', note: 'Up from 67.2% on stock Windows' },
    { val: '4.68 ms', cls: '', lbl: 'Average engine latency', note: '0.72 ms faster response time' },
  ],
  comp: [
    { val: '422 FPS', cls: 'blue', lbl: 'Live 5v5 match average', note: 'Captured from real match telemetry' },
    { val: '0.89 ms', cls: 'ice', lbl: 'Mean GPU frame time', note: 'Over 1,100 FPS GPU headroom' },
    { val: '3,652', cls: 'red', lbl: 'Frames exceeding 480 FPS', note: 'Up from 0 frames before tuning' },
    { val: '30.5%', cls: '', lbl: 'System RAM utilization', note: 'Down from 45.4% (0 MB compression)' },
  ],
  dips: [
    { val: '5.2%', cls: 'blue', lbl: 'Frames under 240 FPS', note: 'Cut more than 6× from 32.3%' },
    { val: '0', cls: 'ice', lbl: 'Severe mid-fight hitches', note: 'Eliminated AV & memory spikes' },
    { val: '4.10 GHz', cls: 'red', lbl: 'Sustained P-core clock', note: 'Locked flat after BIOS PL1 unlock' },
    { val: '0', cls: '', lbl: 'VBS hypervisor overhead', note: 'Bare-metal kernel execution active' },
  ],
};

const segWrap = document.getElementById('bench-segmented');
const segThumb = document.getElementById('segmented-thumb');
const segButtons = [...segWrap.querySelectorAll('.seg-btn')];

const thumbX = new Spring1D(0, {
  damping: 1.0,
  response: 0.3,
  onUpdate: (x) => {
    segThumb.style.transform = `translateX(${x.toFixed(2)}px)`;
  },
});

function positionSegThumb(btn, immediate = false) {
  const rect = btn.getBoundingClientRect();
  const parentRect = segWrap.getBoundingClientRect();
  const padLeft = parseFloat(getComputedStyle(segWrap).paddingLeft) || 0;
  const x = rect.left - parentRect.left - padLeft;
  segThumb.style.width = `${rect.width}px`;
  if (immediate) thumbX.setImmediate(x);
  else thumbX.animateTo(x);
}

function selectSegView(btn, immediate = false) {
  segButtons.forEach((b) => {
    const active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  positionSegThumb(btn, immediate);
  const items = TELEMETRY_VIEWS[btn.dataset.view];
  items.forEach((m, i) => {
    const n = i + 1;
    const vEl = document.getElementById(`m-val-${n}`);
    vEl.textContent = m.val;
    vEl.className = `metric-value tabular ${m.cls}`;
    document.getElementById(`m-lbl-${n}`).textContent = m.lbl;
    document.getElementById(`m-note-${n}`).textContent = m.note;
  });
}

segButtons.forEach((btn) => {
  btn.addEventListener('pointerdown', () => selectSegView(btn));
  btn.addEventListener('click', () => selectSegView(btn));
});
window.addEventListener('resize', () => {
  const active = segWrap.querySelector('.seg-btn.active');
  if (active) positionSegThumb(active, true);
});
requestAnimationFrame(() => positionSegThumb(segButtons[0], true));

/* --------------------------------------------------------------------------
   4. 1:1 Direct-Manipulation Scrubber (Pointer Events + Momentum + Rubberband)
   -------------------------------------------------------------------------- */
const STAGES = [
  { pill: 'Stage 1 · Stock', fps: 220, delta: 'Baseline', cap: 'Stock Windows 11 + NVIDIA Overlay (120fps) + 65W PL1 throttle + VBS/HVCI ON' },
  { pill: 'Stage 2 · Windows', fps: 250, delta: '+14% FPS', cap: 'BareFrame Scheduler, Kernel, USB/NIC, Memory Compression & ShadowPlay OFF' },
  { pill: 'Stage 3 · BIOS PL1', fps: 255, delta: '−16% dips', cap: 'ASUS PL1/PL2 unlocked — P-cores locked 4.10–4.48 GHz instead of 3.45 GHz' },
  { pill: 'Stage 4 · HVCI Off', fps: 274, delta: '−60% dips', cap: 'Memory Integrity OFF — sub-240 FPS dips plunged from 32.3% down to 12.8%' },
  { pill: 'Stage 5 · Bare-Metal', fps: 298, delta: '−84% dips', cap: 'Bare-Metal VBS=0 · Only 5.2% frames dipped below 240 FPS · 3,652 frames >480 FPS' },
];

const track = document.getElementById('scrubber-track');
const knob = document.getElementById('scrubber-knob');
const fill = document.getElementById('scrubber-fill');
const sPill = document.getElementById('scrubber-stage-pill');
const sFps = document.getElementById('scrubber-fps');
const sCap = document.getElementById('scrubber-caption');
const sDelta = document.getElementById('scrubber-delta');

let currentStageIdx = 4;
const stageXSpring = new Spring1D(1, {
  damping: 0.85,
  response: 0.34,
  onUpdate: (norm) => {
    const pct = norm * 100;
    knob.style.left = `${pct}%`;
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  },
});

function stageNorm(idx) {
  return (idx + 0.5) / STAGES.length;
}

function applyStageReadout(idx) {
  currentStageIdx = idx;
  const st = STAGES[idx];
  sPill.textContent = st.pill;
  sFps.innerHTML = `${st.fps} <small>FPS avg</small>`;
  sCap.textContent = st.cap;
  sDelta.textContent = st.delta;
  track.setAttribute('aria-valuenow', String(idx));
}

stageXSpring.setImmediate(stageNorm(4));
applyStageReadout(4);

let scrubbing = false;
let scrubGrabOffset = 0;
let scrubHistory = [];

track.addEventListener('pointerdown', (e) => {
  track.setPointerCapture(e.pointerId);
  scrubbing = true;
  stageXSpring.stop();
  const rect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();
  const knobCenter = knobRect.left + knobRect.width / 2;
  // Respect grab offset if grabbing knob directly; otherwise jump smoothly to tap point
  if (Math.abs(e.clientX - knobCenter) <= knobRect.width) {
    scrubGrabOffset = e.clientX - knobCenter;
  } else {
    scrubGrabOffset = 0;
    const rawNorm = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(stageNorm(0), Math.min(stageNorm(STAGES.length - 1), rawNorm));
    stageXSpring.setImmediate(clamped);
    applyStageReadout(Math.max(0, Math.min(STAGES.length - 1, Math.floor(rawNorm * STAGES.length))));
  }
  scrubHistory = [{ x: e.clientX, t: performance.now() }];
});

track.addEventListener('pointermove', (e) => {
  if (!scrubbing) return;
  const rect = track.getBoundingClientRect();
  const minX = rect.width * stageNorm(0);
  const maxX = rect.width * stageNorm(STAGES.length - 1);
  let x = e.clientX - scrubGrabOffset - rect.left;

  // Rubber-band past edges (§9)
  if (x < minX) x = minX + rubberband(x - minX, rect.width * 0.25);
  else if (x > maxX) x = maxX + rubberband(x - maxX, rect.width * 0.25);

  stageXSpring.setImmediate(x / rect.width);
  const nearest = Math.max(0, Math.min(STAGES.length - 1, Math.floor((x / rect.width) * STAGES.length)));
  if (nearest !== currentStageIdx) applyStageReadout(nearest);

  const now = performance.now();
  scrubHistory.push({ x: e.clientX, t: now });
  while (scrubHistory.length > 5 && now - scrubHistory[0].t > 100) scrubHistory.shift();
});

function endScrub() {
  if (!scrubbing) return;
  scrubbing = false;
  const rect = track.getBoundingClientRect();
  let velocityPx = 0;
  if (scrubHistory.length >= 2) {
    const first = scrubHistory[0];
    const last = scrubHistory[scrubHistory.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt > 0.005) velocityPx = (last.x - first.x) / dt;
  }

  // Project momentum to choose resting stage (§6)
  const currentPx = stageXSpring.value * rect.width;
  const projectedPx = currentPx + projectMomentum(velocityPx, 0.992);
  const targetIdx = Math.max(0, Math.min(STAGES.length - 1, Math.floor((projectedPx / rect.width) * STAGES.length)));
  applyStageReadout(targetIdx);

  // Hand off velocity to spring (§5) — slight bounce only when flicked
  const hadMomentum = Math.abs(velocityPx) > 180;
  stageXSpring.animateTo(stageNorm(targetIdx), {
    velocity: velocityPx / rect.width,
    damping: hadMomentum ? 0.82 : 1.0,
    response: 0.32,
  });
}

track.addEventListener('pointerup', endScrub);
track.addEventListener('pointercancel', endScrub);
track.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && currentStageIdx > 0) {
    applyStageReadout(currentStageIdx - 1);
    stageXSpring.animateTo(stageNorm(currentStageIdx), { damping: 1.0, response: 0.3 });
  } else if (e.key === 'ArrowRight' && currentStageIdx < STAGES.length - 1) {
    applyStageReadout(currentStageIdx + 1);
    stageXSpring.animateTo(stageNorm(currentStageIdx), { damping: 1.0, response: 0.3 });
  }
});

/* --------------------------------------------------------------------------
   5. Apple Draggable Sheet (1:1 Drag, Rubber-Band Up, Momentum Dismiss)
   -------------------------------------------------------------------------- */
const sheet = document.getElementById('tweak-sheet');
const scrim = document.getElementById('sheet-scrim');
const handleZone = document.getElementById('sheet-handle-zone');
const sheetList = document.getElementById('sheet-list');

sheetList.innerHTML = TWEAKS_DATA.map(
  (t) => `
  <div class="sheet-item">
    <div class="sheet-item-top">
      <strong>${t.name}</strong>
      <span class="sheet-item-badge ${t.opt ? 'opt' : ''}">${t.opt ? 'OPT-IN' : 'ANTI-CHEAT SAFE'}</span>
    </div>
    <p>${t.desc}</p>
  </div>`
).join('');

let sheetOpen = false;
let sheetDragging = false;
let sheetStartY = 0;
let sheetStartOffset = 0;
let sheetHistory = [];

const sheetY = new Spring1D(600, {
  damping: 0.88,
  response: 0.34,
  onUpdate: (y) => {
    sheet.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
  },
});

function openSheet() {
  sheetOpen = true;
  sheet.classList.remove('hidden');
  scrim.classList.remove('hidden');
  document.body.classList.add('sheet-open');
  const h = sheet.offsetHeight || 520;
  sheetY.setImmediate(h);
  requestAnimationFrame(() => {
    scrim.classList.add('visible');
    sheetY.animateTo(0, { damping: 0.92, response: 0.36 });
  });
}

function closeSheet(releaseVelocity = 0) {
  sheetOpen = false;
  scrim.classList.remove('visible');
  document.body.classList.remove('sheet-open');
  const h = (sheet.offsetHeight || 520) + 40;
  sheetY.animateTo(h, {
    velocity: Math.max(0, releaseVelocity),
    damping: 1.0,
    response: 0.28,
    onComplete: () => {
      if (!sheetOpen) {
        sheet.classList.add('hidden');
        scrim.classList.add('hidden');
      }
    },
  });
}

document.getElementById('btn-open-sheet').addEventListener('click', openSheet);
document.getElementById('btn-open-sheet-2').addEventListener('click', openSheet);
document.getElementById('btn-close-sheet').addEventListener('click', () => closeSheet(0));
scrim.addEventListener('click', () => closeSheet(0));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen) closeSheet(0);
});

handleZone.addEventListener('pointerdown', (e) => {
  handleZone.setPointerCapture(e.pointerId);
  sheetDragging = true;
  sheetY.stop(); // Interruptible mid-flight! (§3)
  sheetStartY = e.clientY;
  sheetStartOffset = sheetY.value;
  sheetHistory = [{ y: e.clientY, t: performance.now() }];
});

handleZone.addEventListener('pointermove', (e) => {
  if (!sheetDragging) return;
  let nextY = sheetStartOffset + (e.clientY - sheetStartY);
  // Rubber-band when pulling upward past 0 (§9)
  if (nextY < 0) nextY = rubberband(nextY, 260, 0.4);
  sheetY.setImmediate(nextY);

  const now = performance.now();
  sheetHistory.push({ y: e.clientY, t: now });
  while (sheetHistory.length > 5 && now - sheetHistory[0].t > 100) sheetHistory.shift();
});

function endSheetDrag() {
  if (!sheetDragging) return;
  sheetDragging = false;
  let velY = 0;
  if (sheetHistory.length >= 2) {
    const first = sheetHistory[0];
    const last = sheetHistory[sheetHistory.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt > 0.005) velY = (last.y - first.y) / dt;
  }

  // Project momentum (§6): dismiss if projected endpoint passes 38% of sheet height
  const h = sheet.offsetHeight || 520;
  const projectedY = sheetY.value + projectMomentum(velY, 0.992);
  if (projectedY > h * 0.38) {
    closeSheet(velY);
  } else {
    sheetY.animateTo(0, { velocity: velY, damping: 0.85, response: 0.32 });
  }
}

handleZone.addEventListener('pointerup', endSheetDrag);
handleZone.addEventListener('pointercancel', endSheetDrag);
