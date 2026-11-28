const { runPSJson } = require('./ps');
const { getGameProfile } = require('./games');

function buildAuditScript(gameId) {
  const profile = getGameProfile(gameId);
  const primaryExe = profile.executables[0];

  const defMatch = {
    valorant: 'Riot Games|VALORANT',
    cs2: 'Counter-Strike Global Offensive',
    fortnite: 'Fortnite',
    apex: 'Apex',
    r6: 'Rainbow Six',
    all: 'Riot Games|VALORANT|Counter-Strike|Fortnite|Apex|Rainbow Six',
  }[profile.id] || 'Riot Games|VALORANT';

  return `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic|Remote|Virtual' })
$gpu = $gpus | Sort-Object AdapterRAM -Descending | Select-Object -First 1
if (-not $gpu) { $gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1 }
$rams = @(Get-CimInstance Win32_PhysicalMemory)
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
$battery = Get-CimInstance Win32_Battery
$isLaptop = [bool]$battery

$totalRamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$ramSpeed = ($rams | Measure-Object -Property ConfiguredClockSpeed -Maximum).Maximum
if (-not $ramSpeed) { $ramSpeed = ($rams | Measure-Object -Property Speed -Maximum).Maximum }

# Power plan
$activePower = (powercfg /getactivescheme) -replace '^.*\\((.*)\\).*$', '$1'
$usbSuspendOut = (powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 2>$null | Select-String 'Current AC') -join ''
$usbSuspendOff = $usbSuspendOut -match '0x00000000'
$pcieOut = (powercfg /query SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 2>$null | Select-String 'Current AC') -join ''
$pcieOff = $pcieOut -match '0x00000000'

# MMCSS & Scheduler
$mmcss = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
$games = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'
$prio = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl'
$mmcssOk = ($mmcss.SystemResponsiveness -eq 0) -and ($games.Priority -ge 6) -and ($games.'Scheduling Category' -eq 'High') -and ($prio.Win32PrioritySeparation -eq 38)

# Kernel & Timer
$kern = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel'
$pth = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling'
$bcd = if ($isAdmin) { (bcdedit /enum '{current}' 2>$null) -join "\`n" } else { '' }
$dynTickOff = if ($isAdmin) { $bcd -match 'disabledynamictick\\s+Yes' } else { $true }
$kernelOk = ($kern.GlobalTimerResolutionRequests -eq 1) -and ($pth.PowerThrottlingOff -eq 1) -and ($isLaptop -or $dynTickOff)

# Memory Compression & Services
$mma = if ($isAdmin) { Get-MMAgent } else { $null }
$memCompOff = if ($mma) { -not $mma.MemoryCompression } else { -not [bool](Get-Process -Name 'Memory Compression') }
$sysMain = (Get-Service SysMain).StartType.ToString()
$diagTrack = (Get-Service DiagTrack).StartType.ToString()
$servicesOk = ($sysMain -eq 'Disabled') -and ($diagTrack -eq 'Disabled') -and ($totalRamGB -lt 16 -or $memCompOff)

# USB power saving
$usbSavingCount = @(Get-CimInstance -Namespace root\\wmi -ClassName MSPower_DeviceEnable | Where-Object { $_.InstanceName -match 'USB|HID' -and $_.Enable -eq $true }).Count

# GPU MSI Mode & Priority (NVIDIA VEN_10DE or AMD VEN_1002)
$gpuMsiOk = $false
$gpuHighPrio = $false
$gpuKeys = Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\PCI' | Where-Object { $_.PSChildName -match '^(VEN_10DE|VEN_1002)' }
foreach ($gk in $gpuKeys) {
    Get-ChildItem $gk.PSPath | ForEach-Object {
        $msi = (Get-ItemProperty (Join-Path $_.PSPath 'Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties')).MSISupported
        $dp = (Get-ItemProperty (Join-Path $_.PSPath 'Device Parameters\\Interrupt Management\\Affinity Policy')).DevicePriority
        if ($msi -eq 1) { $gpuMsiOk = $true }
        if ($dp -eq 3) { $gpuHighPrio = $true }
    }
}

# ReBAR check via nvidia-smi if available
$rebarMB = 0
$gpuTemp = $null
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $barLine = (nvidia-smi -q -d MEMORY 2>$null | Select-String 'BAR1' -Context 0,2) -join ' '
    if ($barLine -match 'Total\\s*:\\s*(\\d+)\\s*MiB') { $rebarMB = [int]$Matches[1] }
    $tLine = (nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    if ($tLine -match '^\\d+') { $gpuTemp = [int]$Matches[0] }
}

# Active Ethernet adapter & power-saving properties
$nic = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -notmatch '802\\.11|Wireless' } | Select-Object -First 1
$nicEnabledCount = 0
$nicName = if ($nic) { $nic.Name } else { 'None (Wi-Fi)' }
if ($nic) {
    $nicProps = @(Get-NetAdapterAdvancedProperty -Name $nic.Name | Where-Object {
        $_.DisplayName -match 'Energy Efficient|Advanced EEE|Green Ethernet|Flow Control|Interrupt Moderation' -and $_.DisplayValue -notmatch 'Disabled'
    })
    $nicEnabledCount = $nicProps.Count
}

# Defender exclusions (only readable when elevated; avoid false negative in standard mode)
$defExcl = if ($isAdmin) { @((Get-MpPreference).ExclusionPath) } else { @() }
$defOk = if ($isAdmin) {
    ($defExcl | Where-Object { $_ -match '${defMatch}' }).Count -gt 0
} else {
    $mmcssOk -and $kernelOk
}

# User gaming & IFEO for active game
$gm = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar').AutoGameModeEnabled
$gdvr = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR').AppCaptureEnabled
$bgOff = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications').GlobalUserDisabled
$ifeo = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${primaryExe}\\PerfOptions').CpuPriorityClass
$userGamingOk = (($null -eq $gm) -or ($gm -eq 1)) -and (($null -eq $gdvr) -or ($gdvr -eq 0)) -and ($bgOff -eq 1) -and ($ifeo -eq 3)

# Game-specific config check
$gameConfigOk = $true
$gameConfigNote = ''
$gameInstalled = $false
$layersPath = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers'
$layerProps = if (Test-Path $layersPath) { (Get-ItemProperty $layersPath).PSObject.Properties } else { @() }

if ('${profile.id}' -eq 'valorant') {
    $valRoot = "$env:LOCALAPPDATA\\VALORANT\\Saved\\Config"
    $gameInstalled = Test-Path $valRoot
    if ($gameInstalled) {
        $nonZeroSg = 0; $impClarity = $false
        Get-ChildItem $valRoot -Recurse -Filter 'GameUserSettings.ini' | Where-Object { $_.FullName -notmatch '_backup' } | ForEach-Object {
            $nonZeroSg += @(Select-String -Path $_.FullName -Pattern '^sg\\.[A-Za-z]+Quality=[1-9]').Count
        }
        Get-ChildItem $valRoot -Recurse -Filter 'RiotUserSettings.ini' | Where-Object { $_.FullName -notmatch '_backup' } | ForEach-Object {
            if (Select-String -Path $_.FullName -Pattern 'ImproveClarity=True' -Quiet) { $impClarity = $true }
        }
        $gameConfigOk = ($nonZeroSg -eq 0) -and (-not $impClarity)
        if (-not $gameConfigOk) { $gameConfigNote = "Found $nonZeroSg non-zero scalability values" + $(if ($impClarity) { ' and ImproveClarity=True' } else { '' }) }
    }
} elseif ('${profile.id}' -eq 'cs2') {
    $hasLayer = @($layerProps | Where-Object { $_.Name -like '*cs2.exe' -and $_.Value -match 'DISABLEDXMAXIMIZEDWINDOWEDMODE' }).Count -gt 0
    $steamRoots = @('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\SteamLibrary', 'E:\\SteamLibrary')
    $vdf = 'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf'
    if (Test-Path $vdf) {
        $vdfTxt = Get-Content $vdf -Raw
        foreach ($m in [regex]::Matches($vdfTxt, '"path"\\s+"([^"]+)"')) {
            $p = $m.Groups[1].Value -replace '\\\\\\\\', '\\'
            if ($p -and ($steamRoots -notcontains $p)) { $steamRoots += $p }
        }
    }
    $cs2OnDisk = $false
    foreach ($r in $steamRoots) {
        if (Test-Path (Join-Path $r 'steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe')) { $cs2OnDisk = $true; break }
    }
    $gameInstalled = $hasLayer -or $cs2OnDisk
    $gameConfigOk = (-not $gameInstalled) -or $hasLayer
    if (-not $gameConfigOk) { $gameConfigNote = 'Windows Fullscreen Optimizations are still active on cs2.exe.' }
} elseif ('${profile.id}' -eq 'fortnite') {
    $fnIni = "$env:LOCALAPPDATA\\FortniteGame\\Saved\\Config\\WindowsClient\\GameUserSettings.ini"
    $gameInstalled = Test-Path $fnIni
    if ($gameInstalled) {
        $dirty = (Select-String -Path $fnIni -Pattern '^(bShowGrass=True|bMotionBlur=True|bDisableMouseAcceleration=False)' -Quiet)
        $gameConfigOk = -not $dirty
        if (-not $gameConfigOk) { $gameConfigNote = 'Fortnite GameUserSettings.ini still has MotionBlur, Grass, or Mouse Acceleration enabled.' }
    }
} elseif ('${profile.id}' -eq 'apex') {
    $cfg = "$env:USERPROFILE\\Saved Games\\Respawn\\Apex\\local\\videoconfig.txt"
    $hasLayer = @($layerProps | Where-Object { $_.Name -match 'r5apex' -and $_.Value -match 'DISABLEDXMAXIMIZEDWINDOWEDMODE' }).Count -gt 0
    $gameInstalled = (Test-Path $cfg) -or $hasLayer
    if (Test-Path $cfg) {
        $vsyncOn = Select-String -Path $cfg -Pattern '"setting\\.mat_vsync_mode"\\s+"[1-9]"' -Quiet
        $gameConfigOk = (-not $vsyncOn) -and $hasLayer
        if (-not $gameConfigOk) { $gameConfigNote = 'Apex videoconfig or Fullscreen Optimization flags can be tightened.' }
    }
} elseif ('${profile.id}' -eq 'r6') {
    $r6Root = "$env:USERPROFILE\\Documents\\My Games\\Rainbow Six - Siege"
    $gameInstalled = Test-Path $r6Root
    if ($gameInstalled) {
        $dirty = $false
        Get-ChildItem $r6Root -Recurse -Filter 'GameSettings.ini' | ForEach-Object {
            if (Select-String -Path $_.FullName -Pattern '^(VSync=[1-9]|MotionBlur=[1-9]|LensEffects=[1-9])' -Quiet) { $dirty = $true }
        }
        $gameConfigOk = -not $dirty
        if (-not $gameConfigOk) { $gameConfigNote = 'R6 GameSettings.ini still has VSync, MotionBlur, or LensEffects enabled.' }
    }
}

# VBS / HVCI
$dg = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard
$vbsStatus = if ($dg) { [int]$dg.VirtualizationBasedSecurityStatus } else { 0 }
$hvciRunning = ($dg -and ($dg.SecurityServicesRunning -contains 2))

# Overlays & background hogs
$nvOverlayRunning = [bool](Get-Process -Name 'NVIDIA Overlay','PresentMon_x64')
$spRec = (Get-ItemProperty 'HKCU:\\Software\\NVIDIA Corporation\\Global\\ShadowPlay\\NVSPCAPS').RecEnabled
$spRecOff = (-not $spRec) -or ($spRec[0] -eq 0)

$result = [PSCustomObject]@{
    gameId = '${profile.id}'
    isAdmin = $isAdmin
    isLaptop = $isLaptop
    gameInstalled = $gameInstalled
    hardware = [PSCustomObject]@{
        cpuName = $cpu.Name.Trim()
        cpuCores = [int]$cpu.NumberOfCores
        cpuThreads = [int]$cpu.NumberOfLogicalProcessors
        cpuBaseMHz = [int]$cpu.MaxClockSpeed
        gpuName = $gpu.Name.Trim()
        gpuDriver = $gpu.DriverVersion
        gpuTempC = $gpuTemp
        refreshRate = [int]$gpu.CurrentRefreshRate
        resolution = "$($gpu.CurrentHorizontalResolution)x$($gpu.CurrentVerticalResolution)"
        rebarMB = $rebarMB
        ramTotalGB = $totalRamGB
        ramFreeGB = $freeRamGB
        ramSticks = $rams.Count
        ramSpeedMHz = [int]$ramSpeed
        boardVendor = $board.Manufacturer.Trim()
        boardModel = $board.Product.Trim()
        biosVersion = $bios.SMBIOSBIOSVersion
        osCaption = $os.Caption.Trim()
        osBuild = $os.BuildNumber
        nicName = $nicName
        activePowerPlan = $activePower
    }
    status = [PSCustomObject]@{
        mmcss_scheduler = $mmcssOk
        kernel_timer = $kernelOk
        power_plan = (($activePower -match 'Ultimate|High performance') -and $usbSuspendOff -and $pcieOff)
        memory_services = $servicesOk
        usb_power = ($usbSavingCount -eq 0)
        gpu_msi = ($gpuMsiOk -and $gpuHighPrio)
        ethernet_latency = ($nicEnabledCount -eq 0)
        defender_exclusions = $defOk
        user_gaming = $userGamingOk
        game_config = $gameConfigOk
        nvidia_shadowplay = ($spRecOff -and (-not $nvOverlayRunning))
        baremetal_vbs = ($vbsStatus -eq 0)
    }
    details = [PSCustomObject]@{
        usbSavingCount = $usbSavingCount
        nicEnabledCount = $nicEnabledCount
        vbsStatus = $vbsStatus
        hvciRunning = $hvciRunning
        nvOverlayRunning = $nvOverlayRunning
        memCompOff = $memCompOff
        sysMain = $sysMain
        diagTrack = $diagTrack
        dynTickOff = $dynTickOff
        gameConfigNote = $gameConfigNote
        gpuMsiOk = $gpuMsiOk
        gpuHighPrio = $gpuHighPrio
    }
}
$result | ConvertTo-Json -Depth 5 -Compress
`;
}

async function runSystemAudit(gameId = 'valorant') {
  const profile = getGameProfile(gameId);
  const data = await runPSJson(buildAuditScript(profile.id), { timeoutMs: 30000 });

  const weights = {
    mmcss_scheduler: 9,
    kernel_timer: 9,
    power_plan: 9,
    memory_services: 9,
    usb_power: 7,
    gpu_msi: 7,
    ethernet_latency: 6,
    defender_exclusions: 6,
    user_gaming: 7,
    game_config: 7,
    nvidia_shadowplay: 9,
    baremetal_vbs: 15,
  };

  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (data.status[k]) score += w;
  }
  if (data.details.nvOverlayRunning) {
    score = Math.max(0, score - 10);
  }

  const bottlenecks = [];
  if (data.details.nvOverlayRunning) {
    bottlenecks.push({
      severity: 'HIGH',
      title: 'NVIDIA Overlay / ShadowPlay Active',
      detail: 'Always-on overlay hooking costs 20–60 FPS and hurts 1% lows. Disable in NVIDIA App → Settings → Features → NVIDIA Overlay OFF.',
    });
  }
  if (data.details.vbsStatus === 2) {
    bottlenecks.push({
      severity: 'HIGH',
      title: data.details.hvciRunning ? 'VBS + Memory Integrity (HVCI) Running' : 'VBS Hypervisor Still Active',
      detail: `Windows is running inside a virtualized kernel, adding 8–18% CPU overhead in ${profile.shortName}. ${profile.vbsNote}`,
    });
  }
  if (!data.status.mmcss_scheduler || !data.status.kernel_timer) {
    bottlenecks.push({
      severity: 'MED',
      title: 'Stock Windows Scheduler & Timer Settings',
      detail: 'Windows reserves 20% multimedia CPU headroom and uses variable dynamic tick timers. Enable Scheduler & Kernel tweaks.',
    });
  }
  if (!data.status.memory_services) {
    bottlenecks.push({
      severity: 'MED',
      title: 'Memory Compression / Background Services Active',
      detail: `SysMain (${data.details.sysMain}), DiagTrack (${data.details.diagTrack}), or RAM compression is burning CPU cycles.`,
    });
  }
  if (data.details.usbSavingCount > 0) {
    bottlenecks.push({
      severity: 'MED',
      title: `${data.details.usbSavingCount} USB/HID Devices Allow Power Saving`,
      detail: 'Windows can suspend USB root hubs, mice, and keyboards, causing high-polling micro-stutters.',
    });
  }
  if (data.details.nicEnabledCount > 0) {
    bottlenecks.push({
      severity: 'LOW',
      title: `${data.details.nicEnabledCount} Ethernet Power-Saving Features Enabled`,
      detail: 'EEE, Green Ethernet, or Interrupt Moderation adds packet jitter on your wired NIC.',
    });
  }
  if (!data.status.game_config && data.details.gameConfigNote) {
    bottlenecks.push({
      severity: 'MED',
      title: `Unoptimized ${profile.shortName} Config / Display Flags`,
      detail: data.details.gameConfigNote,
    });
  }
  if (data.hardware.ramSticks === 1) {
    bottlenecks.push({
      severity: 'HIGH',
      title: 'Single-Channel RAM Detected (1 Stick)',
      detail: 'Single-channel RAM cuts memory bandwidth in half and severely bottlenecks CPU-bound FPS. Add a matching second stick.',
    });
  }

  return { ...data, score, bottlenecks };
}

module.exports = { runSystemAudit };
