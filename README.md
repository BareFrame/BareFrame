# BareFrame — Bare-Metal FPS & Latency Optimizer

**BareFrame** is a 100% free, open-source (MIT) Windows 10/11 performance and latency suite built for competitive PC gamers (Valorant, CS2, Fortnite, Apex Legends, Rainbow Six Siege).

- **Website & Downloads:** https://bareframe.github.io/BareFrame/
- **Releases:** https://github.com/BareFrame/BareFrame/releases
- **Support / Optional Tips (0% fee):** https://ko-fi.com/bareframe

## Core Capabilities
- **1-Click Bare-Metal Optimizer:** Automatically creates a Windows System Restore Point and timestamped registry/config backups first, displays live step-by-step progress, and includes 1-click full rollback.
- **12 Verified Optimizations:** MMCSS Games High Priority, Global Timer & Static Desktop Tick, Ultimate Hybrid P-Core Power Plan, USB/HID Peripheral Power-Saving OFF, GPU MSI-X & High Interrupt Priority, Wired Ethernet Low-Latency Tuning, Memory Compression & Telemetry OFF, Defender Game Exclusions, Game Mode & High Priority IFEO, ShadowPlay Capture Cleanup, Valorant `.ini` Scalability Cleanup, and Opt-In Bare-Metal Mode (VBS & HVCI OFF while leaving TPM 2.0 & Secure Boot intact).
- **35-Second CPU Throttle Detector & BIOS Playbook:** Catches hidden PL1 power limits & thermal throttling past the 28s Tau window, provides tailored ASUS / MSI / Gigabyte / ASRock BIOS instructions, and includes 1-click Reboot to UEFI BIOS.
- **Local Valorant Match Telemetry:** Parses local `ShooterGame*.log` files offline to chart Avg FPS, `<240 FPS` dip %, Engine Latency, and CPU-vs-GPU bottleneck verdicts.
- **Pre-Match Boost & Built-In Auto-Updater:** Clears heavy background apps in one click and checks GitHub Releases for new versions automatically.

## Privacy Policy
BareFrame runs **100% locally** and never collects or transmits personal data or usage telemetry. Its only network request is a read-only check against GitHub Releases (`api.github.com/repos/BareFrame/BareFrame/releases/latest`) for optional app updates. See [CODE_SIGNING_POLICY.md](./CODE_SIGNING_POLICY.md#6-privacy-policy) for full details.

## Code Signing Policy
Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/) *(application pending)*.  
Read our full [Code Signing Policy](./CODE_SIGNING_POLICY.md).

## Build & Run Locally
```bash
npm install
node node_modules/electron/install.js
npm start        # Run live
npm run build    # Build BareFrame-Setup.exe & BareFrame-Portable.exe
```
