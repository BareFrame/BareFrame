/* ==========================================================================
   BareFrame — Client Interactions & Spring Mechanics (Zero Dependencies)
   - Interruptible 1D Spring for progress, tabs, and 5-stage scrubber
   - Exact 12-tweak manifest mirrored 1-to-1 from src/engine/tweaks.js
   - Interactive Windows dry-run console + expandable manifest rows
   ========================================================================== */

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class Spring1D {
  constructor(initialValue, { damping = 1.0, response = 0.34, onUpdate, onComplete } = {}) {
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
      if (this.onComplete) this.onComplete();
      return;
    }

    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this._tick);
  };
}

function projectMomentum(velocityPxPerSec, decelerationRate = 0.992) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* --------------------------------------------------------------------------
   1. Exact 12 Tweaks Data (1-to-1 parity with src/engine/tweaks.js)
   -------------------------------------------------------------------------- */
const TWEAKS_DATA = [
  {
    id: 'mmcss_scheduler',
    name: 'CPU Scheduler & MMCSS Games Priority',
    category: 'Kernel & CPU',
    filterGroup: 'Kernel & CPU',
    reboot: 'Reboot',
    opt: false,
    log: '[OK] MMCSS Games=High/Priority 6, SystemResponsiveness=0, Win32PrioritySeparation=0x26',
    desc: 'Raises Multimedia Class Scheduler priority for active games and tightens foreground thread quantum allocation for steadier 1% lows.',
    commands: 'HKLM\\...\\Multimedia\\SystemProfile -> SystemResponsiveness=0, NetworkThrottlingIndex=0xffffffff\nHKLM\\...\\Tasks\\Games -> GPU Priority=8, Priority=6, Scheduling Category=High\nHKLM\\...\\PriorityControl -> Win32PrioritySeparation=0x26',
    revert: 'Restores SystemResponsiveness=20, Games Priority=2 (Medium/Normal), and Win32PrioritySeparation=2.',
  },
  {
    id: 'kernel_timer',
    name: 'Global Timer Resolution, No Power Throttling & Static Tick',
    category: 'Kernel & CPU',
    filterGroup: 'Kernel & CPU',
    reboot: 'Reboot',
    opt: false,
    log: '[OK] GlobalTimerRes=1, PowerThrottlingOff=1, DisablePagingExecutive=1, DynamicTick=Off',
    desc: 'Stabilizes Windows 11 timer resolution across processes, disables Power Throttling, keeps kernel pages in RAM on 16 GB+ PCs, and disables dynamic tick on desktops (skipped on laptops).',
    commands: 'HKLM\\...\\Session Manager\\kernel -> GlobalTimerResolutionRequests=1\nHKLM\\...\\Power\\PowerThrottling -> PowerThrottlingOff=1\nDisablePagingExecutive=1 (>=16 GB RAM) & bcdedit /set disabledynamictick yes (desktop only)',
    revert: 'Removes GlobalTimerResolutionRequests, PowerThrottlingOff, resets DisablePagingExecutive=0, and deletes disabledynamictick.',
  },
  {
    id: 'power_plan',
    name: 'Ultimate Performance & Hybrid P-Core Power Plan',
    category: 'Power & Hardware',
    filterGroup: 'Power & Hardware',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Ultimate/High Performance tuned: 0% core parking, P-core priority, USB/PCIe suspend OFF',
    desc: 'Activates Ultimate or High Performance plan, unparks 100% of CPU cores, enables aggressive boost, prefers P-cores on hybrid Intel CPUs, and disables USB and PCIe link-state power saving.',
    commands: 'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61\npowercfg /setacvalueindex SCHEME_CURRENT -> Core Parking 100%, Hetero Policy=2, USB/PCIe Suspend=0',
    revert: 'Switches back to Balanced power plan (381b4222-f694-41f0-9685-ff5bb260df2e) with default USB and hetero policies.',
  },
  {
    id: 'usb_power',
    name: 'Disable USB & Peripheral Power Saving',
    category: 'Power & Hardware',
    filterGroup: 'Power & Hardware',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Disabled power-saving on 14 USB/HID devices',
    desc: 'Turns off "Allow the computer to turn off this device" across USB Root Hubs, mice, and keyboards to stop 1000 Hz–8000 Hz polling hiccups.',
    commands: 'WMI root\\wmi -> MSPower_DeviceEnable (USB|HID) -> Enable = $false',
    revert: 'Re-enables MSPower_DeviceEnable = $true on modified USB and HID devices.',
  },
  {
    id: 'gpu_msi',
    name: 'GPU MSI-X Mode & High Interrupt Priority',
    category: 'Power & Hardware',
    filterGroup: 'Power & Hardware',
    reboot: 'Reboot',
    opt: false,
    log: '[OK] Enabled MSI-X & High Interrupt Priority on 2 GPU PCIe device(s)',
    desc: 'Detects your NVIDIA (VEN_10DE) or AMD (VEN_1002) PCIe GPU and GPU audio device, ensuring Message Signaled Interrupts (MSI-X) and High interrupt priority are enabled.',
    commands: 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\PCI\\(VEN_10DE|VEN_1002)\\...\nMSISupported=1, Affinity Policy\\DevicePriority=3',
    revert: 'Removes custom DevicePriority override so Windows falls back to default GPU interrupt priority.',
  },
  {
    id: 'ethernet_latency',
    name: 'Wired Ethernet Low-Latency Tuning',
    category: 'Network & Latency',
    filterGroup: 'Network & Memory',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Tuned 5 properties on Ethernet',
    desc: 'Disables Energy Efficient Ethernet (EEE), Advanced EEE, Green Ethernet, Flow Control, and Interrupt Moderation on your active wired NIC (skipped automatically on Wi-Fi).',
    commands: 'Set-NetAdapterAdvancedProperty -> EEE, Advanced EEE, Green Ethernet, Flow Control, Interrupt Moderation = Disabled',
    revert: 'Re-enables EEE, Green Ethernet, Interrupt Moderation, and Flow Control (Rx & Tx Enabled) on the wired NIC.',
  },
  {
    id: 'memory_services',
    name: 'Disable Memory Compression, Telemetry & Disk Overhead',
    category: 'Memory & Services',
    filterGroup: 'Network & Memory',
    reboot: 'Reboot',
    opt: false,
    log: '[OK] Memory Compression OFF, SysMain/DiagTrack/WerSvc disabled, DeliveryOpt OFF, NTFS tuned',
    desc: 'Turns off RAM compression on 16 GB+ PCs, disables SysMain, DiagTrack, WerSvc, and noisy CEIP scheduled tasks, stops P2P Windows Update uploads, and reduces NTFS timestamp writes.',
    commands: 'Disable-MMAgent -MemoryCompression (>=16 GB)\nDisable SysMain, DiagTrack, WerSvc & CEIP tasks; DODownloadMode=0; fsutil disablelastaccess 1 / memoryusage 2',
    revert: 'Re-enables Memory Compression, SysMain, DiagTrack, WerSvc (Manual), Delivery Optimization, and NTFS defaults.',
  },
  {
    id: 'defender_exclusions',
    name: 'Windows Defender Game Folder Exclusions',
    category: 'Memory & Services',
    filterGroup: 'Network & Memory',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Added Defender exclusions: C:\\Riot Games, %LOCALAPPDATA%\\VALORANT',
    desc: 'Adds Riot Games and VALORANT AppData folders to Windows Defender exclusions so real-time antivirus scans do not hitch shader and asset loads mid-round.',
    commands: 'Add-MpPreference -ExclusionPath "C:\\Riot Games", "$env:LOCALAPPDATA\\VALORANT"',
    revert: 'Removes both game directories via Remove-MpPreference -ExclusionPath.',
  },
  {
    id: 'user_gaming',
    name: 'Game Mode ON, GameDVR OFF & High Priority IFEO',
    category: 'Gaming & Valorant',
    filterGroup: 'Gaming & Opt-In',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Game Mode ON, GameDVR/Background Apps OFF, IFEO CpuPriorityClass=3',
    desc: 'Locks Windows Game Mode ON, disables GameDVR background capture and background UWP apps, removes desktop menu/window animation lag, and assigns High CPU priority to VALORANT.',
    commands: 'AutoGameModeEnabled=1, GameDVR_Enabled=0, AppCaptureEnabled=0, GlobalUserDisabled=1\nIFEO\\VALORANT-Win64-Shipping.exe\\PerfOptions -> CpuPriorityClass=3',
    revert: 'Restores background UWP apps, default desktop animation timings, and removes the IFEO priority key.',
  },
  {
    id: 'valorant_config',
    name: 'Valorant .ini Scalability & Improve Clarity Fix',
    category: 'Gaming & Valorant',
    filterGroup: 'Gaming & Opt-In',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Optimized Valorant configs (2 GameUserSettings, 2 RiotUserSettings updated)',
    desc: 'Backs up your configs first, sets hidden sg.*Quality values to 0 across local accounts, and turns off ImproveClarity without touching resolution, sensitivity, crosshairs, or Reflex.',
    commands: 'GameUserSettings.ini -> sg.*Quality=0\nRiotUserSettings.ini -> EAresBoolSettingName::ImproveClarity=False',
    revert: 'Original untouched copies of every edited .ini file are saved in Documents\\BareFrame\\backups\\.',
  },
  {
    id: 'nvidia_shadowplay',
    name: 'Disable NVIDIA ShadowPlay 120 FPS Background Recording',
    category: 'Gaming & Valorant',
    filterGroup: 'Gaming & Opt-In',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Disabled NVIDIA ShadowPlay background recording flags',
    desc: 'Clears ShadowPlay / Instant Replay background capture flags (RecEnabled and DwmDvrEnabledV1) to remove constant D3D capture hook overhead.',
    commands: 'HKCU\\Software\\NVIDIA Corporation\\Global\\ShadowPlay\\NVSPCAPS -> RecEnabled=0, DwmDvrEnabledV1=0',
    revert: 'Re-enable Instant Replay anytime inside NVIDIA App -> Overlay (Alt+Z).',
  },
  {
    id: 'baremetal_vbs',
    name: 'Bare-Metal Mode (Disable VBS & Hypervisor Tax)',
    category: 'Advanced (Opt-In)',
    filterGroup: 'Gaming & Opt-In',
    reboot: 'Reboot',
    opt: true,
    log: '[OK] Bare-Metal VBS=0 & hypervisorlaunchtype=Off (Reboot required!)',
    desc: 'Optional toggle that disables Windows Virtualization-Based Security and Hyper-V launch (+10–18% CPU FPS in DX11 titles). Leaves TPM 2.0 and Secure Boot active. Disable WSL2/Docker while off.',
    commands: 'HKLM\\...\\DeviceGuard -> EnableVirtualizationBasedSecurity=0, HVCI Enabled=0\nbcdedit /set hypervisorlaunchtype off',
    revert: 'Sets EnableVirtualizationBasedSecurity=1, HVCI Enabled=1, and bcdedit /set hypervisorlaunchtype auto.',
  },
];

/* --------------------------------------------------------------------------
   2. Sticky Header State
   -------------------------------------------------------------------------- */
const topbar = document.getElementById('topbar');
function syncTopbar() {
  topbar.classList.toggle('scrolled', window.scrollY > 10);
}
window.addEventListener('scroll', syncTopbar, { passive: true });
syncTopbar();

/* --------------------------------------------------------------------------
   3. Interactive Windows Dry-Run Preview
   -------------------------------------------------------------------------- */
const demoScoreEl = document.getElementById('demo-score');
const demoVerdict = document.getElementById('demo-verdict');
const stageChip = document.getElementById('stage-status-chip');
const demoTweakCount = document.getElementById('demo-tweak-count');
const btnDemoOpt = document.getElementById('btn-demo-optimize');
const btnDemoReset = document.getElementById('btn-demo-reset');
const demoVbsChk = document.getElementById('demo-vbs-chk');
const demoProgWrap = document.getElementById('demo-progress-wrap');
const demoProgBar = document.getElementById('demo-progress-bar');
const demoProgText = document.getElementById('demo-progress-text');
const demoProgPct = document.getElementById('demo-progress-pct');
const demoConsole = document.getElementById('demo-console');
const btnToggleConsole = document.getElementById('btn-toggle-console');
const demoDoneWrap = document.getElementById('demo-done-wrap');
const demoDoneSummary = document.getElementById('demo-done-summary');
const demoDoneGrid = document.getElementById('demo-done-grid');
const btnToggleDone = document.getElementById('btn-toggle-done');
const demoDoneSign = document.getElementById('demo-done-sign');

const scoreSpring = new Spring1D(42, {
  damping: 1.0,
  response: 0.4,
  onUpdate: (v) => {
    const rounded = Math.round(Math.max(0, Math.min(100, v)));
    demoScoreEl.innerHTML = `${rounded}<small>/100</small>`;
    demoScoreEl.classList.toggle('ready', rounded >= 80);
  },
});

const progSpring = new Spring1D(0, {
  damping: 1.0,
  response: 0.3,
  onUpdate: (v) => {
    const c = Math.max(0, Math.min(100, v));
    demoProgBar.style.width = `${c.toFixed(1)}%`;
    demoProgPct.textContent = `${Math.round(c)}%`;
  },
});

let demoTimer = null;

function syncQueueLabel() {
  const count = demoVbsChk.checked ? 12 : 11;
  demoTweakCount.textContent = `${count} tweaks queued`;
  if (!btnDemoReset.classList.contains('hidden')) {
    scoreSpring.animateTo(demoVbsChk.checked ? 100 : 85);
    demoVerdict.textContent = demoVbsChk.checked
      ? 'Optimized · Bare-Metal Ready'
      : 'Optimized · Standard Profile';
  }
}

demoVbsChk.addEventListener('change', syncQueueLabel);

btnToggleConsole.addEventListener('click', () => {
  const collapsed = demoConsole.classList.toggle('hidden');
  btnToggleConsole.textContent = collapsed ? '+ Show' : '− Hide';
  btnToggleConsole.setAttribute('aria-expanded', String(!collapsed));
});

btnToggleDone.addEventListener('click', () => {
  const collapsed = demoDoneGrid.classList.toggle('hidden');
  demoDoneSign.textContent = collapsed ? '+' : '−';
  btnToggleDone.setAttribute('aria-expanded', String(!collapsed));
});

function resetDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  scoreSpring.animateTo(42);
  progSpring.setImmediate(0);
  demoProgWrap.classList.add('hidden');
  demoDoneWrap.classList.add('hidden');
  demoDoneGrid.innerHTML = '';
  btnDemoReset.classList.add('hidden');
  btnDemoOpt.disabled = false;
  btnDemoOpt.querySelector('.btn-label').textContent = 'Run Dry-Run Preview';
  demoVerdict.textContent = 'Stock Windows Profile';
  stageChip.textContent = 'IDLE';
  stageChip.className = 'win-badge mono';
  demoConsole.textContent = 'Ready. Click "Run Dry-Run Preview" to step through the real PowerShell commands executed by BareFrame.';
}

btnDemoOpt.addEventListener('click', () => {
  clearInterval(demoTimer);
  const includeVbs = demoVbsChk.checked;
  const steps = includeVbs ? TWEAKS_DATA : TWEAKS_DATA.filter((t) => !t.opt);
  const targetScore = includeVbs ? 100 : 85;

  btnDemoOpt.disabled = true;
  btnDemoOpt.querySelector('.btn-label').textContent = 'Running Dry-Run…';
  btnDemoReset.classList.add('hidden');
  demoProgWrap.classList.remove('hidden');
  demoDoneWrap.classList.remove('hidden');
  demoDoneGrid.classList.remove('hidden');
  demoDoneSign.textContent = '−';
  demoDoneGrid.innerHTML = '';
  demoDoneSummary.textContent = `Completed changes (0/${steps.length})`;

  stageChip.textContent = 'RUNNING';
  stageChip.className = 'win-badge mono running';

  demoConsole.classList.remove('hidden');
  btnToggleConsole.textContent = '− Hide';
  btnToggleConsole.setAttribute('aria-expanded', 'true');
  demoConsole.textContent = '[BACKUP] Checkpoint-Computer "BareFrame Before Optimize"\n[BACKUP] Exported mmcss.reg, priority.reg, deviceguard.reg, ValorantConfig';

  progSpring.setImmediate(6);
  scoreSpring.animateTo(46);

  let idx = 0;
  demoTimer = setInterval(() => {
    if (idx >= steps.length) {
      clearInterval(demoTimer);
      demoTimer = null;
      progSpring.animateTo(100);
      scoreSpring.animateTo(targetScore);
      demoProgText.textContent = `Complete (${steps.length} tweaks applied + backup saved)`;
      demoVerdict.textContent = includeVbs
        ? 'Optimized · Bare-Metal Ready'
        : 'Optimized · Standard Profile';
      stageChip.textContent = 'DONE';
      stageChip.className = 'win-badge mono done';
      btnDemoOpt.disabled = false;
      btnDemoOpt.querySelector('.btn-label').textContent = 'Replay Dry-Run';
      btnDemoReset.classList.remove('hidden');
      return;
    }

    const item = steps[idx];
    const pct = ((idx + 1) / steps.length) * 100;
    demoProgText.textContent = `${idx + 1}/${steps.length} · ${item.name}`;
    progSpring.animateTo(pct);
    scoreSpring.animateTo(42 + ((targetScore - 42) * (idx + 1)) / steps.length);

    demoConsole.textContent += `\n${item.log}`;
    demoConsole.scrollTop = demoConsole.scrollHeight;

    const row = document.createElement('div');
    row.className = 'done-row';
    row.innerHTML = `<span>${item.name}</span><span class="done-tag mono">OK</span>`;
    demoDoneGrid.appendChild(row);
    demoDoneSummary.textContent = `Completed changes (${idx + 1}/${steps.length})`;
    idx++;
  }, prefersReducedMotion() ? 35 : 175);
});

btnDemoReset.addEventListener('click', resetDemo);

/* --------------------------------------------------------------------------
   4. Telemetry Tabs (Spring Indicator)
   -------------------------------------------------------------------------- */
const TELEMETRY_VIEWS = {
  tdm: [
    { val: '+35%', cls: 'blue', lbl: 'AVERAGE FPS GAIN', note: '220 → 298 FPS in nonstop TDM' },
    { val: '−84%', cls: 'red', lbl: 'SUB-240 FPS DIPS', note: 'Cut from 32.3% of frames down to 5.2%' },
    { val: '94.5%', cls: '', lbl: 'FRAMES ABOVE 240 FPS', note: 'Up from 67.2% on stock Windows 11' },
    { val: '4.68 ms', cls: '', lbl: 'MEAN ENGINE FRAME TIME', note: '0.72 ms faster than stock baseline' },
  ],
  comp: [
    { val: '422 FPS', cls: 'blue', lbl: '5V5 MATCH AVERAGE', note: 'Parsed from full competitive match log' },
    { val: '0.89 ms', cls: '', lbl: 'MEAN GPU FRAME TIME', note: 'Over 1,100 FPS GPU render headroom' },
    { val: '3,652', cls: 'red', lbl: 'FRAMES ABOVE 480 FPS', note: 'Up from 0 frames on stock Windows' },
    { val: '30.5%', cls: '', lbl: 'SYSTEM RAM USAGE', note: 'Down from 45.4% with compression off' },
  ],
  dips: [
    { val: '5.2%', cls: 'blue', lbl: 'FRAMES UNDER 240 FPS', note: 'More than 6× lower than stock 32.3%' },
    { val: '4.10–4.48', cls: '', lbl: 'SUSTAINED P-CORE GHZ', note: 'Held flat after ASUS PL1/PL2 unlock' },
    { val: 'VBS = 0', cls: 'red', lbl: 'HYPERVISOR OVERHEAD', note: 'Bare-metal kernel execution active' },
    { val: '0 MB', cls: '', lbl: 'COMPRESSED MEMORY', note: 'Eliminated mid-round page stalls' },
  ],
};

const segWrap = document.getElementById('bench-segmented');
const segThumb = document.getElementById('segmented-thumb');
const segButtons = [...segWrap.querySelectorAll('.seg-btn')];

const thumbX = new Spring1D(0, {
  damping: 1.0,
  response: 0.28,
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
    vEl.className = `data-val mono tabular ${m.cls}`.trim();
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
   5. 5-Stage Progression Scrubber (1:1 Pointer Drag + Momentum + Click Ticks)
   -------------------------------------------------------------------------- */
const STAGES = [
  {
    pill: 'STAGE 01 / STOCK',
    fps: 220,
    delta: 'Baseline',
    isBaseline: true,
    cap: 'Stock Windows 11 + NVIDIA Overlay (120 FPS capture) + 65W PL1 throttle + VBS/HVCI ON.',
  },
  {
    pill: 'STAGE 02 / WINDOWS',
    fps: 250,
    delta: '+14% FPS',
    isBaseline: false,
    cap: 'BareFrame CPU scheduler, timer, USB/NIC, memory compression, and ShadowPlay recording OFF.',
  },
  {
    pill: 'STAGE 03 / BIOS PL1',
    fps: 255,
    delta: '−16% dips',
    isBaseline: false,
    cap: 'ASUS PL1/PL2 unlocked via BIOS guide: P-cores held 4.10–4.48 GHz instead of dropping to 3.45 GHz.',
  },
  {
    pill: 'STAGE 04 / HVCI OFF',
    fps: 274,
    delta: '−60% dips',
    isBaseline: false,
    cap: 'Memory Integrity disabled: sub-240 FPS dips dropped from 32.3% down to 12.8% of frames.',
  },
  {
    pill: 'STAGE 05 / BARE-METAL',
    fps: 298,
    delta: '−84% dips',
    isBaseline: false,
    cap: 'Bare-Metal VBS=0 active. Only 5.2% of frames dipped below 240 FPS and 3,652 frames exceeded 480 FPS.',
  },
];

const track = document.getElementById('scrubber-track');
const knob = document.getElementById('scrubber-knob');
const fill = document.getElementById('scrubber-fill');
const sPill = document.getElementById('scrubber-stage-pill');
const sFps = document.getElementById('scrubber-fps');
const sCap = document.getElementById('scrubber-caption');
const sDelta = document.getElementById('scrubber-delta');
const tickButtons = [...track.querySelectorAll('.tick-btn')];

let currentStageIdx = 4;

const stageXSpring = new Spring1D(0.9, {
  damping: 0.9,
  response: 0.3,
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
  sDelta.classList.toggle('baseline', st.isBaseline);
  track.setAttribute('aria-valuenow', String(idx));
  tickButtons.forEach((b, i) => b.classList.toggle('active', i === idx));
}

stageXSpring.setImmediate(stageNorm(4));
applyStageReadout(4);

let scrubbing = false;
let scrubGrabOffset = 0;
let scrubHistory = [];

tickButtons.forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const idx = Number(btn.dataset.stage);
    applyStageReadout(idx);
    stageXSpring.animateTo(stageNorm(idx), { damping: 1.0, response: 0.28 });
  });
});

track.addEventListener('pointerdown', (e) => {
  track.setPointerCapture(e.pointerId);
  scrubbing = true;
  stageXSpring.stop();
  const rect = track.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();
  const knobCenter = knobRect.left + knobRect.width / 2;

  if (Math.abs(e.clientX - knobCenter) <= knobRect.width * 1.5) {
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

  if (x < minX) x = minX + rubberband(x - minX, rect.width * 0.2);
  else if (x > maxX) x = maxX + rubberband(x - maxX, rect.width * 0.2);

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

  const currentPx = stageXSpring.value * rect.width;
  const projectedPx = currentPx + projectMomentum(velocityPx, 0.99);
  const targetIdx = Math.max(0, Math.min(STAGES.length - 1, Math.floor((projectedPx / rect.width) * STAGES.length)));
  applyStageReadout(targetIdx);

  stageXSpring.animateTo(stageNorm(targetIdx), {
    velocity: velocityPx / rect.width,
    damping: Math.abs(velocityPx) > 200 ? 0.85 : 1.0,
    response: 0.3,
  });
}

track.addEventListener('pointerup', endScrub);
track.addEventListener('pointercancel', endScrub);
track.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && currentStageIdx > 0) {
    applyStageReadout(currentStageIdx - 1);
    stageXSpring.animateTo(stageNorm(currentStageIdx), { damping: 1.0, response: 0.28 });
  } else if (e.key === 'ArrowRight' && currentStageIdx < STAGES.length - 1) {
    applyStageReadout(currentStageIdx + 1);
    stageXSpring.animateTo(stageNorm(currentStageIdx), { damping: 1.0, response: 0.28 });
  }
});

/* --------------------------------------------------------------------------
   6. Filterable 12-Tweak Technical Manifest Table (Expandable + / -)
   -------------------------------------------------------------------------- */
const manifestRowsEl = document.getElementById('manifest-rows');
const filterButtons = [...document.querySelectorAll('#tweak-filters .filter-btn')];
let activeFilter = 'all';
const expandedRows = new Set(['mmcss_scheduler']);

function renderManifest() {
  const list = activeFilter === 'all'
    ? TWEAKS_DATA
    : TWEAKS_DATA.filter((t) => t.filterGroup === activeFilter);

  manifestRowsEl.innerHTML = list
    .map((t) => {
      const idx = String(TWEAKS_DATA.indexOf(t) + 1).padStart(2, '0');
      const isOpen = expandedRows.has(t.id);
      return `
        <div class="manifest-row">
          <button type="button" class="manifest-summary" data-tweak-id="${t.id}" aria-expanded="${isOpen}">
            <span class="m-idx mono">${idx}</span>
            <span class="m-name"><span class="m-plus">${isOpen ? '−' : '+'}</span><span>${t.name}</span></span>
            <span class="m-cat mono">${t.category}</span>
            <span class="m-reboot mono">${t.reboot}</span>
            <span class="m-status mono ${t.opt ? 'opt' : ''}">${t.opt ? 'OPT-IN' : 'STANDARD'}</span>
          </button>
          <div class="manifest-detail ${isOpen ? '' : 'hidden'}">
            <div>
              <div class="detail-block-title mono">WHAT IT CHANGES</div>
              <p>${t.desc}</p>
              <div class="detail-block-title mono">REVERT BEHAVIOR</div>
              <p>${t.revert}</p>
            </div>
            <div>
              <div class="detail-block-title mono">EXACT WINDOWS TARGETS</div>
              <pre class="detail-code mono">${t.commands}</pre>
            </div>
          </div>
        </div>`;
    })
    .join('');

  manifestRowsEl.querySelectorAll('.manifest-summary').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tweakId;
      if (expandedRows.has(id)) expandedRows.delete(id);
      else expandedRows.add(id);
      renderManifest();
    });
  });
}

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.cat;
    filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
    renderManifest();
  });
});

renderManifest();
