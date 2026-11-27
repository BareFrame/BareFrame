const path = require('path');
const os = require('os');
const { runPS } = require('./ps');

const BACKUP_ROOT = path.join(os.homedir(), 'Documents', 'BareFrame', 'backups');

const TWEAKS = [
  {
    id: 'mmcss_scheduler',
    name: 'CPU Scheduler & MMCSS Games Priority',
    category: 'Kernel & CPU',
    impact: 'HIGH',
    safety: 'Vanguard Safe',
    requiresReboot: true,
    optIn: false,
    description: 'Sets SystemResponsiveness=0, MMCSS Games to Priority 6 / High / SFIO High, and Win32PrioritySeparation=0x26 for tighter 1% lows.',
    apply: `
      $mmcss = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
      $games = "$mmcss\\Tasks\\Games"
      Set-ItemProperty -Path $mmcss -Name 'SystemResponsiveness' -Type DWord -Value 0
      Set-ItemProperty -Path $mmcss -Name 'NetworkThrottlingIndex' -Type DWord -Value 0xffffffff
      Set-ItemProperty -Path $games -Name 'GPU Priority' -Type DWord -Value 8
      Set-ItemProperty -Path $games -Name 'Priority' -Type DWord -Value 6
      Set-ItemProperty -Path $games -Name 'Scheduling Category' -Type String -Value 'High'
      Set-ItemProperty -Path $games -Name 'SFIO Priority' -Type String -Value 'High'
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Type DWord -Value 0x26
      Write-Output '[OK] MMCSS Games=High/Priority 6, SystemResponsiveness=0, Win32PrioritySeparation=0x26'
    `,
    revert: `
      $mmcss = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
      $games = "$mmcss\\Tasks\\Games"
      Set-ItemProperty -Path $mmcss -Name 'SystemResponsiveness' -Type DWord -Value 20
      Set-ItemProperty -Path $games -Name 'Priority' -Type DWord -Value 2
      Set-ItemProperty -Path $games -Name 'Scheduling Category' -Type String -Value 'Medium'
      Set-ItemProperty -Path $games -Name 'SFIO Priority' -Type String -Value 'Normal'
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' -Name 'Win32PrioritySeparation' -Type DWord -Value 2
      Write-Output '[REVERT] Restored default MMCSS & Win32PrioritySeparation'
    `,
  },
  {
    id: 'kernel_timer',
    name: 'Global Timer Resolution, No Power Throttling & Static Tick',
    category: 'Kernel & CPU',
    impact: 'HIGH',
    safety: 'Vanguard Safe',
    requiresReboot: true,
    optIn: false,
    description: 'Enables GlobalTimerResolutionRequests=1, disables Windows PowerThrottling, locks kernel in RAM (if ≥16GB), and disables dynamic tick on desktops.',
    apply: `
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel' -Name 'GlobalTimerResolutionRequests' -Type DWord -Value 1
      New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Force | Out-Null
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Name 'PowerThrottlingOff' -Type DWord -Value 1
      $os = Get-CimInstance Win32_OperatingSystem
      if (($os.TotalVisibleMemorySize / 1MB) -ge 15) {
        Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management' -Name 'DisablePagingExecutive' -Type DWord -Value 1
      }
      if (-not (Get-CimInstance Win32_Battery)) {
        bcdedit /set disabledynamictick yes | Out-Null
        Write-Output '[OK] GlobalTimerRes=1, PowerThrottlingOff=1, DisablePagingExecutive=1, DynamicTick=Off'
      } else {
        Write-Output '[OK] GlobalTimerRes=1, PowerThrottlingOff=1 (Laptop detected: DynamicTick left default)'
      }
    `,
    revert: `
      Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel' -Name 'GlobalTimerResolutionRequests' -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling' -Name 'PowerThrottlingOff' -ErrorAction SilentlyContinue
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management' -Name 'DisablePagingExecutive' -Type DWord -Value 0 -ErrorAction SilentlyContinue
      bcdedit /deletevalue disabledynamictick 2>$null | Out-Null
      Write-Output '[REVERT] Restored default kernel timer, paging executive & dynamic tick'
    `,
  },
  {
    id: 'power_plan',
    name: 'Ultimate Performance & Hybrid P-Core Power Plan',
    category: 'Power & Hardware',
    impact: 'HIGH',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Activates Ultimate/High Performance plan, unparks 100% of P/E cores, sets Aggressive boost, prefers P-cores on hybrid CPUs, and disables USB/PCIe power saving.',
    apply: `
      $plans = powercfg /list
      if ($plans -notmatch 'Ultimate Performance') {
        powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null | Out-Null
        $plans = powercfg /list
      }
      $match = [regex]::Match(($plans -join "\`n"), '([0-9a-f-]{36})\\s+\\(Ultimate Performance\\)', 'IgnoreCase')
      if (-not $match.Success) {
        $match = [regex]::Match(($plans -join "\`n"), '([0-9a-f-]{36})\\s+\\(High performance\\)', 'IgnoreCase')
      }
      if ($match.Success) { powercfg /setactive $match.Groups[1].Value | Out-Null }
      $subProc = '54533251-82be-4824-96c1-47b60b740d00'
      powercfg /setacvalueindex SCHEME_CURRENT $subProc 0cc5b647-c1df-4637-891a-dec35c318583 100 2>$null | Out-Null
      powercfg /setacvalueindex SCHEME_CURRENT $subProc 0cc5b647-c1df-4637-891a-dec35c318584 100 2>$null | Out-Null
      powercfg /setacvalueindex SCHEME_CURRENT $subProc be337238-0d82-4146-a960-4f3749d470c7 2 2>$null | Out-Null
      powercfg /setacvalueindex SCHEME_CURRENT $subProc 93b8b6dc-0698-4d1c-9ee4-0644e900c85d 2 2>$null | Out-Null
      powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>$null | Out-Null
      powercfg /setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0 2>$null | Out-Null
      powercfg /setactive SCHEME_CURRENT | Out-Null
      Write-Output '[OK] Ultimate/High Performance tuned: 0% core parking, P-core priority, USB/PCIe suspend OFF'
    `,
    revert: `
      $subProc = '54533251-82be-4824-96c1-47b60b740d00'
      powercfg /setacvalueindex SCHEME_CURRENT $subProc 93b8b6dc-0698-4d1c-9ee4-0644e900c85d 5 2>$null | Out-Null
      powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1 2>$null | Out-Null
      powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e 2>$null | Out-Null
      Write-Output '[REVERT] Restored Balanced power plan & default USB/Hetero policies'
    `,
  },
  {
    id: 'usb_power',
    name: 'Disable USB & Peripheral Power Saving',
    category: 'Power & Hardware',
    impact: 'MED',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Turns off "Allow computer to turn off this device" across all USB Root Hubs, mice, and keyboards to stop 1000Hz–8000Hz polling dips.',
    apply: `
      $cnt = 0
      Get-CimInstance -Namespace root\\wmi -ClassName MSPower_DeviceEnable | Where-Object { $_.InstanceName -match 'USB|HID' -and $_.Enable -eq $true } | ForEach-Object {
        try { Set-CimInstance -InputObject $_ -Property @{ Enable = $false } -ErrorAction Stop; $cnt++ } catch {}
      }
      Write-Output "[OK] Disabled power-saving on $cnt USB/HID devices"
    `,
    revert: `
      $cnt = 0
      Get-CimInstance -Namespace root\\wmi -ClassName MSPower_DeviceEnable | Where-Object { $_.InstanceName -match 'USB|HID' -and $_.Enable -eq $false } | ForEach-Object {
        try { Set-CimInstance -InputObject $_ -Property @{ Enable = $true } -ErrorAction Stop; $cnt++ } catch {}
      }
      Write-Output "[REVERT] Re-enabled power-saving on $cnt USB/HID devices"
    `,
  },
  {
    id: 'gpu_msi',
    name: 'GPU MSI-X Mode & High Interrupt Priority',
    category: 'Power & Hardware',
    impact: 'MED',
    safety: 'Vanguard Safe',
    requiresReboot: true,
    optIn: false,
    description: 'Enables Message Signaled Interrupts (MSI-X) and High DevicePriority on your NVIDIA/AMD PCIe GPU and GPU Audio controller.',
    apply: `
      $cnt = 0
      Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\PCI' | Where-Object { $_.PSChildName -match '^(VEN_10DE|VEN_1002)' } | ForEach-Object {
        Get-ChildItem $_.PSPath | ForEach-Object {
          $msiPath = Join-Path $_.PSPath 'Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties'
          if (Test-Path $msiPath) {
            Set-ItemProperty -Path $msiPath -Name 'MSISupported' -Type DWord -Value 1
            $affPath = Join-Path $_.PSPath 'Device Parameters\\Interrupt Management\\Affinity Policy'
            New-Item -Path $affPath -Force | Out-Null
            Set-ItemProperty -Path $affPath -Name 'DevicePriority' -Type DWord -Value 3
            $cnt++
          }
        }
      }
      Write-Output "[OK] Enabled MSI-X & High Interrupt Priority on $cnt GPU PCIe device(s)"
    `,
    revert: `
      Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\PCI' | Where-Object { $_.PSChildName -match '^(VEN_10DE|VEN_1002)' } | ForEach-Object {
        Get-ChildItem $_.PSPath | ForEach-Object {
          $affPath = Join-Path $_.PSPath 'Device Parameters\\Interrupt Management\\Affinity Policy'
          Remove-ItemProperty -Path $affPath -Name 'DevicePriority' -ErrorAction SilentlyContinue
        }
      }
      Write-Output '[REVERT] Restored default GPU interrupt priority'
    `,
  },
  {
    id: 'ethernet_latency',
    name: 'Wired Ethernet Low-Latency Tuning',
    category: 'Network & Latency',
    impact: 'MED',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Disables Energy Efficient Ethernet (EEE), Advanced EEE, Green Ethernet, Flow Control, and Interrupt Moderation on your active wired NIC.',
    apply: `
      $nic = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -notmatch '802\\.11|Wireless' } | Select-Object -First 1
      if ($nic) {
        $changed = 0
        foreach ($p in @('Energy Efficient Ethernet','Advanced EEE','Green Ethernet','Flow Control','Interrupt Moderation')) {
          if (Get-NetAdapterAdvancedProperty -Name $nic.Name -DisplayName $p -ErrorAction SilentlyContinue) {
            Set-NetAdapterAdvancedProperty -Name $nic.Name -DisplayName $p -DisplayValue 'Disabled' -NoRestart -ErrorAction SilentlyContinue
            $changed++
          }
        }
        if ($changed -gt 0) { Restart-NetAdapter -Name $nic.Name -ErrorAction SilentlyContinue }
        Write-Output "[OK] Tuned $changed properties on $($nic.Name)"
      } else {
        Write-Output '[SKIP] No active wired Ethernet adapter found'
      }
    `,
    revert: `
      $nic = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -notmatch '802\\.11|Wireless' } | Select-Object -First 1
      if ($nic) {
        foreach ($p in @('Energy Efficient Ethernet','Advanced EEE','Green Ethernet','Interrupt Moderation')) {
          Set-NetAdapterAdvancedProperty -Name $nic.Name -DisplayName $p -DisplayValue 'Enabled' -NoRestart -ErrorAction SilentlyContinue
        }
        Set-NetAdapterAdvancedProperty -Name $nic.Name -DisplayName 'Flow Control' -DisplayValue 'Rx & Tx Enabled' -NoRestart -ErrorAction SilentlyContinue
        Restart-NetAdapter -Name $nic.Name -ErrorAction SilentlyContinue
        Write-Output "[REVERT] Restored default Ethernet power properties on $($nic.Name)"
      }
    `,
  },
  {
    id: 'memory_services',
    name: 'Disable Memory Compression, Telemetry & Disk Overhead',
    category: 'Memory & Services',
    impact: 'HIGH',
    safety: 'Vanguard Safe',
    requiresReboot: true,
    optIn: false,
    description: 'Disables Memory Compression (if ≥16GB RAM), stops SysMain/DiagTrack/WerSvc & noisy CEIP tasks, disables P2P Windows Update uploads, and tunes NTFS.',
    apply: `
      $os = Get-CimInstance Win32_OperatingSystem
      if (($os.TotalVisibleMemorySize / 1MB) -ge 15) {
        Disable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue
      }
      foreach ($s in @('SysMain','DiagTrack','WerSvc')) {
        Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
        Set-Service -Name $s -StartupType Disabled -ErrorAction SilentlyContinue
      }
      foreach ($t in @(
        '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
        '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
        '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
        '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
        '\\Microsoft\\Windows\\Autochk\\Proxy'
      )) {
        $folder = Split-Path $t -Parent; $name = Split-Path $t -Leaf
        Disable-ScheduledTask -TaskPath "$folder\\" -TaskName $name -ErrorAction SilentlyContinue | Out-Null
      }
      New-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config' -Force | Out-Null
      Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config' -Name 'DODownloadMode' -Type DWord -Value 0
      fsutil behavior set disablelastaccess 1 | Out-Null
      fsutil behavior set memoryusage 2 | Out-Null
      Write-Output '[OK] Memory Compression OFF, SysMain/DiagTrack/WerSvc disabled, DeliveryOpt OFF, NTFS tuned'
    `,
    revert: `
      Enable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue
      foreach ($s in @('SysMain','DiagTrack')) {
        Set-Service -Name $s -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name $s -ErrorAction SilentlyContinue
      }
      Set-Service -Name 'WerSvc' -StartupType Manual -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config' -Name 'DODownloadMode' -ErrorAction SilentlyContinue
      fsutil behavior set disablelastaccess 2 | Out-Null
      fsutil behavior set memoryusage 1 | Out-Null
      Write-Output '[REVERT] Re-enabled Memory Compression, SysMain, DiagTrack, DeliveryOpt & NTFS defaults'
    `,
  },
  {
    id: 'defender_exclusions',
    name: 'Windows Defender Game Folder Exclusions',
    category: 'Memory & Services',
    impact: 'MED',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Excludes Riot Games and VALORANT AppData folders from real-time antivirus scans to stop mid-match shader & asset stutters.',
    apply: `
      $added = @()
      foreach ($p in @('C:\\Riot Games', "$env:LOCALAPPDATA\\VALORANT")) {
        if (Test-Path $p) {
          Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
          $added += $p
        }
      }
      Write-Output "[OK] Added Defender exclusions: $($added -join ', ')"
    `,
    revert: `
      foreach ($p in @('C:\\Riot Games', "$env:LOCALAPPDATA\\VALORANT")) {
        Remove-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
      }
      Write-Output '[REVERT] Removed Valorant Defender exclusions'
    `,
  },
  {
    id: 'user_gaming',
    name: 'Windows Gaming Mode, GameDVR OFF & High Priority IFEO',
    category: 'Gaming & Valorant',
    impact: 'MED',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Locks Game Mode ON, GameDVR & background UWP apps OFF, reduces desktop shell animations, and sets VALORANT-Win64-Shipping.exe to High CPU priority.',
    apply: `
      New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Force | Out-Null
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Name 'GlobalUserDisabled' -Type DWord -Value 1
      New-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Force | Out-Null
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' -Name 'AppCaptureEnabled' -Type DWord -Value 0
      Set-ItemProperty -Path 'HKCU:\\System\\GameConfigStore' -Name 'GameDVR_Enabled' -Type DWord -Value 0
      New-Item -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Force | Out-Null
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name 'AutoGameModeEnabled' -Type DWord -Value 1
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name 'AllowAutoGameMode' -Type DWord -Value 1
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\GameBar' -Name 'UseNexusForGameBarEnabled' -Type DWord -Value 0
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Type String -Value '0'
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name 'EnableTransparency' -Type DWord -Value 0
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name 'MinAnimate' -Type String -Value '0'
      $ifeo = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\VALORANT-Win64-Shipping.exe\\PerfOptions'
      New-Item -Path $ifeo -Force | Out-Null
      Set-ItemProperty -Path $ifeo -Name 'CpuPriorityClass' -Type DWord -Value 3
      Write-Output '[OK] Game Mode ON, GameDVR/Background Apps OFF, IFEO CpuPriorityClass=3'
    `,
    revert: `
      Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications' -Name 'GlobalUserDisabled' -Type DWord -Value 0 -ErrorAction SilentlyContinue
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name 'MenuShowDelay' -Type String -Value '400' -ErrorAction SilentlyContinue
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -Name 'MinAnimate' -Type String -Value '1' -ErrorAction SilentlyContinue
      Remove-Item -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\VALORANT-Win64-Shipping.exe' -Recurse -Force -ErrorAction SilentlyContinue
      Write-Output '[REVERT] Restored default Windows user gaming & IFEO priority settings'
    `,
  },
  {
    id: 'valorant_config',
    name: 'Valorant .ini Scalability & Improve Clarity Fix',
    category: 'Gaming & Valorant',
    impact: 'MED',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Backs up your Valorant configs, sets hidden sg.*Quality values to 0 across all accounts, and turns off ImproveClarity while preserving res, sens, crosshairs & Reflex.',
    apply: `
      if (Get-Process -Name 'VALORANT-Win64-Shipping' -ErrorAction SilentlyContinue) {
        Write-Output '[SKIP] Close VALORANT first before editing config .ini files'
      } else {
        $root = "$env:LOCALAPPDATA\\VALORANT\\Saved\\Config"
        if (Test-Path $root) {
          $c1 = 0; $c2 = 0
          Get-ChildItem $root -Recurse -Filter 'GameUserSettings.ini' | Where-Object { $_.FullName -notmatch '_backup' } | ForEach-Object {
            $txt = Get-Content $_.FullName -Raw
            $upd = [regex]::Replace($txt, '(?m)^(sg\\.[A-Za-z]+Quality)=[1-9]\\d*', '$1=0')
            if ($upd -ne $txt) { Set-Content $_.FullName -Value $upd -NoNewline -Encoding UTF8; $c1++ }
          }
          Get-ChildItem $root -Recurse -Filter 'RiotUserSettings.ini' | Where-Object { $_.FullName -notmatch '_backup' } | ForEach-Object {
            $txt = Get-Content $_.FullName -Raw
            $upd = $txt -replace 'EAresBoolSettingName::ImproveClarity=True', 'EAresBoolSettingName::ImproveClarity=False'
            if ($upd -ne $txt) { Set-Content $_.FullName -Value $upd -NoNewline -Encoding UTF8; $c2++ }
          }
          Write-Output "[OK] Optimized Valorant configs ($c1 GameUserSettings, $c2 RiotUserSettings updated)"
        } else {
          Write-Output '[SKIP] Valorant config folder not found'
        }
      }
    `,
    revert: `
      Write-Output '[INFO] Original Valorant .ini backups are stored in Documents\\BareFrame\\backups\\'
    `,
  },
  {
    id: 'nvidia_shadowplay',
    name: 'Disable NVIDIA ShadowPlay 120FPS Background Recording',
    category: 'Gaming & Valorant',
    impact: 'HIGH',
    safety: 'Vanguard Safe',
    requiresReboot: false,
    optIn: false,
    description: 'Turns off ShadowPlay / Instant Replay background recording flags (RecEnabled & DwmDvrEnabled) to eliminate D3D capture hook overhead.',
    apply: `
      $sp = 'HKCU:\\Software\\NVIDIA Corporation\\Global\\ShadowPlay\\NVSPCAPS'
      if (Test-Path $sp) {
        $z = [byte[]](0,0,0,0)
        foreach ($v in @('RecEnabled','DwmDvrEnabledV1')) {
          Set-ItemProperty -Path $sp -Name $v -Type Binary -Value $z -ErrorAction SilentlyContinue
        }
        Write-Output '[OK] Disabled NVIDIA ShadowPlay background recording flags (also toggle NVIDIA Overlay OFF in NVIDIA App UI)'
      } else {
        Write-Output '[OK] NVIDIA ShadowPlay recording not active'
      }
    `,
    revert: `
      Write-Output '[INFO] Re-enable Instant Replay anytime inside NVIDIA App -> Overlay (Alt+Z)'
    `,
  },
  {
    id: 'baremetal_vbs',
    name: 'Bare-Metal Mode (Disable VBS & Hypervisor Tax)',
    category: 'Advanced (Opt-In)',
    impact: 'VERY HIGH',
    safety: 'Opt-In: Disables WSL2/Hyper-V',
    requiresReboot: true,
    optIn: true,
    description: 'Disables Windows Virtualization-Based Security & Hyper-V hypervisor launch (+10–18% CPU FPS in DX11 games). Leaves TPM 2.0 & Secure Boot intact. Note: Disable WSL2/Docker while off; if Vanguard shows VAN:RESTRICTION on your account, revert this toggle.',
    apply: `
      New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' -Force | Out-Null
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' -Name 'EnableVirtualizationBasedSecurity' -Type DWord -Value 0
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' -Name 'RequirePlatformSecurityFeatures' -Type DWord -Value 0
      New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Force | Out-Null
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Name 'Enabled' -Type DWord -Value 0
      bcdedit /set hypervisorlaunchtype off | Out-Null
      Write-Output '[OK] Bare-Metal VBS=0 & hypervisorlaunchtype=Off (Reboot required!)'
    `,
    revert: `
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' -Name 'EnableVirtualizationBasedSecurity' -Type DWord -Value 1 -ErrorAction SilentlyContinue
      Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity' -Name 'Enabled' -Type DWord -Value 1 -ErrorAction SilentlyContinue
      bcdedit /set hypervisorlaunchtype auto | Out-Null
      Write-Output '[REVERT] Re-enabled VBS, HVCI & hypervisorlaunchtype=Auto (Reboot required!)'
    `,
  },
];

function getTweakList() {
  return TWEAKS.map(({ apply, revert, ...meta }) => meta);
}

async function createBackup(onLog) {
  const script = `
    $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dir = Join-Path "${BACKUP_ROOT.replace(/\\/g, '\\\\')}" $ts
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    & reg.exe export 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' (Join-Path $dir 'mmcss.reg') /y 2>$null | Out-Null
    & reg.exe export 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl' (Join-Path $dir 'priority.reg') /y 2>$null | Out-Null
    & reg.exe export 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard' (Join-Path $dir 'deviceguard.reg') /y 2>$null | Out-Null
    $valRoot = "$env:LOCALAPPDATA\\VALORANT\\Saved\\Config"
    if (Test-Path $valRoot) {
      $vb = Join-Path $dir 'ValorantConfig'
      New-Item -ItemType Directory -Path $vb -Force | Out-Null
      Get-ChildItem $valRoot -Recurse -Include 'GameUserSettings.ini','RiotUserSettings.ini' | Where-Object { $_.FullName -notmatch '_backup' } | ForEach-Object {
        $n = ($_.FullName.Substring($valRoot.Length + 1)) -replace '[\\\\/:]', '__'
        Copy-Item $_.FullName (Join-Path $vb $n) -Force
      }
    }
    try {
      Checkpoint-Computer -Description "BareFrame Before Optimize ($ts)" -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
      Write-Output "[BACKUP] System Restore Point + Registry/Config backup saved to $dir"
    } catch {
      Write-Output "[BACKUP] Registry & Config backup saved to $dir (Restore Point skipped: created recently or System Protection off)"
    }
  `;
  return runPS(script, { timeoutMs: 90000, onLine: onLog });
}

async function applyTweaks(selectedIds, onLog, onProgress) {
  const chosen = TWEAKS.filter((t) => selectedIds.includes(t.id));
  if (chosen.length === 0) return { applied: 0, requiresReboot: false, results: [] };

  const totalSteps = chosen.length + 1;
  const results = [];

  if (onProgress) {
    onProgress({ step: 0, total: totalSteps, pct: 3, label: 'Creating System Restore Point & Registry/Config Backups…', id: 'backup' });
  }
  const bk = await createBackup(onLog);
  results.push({
    id: 'backup',
    name: 'System Restore Point & Registry/Config Backup',
    category: 'Safety',
    status: 'DONE',
    detail: (bk.stdout.split(/\r?\n/).filter(Boolean).pop() || 'Backup saved to Documents\\BareFrame\\backups').replace(/^\[BACKUP\]\s*/, ''),
  });

  for (let i = 0; i < chosen.length; i++) {
    const t = chosen[i];
    const stepNum = i + 1;
    const pctStart = Math.round((stepNum / totalSteps) * 100);
    if (onProgress) {
      onProgress({ step: stepNum, total: totalSteps, pct: Math.max(8, pctStart - 5), label: `Applying: ${t.name}…`, id: t.id });
    }
    try {
      const res = await runPS(`$ErrorActionPreference = 'Continue'\n${t.apply}`, { timeoutMs: 60000, onLine: onLog });
      const lastLine = (res.stdout.split(/\r?\n/).filter(Boolean).pop() || 'Applied successfully').replace(/^\[(OK|SKIP|INFO)\]\s*/, '');
      const skipped = /\[SKIP\]/.test(res.stdout);
      results.push({
        id: t.id,
        name: t.name,
        category: t.category,
        impact: t.impact,
        status: skipped ? 'SKIPPED' : 'DONE',
        detail: lastLine,
      });
    } catch (err) {
      results.push({
        id: t.id,
        name: t.name,
        category: t.category,
        impact: t.impact,
        status: 'ERROR',
        detail: err.message,
      });
    }
    if (onProgress) {
      onProgress({ step: stepNum + 1, total: totalSteps, pct: Math.round(((stepNum + 1) / totalSteps) * 100), label: `Completed: ${t.name}`, id: t.id });
    }
  }

  const requiresReboot = chosen.some((t) => t.requiresReboot);
  return { applied: results.filter((r) => r.status === 'DONE').length, requiresReboot, results };
}

async function revertTweaks(selectedIds, onLog) {
  const chosen = selectedIds && selectedIds.length
    ? TWEAKS.filter((t) => selectedIds.includes(t.id))
    : TWEAKS;
  const fullScript = chosen.map((t) => `# --- REVERT ${t.id} ---\n${t.revert}`).join('\n');
  const res = await runPS(fullScript, { timeoutMs: 120000, onLine: onLog });
  return { reverted: chosen.length, requiresReboot: true, exitCode: res.code };
}

module.exports = { getTweakList, applyTweaks, revertTweaks, BACKUP_ROOT };
