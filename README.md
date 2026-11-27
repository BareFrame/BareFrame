# BareFrame — Bare-Metal FPS & Latency Optimizer

**BareFrame** is a 100% free, open-source (MIT) Windows 10/11 performance suite engineered for high-refresh competitive play (240Hz–540Hz) across Valorant, CS2, Fortnite, Apex Legends, and Rainbow Six Siege.

- **Website:** `docs/index.html` (GitHub Pages ready)
- **Support / Tips (0% platform fee):** https://ko-fi.com/bareframe

## Core Capabilities
- **1-Click Bare-Metal Optimizer:** Automatic System Restore Point + timestamped backups, live step-by-step progress bar, completed breakdown, and 1-click full rollback.
- **12 Verified Optimizations:** MMCSS Games High Priority, Global Timer & Static Desktop Tick, Ultimate Hybrid P-Core Power Plan, USB/HID Peripheral Power-Saving OFF (1000–8000Hz polling stability), GPU MSI-X & High Interrupt Priority, Wired Ethernet Low-Latency Tuning, Memory Compression & Telemetry OFF, Defender Game Exclusions, Game Mode & High Priority IFEO, ShadowPlay Capture Cleanup, Valorant `.ini` Scalability Cleanup, and Opt-In Bare-Metal Mode (VBS & HVCI OFF while keeping TPM 2.0 & Secure Boot intact).
- **35-Second CPU Throttle Detector & BIOS Playbook:** Catches hidden PL1 power limits & thermal throttling past the 28s Tau window, shows tailored ASUS / MSI / Gigabyte / ASRock BIOS steps, and offers 1-click Reboot Straight to UEFI BIOS.
- **Real Valorant Match Telemetry:** Parses local `ShooterGame*.log` files to graph before-vs-after Avg FPS, `<240 FPS` dip %, `>480` peaks, Engine Latency, and CPU-vs-GPU bottleneck verdicts.
- **Pre-Match Boost:** Live background hog scanner, 1-click RAM/CPU purge, and direct game launcher.

## Build & Run
```bash
npm install
node node_modules/electron/install.js
npm start        # Run live
npm run build    # Build BareFrame-Setup-1.0.0.exe & BareFrame-Portable-1.0.0.exe
```
