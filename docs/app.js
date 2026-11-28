/* ==========================================================================
   BareFrame Web — Interactive Frametime Trace, Spring Physics & 12-Tweak Data
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

  animateTo(target, { velocity = null, damping = this.damping, response = this.response } = {}) {
    this.target = target;
    this.damping = damping;
    this.response = response;
    if (velocity !== null) this.velocity = velocity;

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
    const accel = -k * (this.value - this.target) - c * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;

    if (Math.abs(this.value - this.target) < 0.02 && Math.abs(this.velocity) < 0.2) {
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

function projectMomentum(velocityPxPerSec, decelerationRate = 0.992) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* --------------------------------------------------------------------------
   1. Exact 12 Tweaks (1-to-1 parity with src/engine/tweaks.js)
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
    revert: 'Removes GlobalTimerResolutionRequests and PowerThrottlingOff, resets DisablePagingExecutive=0, and deletes disabledynamictick.',
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
    category: 'Game Profile',
    filterGroup: 'Network & Memory',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Added Defender exclusions for active game profile folders',
    desc: 'Excludes your selected game install and AppData folders (Riot, Steam library, Epic, EA, or Ubisoft) from real-time antivirus scans to stop mid-match shader stutters.',
    commands: 'Add-MpPreference -ExclusionPath <detected game folders for active profile>',
    revert: 'Removes BareFrame game folder exclusions via Remove-MpPreference.',
  },
  {
    id: 'user_gaming',
    name: 'Game Mode ON, GameDVR OFF & High Priority IFEO',
    category: 'Game Profile',
    filterGroup: 'Gaming & Opt-In',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Game Mode ON, GameDVR/Background Apps OFF, IFEO CpuPriorityClass=3',
    desc: 'Locks Windows Game Mode on, disables GameDVR background capture and background UWP apps, removes desktop menu/window animation lag, and assigns High CPU priority to your selected game executable.',
    commands: 'AutoGameModeEnabled=1, GameDVR_Enabled=0, AppCaptureEnabled=0, GlobalUserDisabled=1\nIFEO\\<game.exe>\\PerfOptions -> CpuPriorityClass=3',
    revert: 'Restores background UWP apps, default desktop animation timings, and removes the IFEO priority keys.',
  },
  {
    id: 'game_config',
    name: 'Game-Specific Config & Fullscreen Pacing Pass',
    category: 'Game Profile',
    filterGroup: 'Gaming & Opt-In',
    reboot: 'Instant',
    opt: false,
    log: '[OK] Optimized local game config / fullscreen pacing flags (backups saved)',
    desc: 'Backs up local configs first, then applies safe frame-pacing fixes for your selected game (VALORANT sg.*Quality/ImproveClarity, CS2 fullscreen optimizations off, Fortnite/Apex/R6 video cleanup) without touching sensitivity, resolution, or crosshairs.',
    commands: 'VALORANT: sg.*Quality=0, ImproveClarity=False\nCS2 / Apex: DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE\nFortnite / R6: MotionBlur & VSync off (original .ini backed up)',
    revert: 'Original untouched config copies are stored in Documents\\BareFrame\\backups\\ and AppCompat overrides are removed cleanly.',
  },
  {
    id: 'nvidia_shadowplay',
    name: 'Disable NVIDIA ShadowPlay 120 FPS Background Recording',
    category: 'GPU & Overlays',
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
    log: '[OK] Bare-Metal VBS=0 & hypervisorlaunchtype=Off (Reboot required)',
    desc: 'Optional toggle that disables Windows Virtualization-Based Security and Hyper-V launch (+10–18% CPU FPS in DX11 titles). Leaves TPM 2.0 and Secure Boot active. Disable WSL2/Docker while off.',
    commands: 'HKLM\\...\\DeviceGuard -> EnableVirtualizationBasedSecurity=0, HVCI Enabled=0\nbcdedit /set hypervisorlaunchtype off',
    revert: 'Sets EnableVirtualizationBasedSecurity=1, HVCI Enabled=1, and bcdedit /set hypervisorlaunchtype auto.',
  },
];

/* --------------------------------------------------------------------------
   2. Top Bar Scroll Awareness + Spring-Gliding Nav Hover Pill
   -------------------------------------------------------------------------- */
const topbar = document.getElementById('topbar');
function syncTopbar() {
  topbar.classList.toggle('scrolled', window.scrollY > 10);
}
window.addEventListener('scroll', syncTopbar, { passive: true });
syncTopbar();

const primaryNav = document.getElementById('primary-nav');
const navHoverPill = document.getElementById('nav-hover-pill');
const navLinks = [...primaryNav.querySelectorAll('.nav-link')];
const navPillX = new Spring1D(0, {
  damping: 1.0,
  response: 0.24,
  onUpdate: (x) => {
    navHoverPill.style.transform = `translate3d(${x.toFixed(2)}px, -50%, 0)`;
  },
});
const navPillW = new Spring1D(64, {
  damping: 1.0,
  response: 0.24,
  onUpdate: (w) => {
    navHoverPill.style.width = `${w.toFixed(2)}px`;
  },
});

let navPillVisible = false;
navLinks.forEach((link) => {
  link.addEventListener('pointerenter', () => {
    const x = link.offsetLeft;
    const w = link.offsetWidth;
    if (!navPillVisible) {
      navPillX.setImmediate(x);
      navPillW.setImmediate(w);
      navPillVisible = true;
    } else {
      navPillX.animateTo(x);
      navPillW.animateTo(w);
    }
    navHoverPill.style.opacity = '1';
  });
});
primaryNav.addEventListener('pointerleave', () => {
  navHoverPill.style.opacity = '0';
  navPillVisible = false;
});

/* --------------------------------------------------------------------------
   3. Signature Interactive Frametime Oscilloscope (Real Match Numbers)
   -------------------------------------------------------------------------- */
const canvas = document.getElementById('frametime-canvas');
const ctx = canvas.getContext('2d');
const traceTabsWrap = document.getElementById('trace-mode-switch');
const traceThumb = document.getElementById('trace-switch-thumb');
const traceButtons = [...traceTabsWrap.querySelectorAll('.trace-tab')];
const traceFpsEl = document.getElementById('trace-fps');
const traceDipsEl = document.getElementById('trace-dips');
const traceLatEl = document.getElementById('trace-lat');
const vbsChk = document.getElementById('demo-vbs-chk');

let traceMode = 'tuned'; // 'stock' | 'tuned'
// 0 = stock (crimson jagged spikes), 1 = tuned (cobalt flatline)
let blendVal = 1;
const blendSpring = new Spring1D(1, {
  damping: 1.0,
  response: 0.42,
  onUpdate: (v) => {
    blendVal = Math.max(0, Math.min(1, v));
    updateTraceReadouts();
    if (prefersReducedMotion()) drawTraceFrame(0);
  },
});

const traceThumbX = new Spring1D(0, {
  damping: 1.0,
  response: 0.28,
  onUpdate: (x) => {
    traceThumb.style.transform = `translateX(${x.toFixed(2)}px)`;
  },
});

function positionTraceThumb(btn, immediate = false) {
  const r = btn.getBoundingClientRect();
  const pr = traceTabsWrap.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(traceTabsWrap).paddingLeft) || 0;
  traceThumb.style.width = `${r.width}px`;
  const x = r.left - pr.left - pad;
  if (immediate) traceThumbX.setImmediate(x);
  else traceThumbX.animateTo(x);
}

let vbsBlend = 1;
const vbsBlendSpring = new Spring1D(1, {
  damping: 1.0,
  response: 0.34,
  onUpdate: (v) => {
    vbsBlend = Math.max(0, Math.min(1, v));
    updateTraceReadouts();
    if (prefersReducedMotion()) drawTraceFrame(0);
  },
});

function getTunedTargets() {
  return {
    fps: 274 + (298 - 274) * vbsBlend,
    dips: 12.8 + (5.2 - 12.8) * vbsBlend,
    lat: 4.92 + (4.68 - 4.92) * vbsBlend,
  };
}

function updateTraceReadouts() {
  const tuned = getTunedTargets();
  const fps = Math.round(220 + (tuned.fps - 220) * blendVal);
  const dips = (32.3 + (tuned.dips - 32.3) * blendVal).toFixed(1);
  const lat = (5.4 + (tuned.lat - 5.4) * blendVal).toFixed(2);
  traceFpsEl.textContent = `${fps} FPS`;
  traceDipsEl.textContent = `${dips}%`;
  traceLatEl.textContent = `${lat} ms`;
  traceFpsEl.style.color = blendVal > 0.5 ? '#6cb2ff' : '#ff859d';
  traceDipsEl.style.color = blendVal > 0.5 ? '#f4f6fa' : '#e5324b';
}

function selectTraceMode(mode, immediate = false) {
  traceMode = mode;
  traceButtons.forEach((b) => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    if (active) positionTraceThumb(b, immediate);
  });
  blendSpring.animateTo(mode === 'tuned' ? 1 : 0);
}

traceButtons.forEach((b) => {
  b.addEventListener('pointerdown', () => selectTraceMode(b.dataset.mode));
  b.addEventListener('click', () => selectTraceMode(b.dataset.mode));
});
vbsChk.addEventListener('change', () => vbsBlendSpring.animateTo(vbsChk.checked ? 1 : 0));
requestAnimationFrame(() => selectTraceMode('tuned', true));

// Interactive pointer crosshair inside frametime trace
let hoverNormX = null;
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  hoverNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (prefersReducedMotion()) drawTraceFrame(0);
});
canvas.addEventListener('pointerleave', () => {
  hoverNormX = null;
  if (prefersReducedMotion()) drawTraceFrame(0);
});

// Deterministic synthetic waveform representing real TDM frametimes (2ms..10ms scale)
const SAMPLES = 120;
function sampleStockMs(idx, phase) {
  const t = idx * 0.34 + phase;
  const base = 4.65 + Math.sin(t * 0.7) * 0.55 + Math.cos(t * 1.9) * 0.4;
  // Periodic mid-fight frame spikes above 7-9 ms
  const spike = Math.pow(Math.max(0, Math.sin(t * 0.47 + 0.8)), 10) * 4.4
              + Math.pow(Math.max(0, Math.cos(t * 0.83)), 14) * 3.1;
  return Math.min(9.6, base + spike);
}

function sampleTunedMs(idx, phase) {
  const t = idx * 0.34 + phase;
  const vbsAdj = (1 - vbsBlend) * 0.32;
  const base = 3.35 + vbsAdj + Math.sin(t * 0.65) * 0.18 + Math.cos(t * 1.7) * 0.1;
  const mildBump = Math.pow(Math.max(0, Math.sin(t * 0.47 + 0.8)), 16) * (0.8 + (1 - vbsBlend) * 0.65);
  return base + mildBump;
}

function drawTraceFrame(phase) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 235;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const msToY = (ms) => {
    const clamped = Math.max(1.8, Math.min(10.2, ms));
    return h - ((clamped - 1.8) / (10.2 - 1.8)) * (h - 24) - 12;
  };

  // Subtle horizontal reference grid
  ctx.strokeStyle = 'rgba(226, 234, 248, 0.06)';
  ctx.lineWidth = 1;
  for (const g of [3, 6, 8]) {
    const gy = msToY(g);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  // 240 Hz (4.16 ms) budget line
  const y240 = msToY(4.16);
  ctx.save();
  ctx.strokeStyle = 'rgba(108, 178, 255, 0.45)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y240);
  ctx.lineTo(w, y240);
  ctx.stroke();
  ctx.restore();

  // Ghost stock trace when tuned is active so the improvement is unmistakable
  if (blendVal > 0.15) {
    ctx.beginPath();
    for (let i = 0; i < SAMPLES; i++) {
      const x = (i / (SAMPLES - 1)) * w;
      const y = msToY(sampleStockMs(i, phase));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(229, 50, 75, ${(0.22 * blendVal).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Primary blended waveform
  const r = Math.round(229 + (43 - 229) * blendVal);
  const g = Math.round(50 + (127 - 50) * blendVal);
  const b = Math.round(75 + (255 - 75) * blendVal);
  const lineColor = `rgb(${r}, ${g}, ${b})`;

  let lastX = 0;
  let lastY = 0;
  ctx.beginPath();
  for (let i = 0; i < SAMPLES; i++) {
    const x = (i / (SAMPLES - 1)) * w;
    const ms = sampleStockMs(i, phase) * (1 - blendVal) + sampleTunedMs(i, phase) * blendVal;
    const y = msToY(ms);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    lastX = x;
    lastY = y;
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Soft vertical fill beneath curve
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.22)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fill();

  // Leading-edge oscilloscope bead
  ctx.beginPath();
  ctx.arc(lastX - 2, lastY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Interactive hover crosshair & floating frametime readout
  if (hoverNormX !== null) {
    const idx = hoverNormX * (SAMPLES - 1);
    const ms = sampleStockMs(idx, phase) * (1 - blendVal) + sampleTunedMs(idx, phase) * blendVal;
    const hx = hoverNormX * w;
    const hy = msToY(ms);

    ctx.save();
    ctx.strokeStyle = 'rgba(244, 246, 250, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    const label = `${ms.toFixed(2)} ms (${Math.round(1000 / ms)} FPS)`;
    ctx.font = '500 11px "JetBrains Mono", Consolas, monospace';
    const tw = ctx.measureText(label).width + 16;
    const bx = Math.min(w - tw - 8, Math.max(8, hx - tw / 2));
    const by = hy > 44 ? hy - 34 : hy + 12;
    ctx.fillStyle = 'rgba(15, 20, 29, 0.92)';
    ctx.strokeStyle = 'rgba(226, 234, 248, 0.18)';
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4f6fa';
    ctx.fillText(label, bx + 8, by + 15.5);
    ctx.restore();
  }
}

let tracePhase = 0;
let lastTraceTs = 0;
function animateTrace(ts) {
  if (!lastTraceTs) lastTraceTs = ts;
  const dt = Math.min(0.05, (ts - lastTraceTs) / 1000);
  lastTraceTs = ts;
  tracePhase += dt * 1.15;
  drawTraceFrame(tracePhase);
  requestAnimationFrame(animateTrace);
}

if (prefersReducedMotion()) {
  drawTraceFrame(0);
} else {
  requestAnimationFrame(animateTrace);
}

/* --------------------------------------------------------------------------
   4. Dry-Run PowerShell Log Drawer
   -------------------------------------------------------------------------- */
const btnDryRun = document.getElementById('btn-run-dry');
const dryDrawer = document.getElementById('dry-run-drawer');
const demoProgBar = document.getElementById('demo-progress-bar');
const demoProgText = document.getElementById('demo-progress-text');
const demoProgPct = document.getElementById('demo-progress-pct');
const demoConsole = document.getElementById('demo-console');

const dryProgSpring = new Spring1D(0, {
  damping: 1.0,
  response: 0.28,
  onUpdate: (v) => {
    const c = Math.max(0, Math.min(100, v));
    demoProgBar.style.width = `${c.toFixed(1)}%`;
    demoProgPct.textContent = `${Math.round(c)}%`;
  },
});

let dryTimer = null;
btnDryRun.addEventListener('click', () => {
  clearInterval(dryTimer);
  const steps = vbsChk.checked ? TWEAKS_DATA : TWEAKS_DATA.filter((t) => !t.opt);
  dryDrawer.classList.remove('hidden');
  btnDryRun.disabled = true;
  btnDryRun.textContent = 'Running…';
  demoConsole.textContent = '[BACKUP] Checkpoint-Computer "BareFrame Before Optimize"\n[BACKUP] Exported mmcss.reg, priority.reg, deviceguard.reg, game configs';
  dryProgSpring.setImmediate(6);
  selectTraceMode('tuned');

  let i = 0;
  dryTimer = setInterval(() => {
    if (i >= steps.length) {
      clearInterval(dryTimer);
      dryProgSpring.animateTo(100);
      demoProgText.textContent = `Complete (${steps.length} tweaks applied with backups saved)`;
      btnDryRun.disabled = false;
      btnDryRun.textContent = 'Replay dry-run log';
      return;
    }
    const item = steps[i];
    demoProgText.textContent = `${i + 1} of ${steps.length}: ${item.name}`;
    dryProgSpring.animateTo(((i + 1) / steps.length) * 100);
    demoConsole.textContent += `\n${item.log}`;
    demoConsole.scrollTop = demoConsole.scrollHeight;
    i++;
  }, prefersReducedMotion() ? 35 : 165);
});

/* --------------------------------------------------------------------------
   5. Benchmark Comparison Table + Spring Tabs
   -------------------------------------------------------------------------- */
const BENCH_TABLES = {
  tdm: [
    { metric: 'Average frame rate', before: '220 FPS', after: '298 FPS', delta: '+35%', cls: '' },
    { metric: 'Frames below 240 FPS', before: '32.3%', after: '5.2%', delta: '−84% fewer dips', cls: 'crimson' },
    { metric: 'Match time above 240 FPS', before: '67.2%', after: '94.5%', delta: '+27.3 pts', cls: '' },
    { metric: 'Mean engine frame latency', before: '5.40 ms', after: '4.68 ms', delta: '−0.72 ms', cls: '' },
  ],
  comp: [
    { metric: '5v5 competitive match average', before: '308 FPS', after: '422 FPS', delta: '+37%', cls: '' },
    { metric: 'Mean GPU render time', before: '1.12 ms', after: '0.89 ms', delta: '>1,100 FPS headroom', cls: '' },
    { metric: 'Frames exceeding 480 FPS', before: '0 frames', after: '3,652 frames', delta: '+3,652', cls: 'crimson' },
    { metric: 'System RAM in use', before: '45.4%', after: '30.5%', delta: '0 MB compressed', cls: '' },
  ],
  dips: [
    { metric: 'Sustained P-core clock speed', before: '3.45 GHz (65W PL1)', after: '4.10–4.48 GHz', delta: 'Flat under load', cls: '' },
    { metric: 'Virtualization overhead (VBS)', before: 'Running (HVCI on)', after: 'VBS = 0', delta: 'Bare-metal kernel', cls: 'crimson' },
    { metric: 'Sub-240 FPS dip rate (TDM)', before: '32.3%', after: '5.2%', delta: '6.2× reduction', cls: '' },
    { metric: 'Windows Memory Compression', before: 'Active', after: 'Disabled (32 GB RAM)', delta: 'No page stalls', cls: '' },
  ],
};

const segWrap = document.getElementById('bench-segmented');
const segThumb = document.getElementById('segmented-thumb');
const segButtons = [...segWrap.querySelectorAll('.seg-btn')];
const compareTbody = document.getElementById('compare-tbody');

const segThumbX = new Spring1D(0, {
  damping: 1.0,
  response: 0.28,
  onUpdate: (x) => {
    segThumb.style.transform = `translateX(${x.toFixed(2)}px)`;
  },
});

function positionSegThumb(btn, immediate = false) {
  const r = btn.getBoundingClientRect();
  const pr = segWrap.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(segWrap).paddingLeft) || 0;
  segThumb.style.width = `${r.width}px`;
  const x = r.left - pr.left - pad;
  if (immediate) segThumbX.setImmediate(x);
  else segThumbX.animateTo(x);
}

function selectBenchView(btn, immediate = false) {
  segButtons.forEach((b) => {
    const active = b === btn;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  positionSegThumb(btn, immediate);
  const rows = BENCH_TABLES[btn.dataset.view];
  compareTbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td class="col-metric">${r.metric}</td>
        <td class="col-before">${r.before}</td>
        <td class="col-after">${r.after}</td>
        <td class="col-delta ${r.cls}">${r.delta}</td>
      </tr>`
    )
    .join('');
}

segButtons.forEach((b) => {
  b.addEventListener('pointerdown', () => selectBenchView(b));
  b.addEventListener('click', () => selectBenchView(b));
});

window.addEventListener('resize', () => {
  const activeTrace = traceTabsWrap.querySelector('.trace-tab.active');
  if (activeTrace) positionTraceThumb(activeTrace, true);
  const activeBench = segWrap.querySelector('.seg-btn.active');
  if (activeBench) positionSegThumb(activeBench, true);
});
requestAnimationFrame(() => selectBenchView(segButtons[0], true));

/* --------------------------------------------------------------------------
   6. 5-Stage Progression Slider (1:1 Pointer Drag + Momentum + Click Stops)
   -------------------------------------------------------------------------- */
const STAGES = [
  { fps: 220, delta: 'Baseline', baseline: true, cap: 'Stock Windows 11 with NVIDIA 120 FPS overlay capture, 65W PL1 limit, and VBS/HVCI running.' },
  { fps: 250, delta: '+14% FPS', baseline: false, cap: 'BareFrame scheduler, timer, USB/NIC tuning, memory compression off, and ShadowPlay recording off.' },
  { fps: 255, delta: '−16% dips', baseline: false, cap: 'Motherboard PL1/PL2 unlocked using the BIOS guide: P-cores held 4.10–4.48 GHz instead of dropping to 3.45 GHz.' },
  { fps: 274, delta: '−60% dips', baseline: false, cap: 'Memory Integrity disabled: sub-240 FPS dips dropped from 32.3% down to 12.8% of frames.' },
  { fps: 298, delta: '−84% dips', baseline: false, cap: 'Bare-Metal VBS=0 active. Only 5.2% of frames dipped below 240 FPS and 3,652 frames exceeded 480 FPS.' },
];

const track = document.getElementById('scrubber-track');
const knob = document.getElementById('scrubber-knob');
const fill = document.getElementById('scrubber-fill');
const sFps = document.getElementById('scrubber-fps');
const sCap = document.getElementById('scrubber-caption');
const sDelta = document.getElementById('scrubber-delta');
const stopBtns = [...track.querySelectorAll('.stage-stop')];

let stageIdx = 4;
const stageSpring = new Spring1D(0.9, {
  damping: 0.9,
  response: 0.3,
  onUpdate: (norm) => {
    const pct = norm * 100;
    knob.style.left = `${pct}%`;
    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  },
});

const stageFpsSpring = new Spring1D(298, {
  damping: 1.0,
  response: 0.28,
  onUpdate: (v) => {
    sFps.innerHTML = `${Math.round(v)} <small>FPS avg</small>`;
  },
});

const stageNorm = (i) => (i + 0.5) / STAGES.length;

function applyStage(idx, immediate = false) {
  stageIdx = idx;
  const st = STAGES[idx];
  if (immediate) stageFpsSpring.setImmediate(st.fps);
  else stageFpsSpring.animateTo(st.fps);
  sCap.textContent = st.cap;
  sDelta.textContent = st.delta;
  sDelta.classList.toggle('baseline', st.baseline);
  track.setAttribute('aria-valuenow', String(idx));
  stopBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
}

stageSpring.setImmediate(stageNorm(4));
applyStage(4, true);

stopBtns.forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const idx = Number(btn.dataset.stage);
    applyStage(idx);
    stageSpring.animateTo(stageNorm(idx), { damping: 1.0, response: 0.28 });
  });
});

let dragging = false;
let grabOffset = 0;
let history = [];

track.addEventListener('pointerdown', (e) => {
  track.setPointerCapture(e.pointerId);
  dragging = true;
  track.classList.add('is-dragging');
  stageSpring.stop();
  const rect = track.getBoundingClientRect();
  const kRect = knob.getBoundingClientRect();
  const kCenter = kRect.left + kRect.width / 2;
  if (Math.abs(e.clientX - kCenter) <= kRect.width * 1.4) {
    grabOffset = e.clientX - kCenter;
  } else {
    grabOffset = 0;
    const raw = (e.clientX - rect.left) / rect.width;
    const clamped = Math.max(stageNorm(0), Math.min(stageNorm(STAGES.length - 1), raw));
    stageSpring.setImmediate(clamped);
    applyStage(Math.max(0, Math.min(STAGES.length - 1, Math.floor(raw * STAGES.length))));
  }
  history = [{ x: e.clientX, t: performance.now() }];
});

track.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const rect = track.getBoundingClientRect();
  const minX = rect.width * stageNorm(0);
  const maxX = rect.width * stageNorm(STAGES.length - 1);
  let x = e.clientX - grabOffset - rect.left;
  if (x < minX) x = minX + rubberband(x - minX, rect.width * 0.2);
  else if (x > maxX) x = maxX + rubberband(x - maxX, rect.width * 0.2);

  stageSpring.setImmediate(x / rect.width);
  const nearest = Math.max(0, Math.min(STAGES.length - 1, Math.floor((x / rect.width) * STAGES.length)));
  if (nearest !== stageIdx) applyStage(nearest);

  const now = performance.now();
  history.push({ x: e.clientX, t: now });
  while (history.length > 5 && now - history[0].t > 100) history.shift();
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  track.classList.remove('is-dragging');
  const rect = track.getBoundingClientRect();
  let vel = 0;
  if (history.length >= 2) {
    const dt = (history[history.length - 1].t - history[0].t) / 1000;
    if (dt > 0.005) vel = (history[history.length - 1].x - history[0].x) / dt;
  }
  const projected = stageSpring.value * rect.width + projectMomentum(vel, 0.99);
  const target = Math.max(0, Math.min(STAGES.length - 1, Math.floor((projected / rect.width) * STAGES.length)));
  applyStage(target);
  stageSpring.animateTo(stageNorm(target), {
    velocity: vel / rect.width,
    damping: Math.abs(vel) > 200 ? 0.85 : 1.0,
    response: 0.3,
  });
}

track.addEventListener('pointerup', endDrag);
track.addEventListener('pointercancel', endDrag);
track.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && stageIdx > 0) {
    applyStage(stageIdx - 1);
    stageSpring.animateTo(stageNorm(stageIdx), { damping: 1.0, response: 0.28 });
  } else if (e.key === 'ArrowRight' && stageIdx < STAGES.length - 1) {
    applyStage(stageIdx + 1);
    stageSpring.animateTo(stageNorm(stageIdx), { damping: 1.0, response: 0.28 });
  }
});

/* --------------------------------------------------------------------------
   7. Filterable 12-Tweak Accordion
   -------------------------------------------------------------------------- */
const manifestRowsEl = document.getElementById('manifest-rows');
const filterChips = [...document.querySelectorAll('#tweak-filters .filter-chip')];
let activeFilter = 'all';
const openRows = new Set(['mmcss_scheduler']);

function renderManifest() {
  const list = activeFilter === 'all'
    ? TWEAKS_DATA
    : TWEAKS_DATA.filter((t) => t.filterGroup === activeFilter);

  manifestRowsEl.innerHTML = list
    .map((t) => {
      const open = openRows.has(t.id);
      return `
        <div class="manifest-row ${open ? 'is-open' : ''}" data-row-id="${t.id}">
          <button type="button" class="manifest-trigger" data-tweak-id="${t.id}" aria-expanded="${open}">
            <span class="m-title">${t.name}</span>
            <span class="m-cat">${t.category}</span>
            <span class="m-reboot">${t.reboot}</span>
            <span class="m-kind ${t.opt ? 'opt' : ''}">${t.opt ? 'Opt-in' : 'Standard'}</span>
            <span class="m-sign" aria-hidden="true">${open ? '−' : '+'}</span>
          </button>
          <div class="manifest-collapse">
            <div class="manifest-collapse-inner">
              <div class="manifest-body">
                <div>
                  <h4>What it changes</h4>
                  <p>${t.desc}</p>
                  <h4>How Revert All restores it</h4>
                  <p>${t.revert}</p>
                </div>
                <div>
                  <h4>Exact Windows targets</h4>
                  <pre class="manifest-code mono">${t.commands}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    })
    .join('');

  manifestRowsEl.querySelectorAll('.manifest-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tweakId;
      const row = btn.closest('.manifest-row');
      const willOpen = !openRows.has(id);
      if (willOpen) openRows.add(id);
      else openRows.delete(id);
      row.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
      btn.querySelector('.m-sign').textContent = willOpen ? '−' : '+';
    });
  });
}

filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    activeFilter = chip.dataset.cat;
    filterChips.forEach((c) => c.classList.toggle('active', c === chip));
    renderManifest();
  });
});

renderManifest();
