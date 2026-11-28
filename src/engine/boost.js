const { runPS, runPSJson } = require('./ps');
const { getGameProfile } = require('./games');

// Curated safe-to-close background clutter catalog.
// defaultCheck: true = checked by default; false = shown so user can opt in (comms, overlays, peripherals, dev tools).
// serviceName: optional Windows service to stop cleanly so SCM does not immediately respawn it.
const HOG_CATALOG = {
  // Browsers
  chrome: { label: 'Google Chrome', category: 'Browser', defaultCheck: true },
  msedge: { label: 'Microsoft Edge', category: 'Browser', defaultCheck: true },
  firefox: { label: 'Mozilla Firefox', category: 'Browser', defaultCheck: true },
  opera: { label: 'Opera', category: 'Browser', defaultCheck: true },
  opera_gx: { label: 'Opera GX', category: 'Browser', defaultCheck: true },
  brave: { label: 'Brave Browser', category: 'Browser', defaultCheck: true },
  vivaldi: { label: 'Vivaldi', category: 'Browser', defaultCheck: true },
  Arc: { label: 'Arc Browser', category: 'Browser', defaultCheck: true },

  // Game Launchers
  'Riot Client': { label: 'Riot Client UI', category: 'Launcher', defaultCheck: true },
  RiotClientUx: { label: 'Riot Client UI', category: 'Launcher', defaultCheck: true },
  RiotClientUxRender: { label: 'Riot Client Renderer', category: 'Launcher', defaultCheck: true, isChild: true },
  RiotClientServices: { label: 'Riot Client Services', category: 'Launcher', defaultCheck: true },
  EpicGamesLauncher: { label: 'Epic Games Launcher', category: 'Launcher', defaultCheck: true },
  EpicWebHelper: { label: 'Epic Web Helper', category: 'Launcher', defaultCheck: true, isChild: true },
  steam: { label: 'Steam', category: 'Launcher', defaultCheck: true },
  steamwebhelper: { label: 'Steam Web Helper', category: 'Launcher', defaultCheck: true, isChild: true },
  EADesktop: { label: 'EA App', category: 'Launcher', defaultCheck: true },
  EABackgroundService: { label: 'EA Background Service', category: 'Launcher', defaultCheck: true, serviceName: 'EABackgroundService' },
  upc: { label: 'Ubisoft Connect', category: 'Launcher', defaultCheck: true },
  UbisoftConnect: { label: 'Ubisoft Connect', category: 'Launcher', defaultCheck: true },
  'Battle.net': { label: 'Battle.net', category: 'Launcher', defaultCheck: true },
  GalaxyClient: { label: 'GOG Galaxy', category: 'Launcher', defaultCheck: true },
  XboxPcApp: { label: 'Xbox App', category: 'Launcher', defaultCheck: true },
  'Lunar Client': { label: 'Lunar Client', category: 'Launcher', defaultCheck: true },
  CurseForge: { label: 'CurseForge', category: 'Launcher', defaultCheck: true },

  // Overlays & Clip Recorders
  'NVIDIA Overlay': { label: 'NVIDIA Overlay', category: 'Overlay', defaultCheck: false, isOverlay: true },
  PresentMon_x64: { label: 'NVIDIA PresentMon', category: 'Overlay', defaultCheck: false, isOverlay: true },
  Overwolf: { label: 'Overwolf', category: 'Overlay', defaultCheck: false, isOverlay: true },
  Blitz: { label: 'Blitz.gg', category: 'Clipper', defaultCheck: true },
  Porofessor: { label: 'Porofessor', category: 'Clipper', defaultCheck: true },
  Medal: { label: 'Medal.tv', category: 'Clipper', defaultCheck: true },
  MedalEncoder: { label: 'Medal Encoder', category: 'Clipper', defaultCheck: true, isChild: true },
  Outplayed: { label: 'Outplayed', category: 'Clipper', defaultCheck: true },
  obs64: { label: 'OBS Studio', category: 'Clipper', defaultCheck: false },
  'Streamlabs Desktop': { label: 'Streamlabs', category: 'Clipper', defaultCheck: false },

  // Windows, Store & Background Utilities
  'WinStore.App': { label: 'Microsoft Store', category: 'Windows App', defaultCheck: true },
  Widgets: { label: 'Windows Widgets', category: 'Windows App', defaultCheck: true },
  WidgetService: { label: 'Windows Widget Service', category: 'Windows App', defaultCheck: true, isChild: true },
  PhoneExperienceHost: { label: 'Phone Link', category: 'Windows App', defaultCheck: true },
  CrossDeviceService: { label: 'Cross Device Service', category: 'Windows App', defaultCheck: true, isChild: true },
  CrossDeviceResume: { label: 'Cross Device Resume', category: 'Windows App', defaultCheck: true, isChild: true },
  OneDrive: { label: 'Microsoft OneDrive', category: 'Background', defaultCheck: true },
  SnippingTool: { label: 'Snipping Tool', category: 'Windows App', defaultCheck: true },
  OfficeClickToRun: { label: 'Microsoft Office Updater', category: 'Background', defaultCheck: true, serviceName: 'ClickToRunSvc' },
  wallpaper64: { label: 'Wallpaper Engine', category: 'GPU Hog', defaultCheck: true },
  wallpaper32: { label: 'Wallpaper Engine', category: 'GPU Hog', defaultCheck: true },

  // Media, Chat & Creative
  Spotify: { label: 'Spotify', category: 'Media', defaultCheck: true },
  Teams: { label: 'Microsoft Teams', category: 'Chat', defaultCheck: true },
  'ms-teams': { label: 'Microsoft Teams', category: 'Chat', defaultCheck: true },
  Slack: { label: 'Slack', category: 'Chat', defaultCheck: true },
  Zoom: { label: 'Zoom', category: 'Chat', defaultCheck: true },
  Discord: { label: 'Discord', category: 'Voice / Chat', defaultCheck: false },
  Telegram: { label: 'Telegram', category: 'Chat', defaultCheck: false },
  WhatsApp: { label: 'WhatsApp', category: 'Chat', defaultCheck: false },
  Notion: { label: 'Notion', category: 'App', defaultCheck: true },
  AdobeIPCBroker: { label: 'Adobe IPC Broker', category: 'Background', defaultCheck: true },
  CCXProcess: { label: 'Adobe Creative Cloud', category: 'Background', defaultCheck: true },
  'Creative Cloud': { label: 'Adobe Creative Cloud', category: 'Background', defaultCheck: true },
  DubbingAI: { label: 'DubbingAI', category: 'Audio App', defaultCheck: true },

  // Peripheral Suites & Tools (opt-in unchecked by default so DPI/RGB/terminals aren't closed unexpectedly)
  lghub: { label: 'Logitech G HUB', category: 'Peripheral', defaultCheck: false },
  lghub_agent: { label: 'Logitech G HUB Agent', category: 'Peripheral', defaultCheck: false, isChild: true },
  lghub_updater: { label: 'Logitech G HUB Updater', category: 'Peripheral', defaultCheck: true, serviceName: 'LGHUBUpdaterService' },
  'Razer Synapse 3': { label: 'Razer Synapse', category: 'Peripheral', defaultCheck: false },
  iCUE: { label: 'Corsair iCUE', category: 'Peripheral', defaultCheck: false },
  ArmouryCrate: { label: 'ASUS Armoury Crate', category: 'Peripheral', defaultCheck: false },
  SteelSeriesGG: { label: 'SteelSeries GG', category: 'Peripheral', defaultCheck: false },
  WindowsTerminal: { label: 'Windows Terminal', category: 'Tool', defaultCheck: false },
  Code: { label: 'VS Code', category: 'Tool', defaultCheck: false },
};

const HOG_NAMES = Object.keys(HOG_CATALOG);
const HELPER_CHILDREN = new Set(HOG_NAMES.filter((n) => HOG_CATALOG[n].isChild));

async function scanBackgroundHogs(gameId = 'valorant') {
  const profile = getGameProfile(gameId);
  const keepSet = new Set(profile.keepProcesses || []);
  const listStr = HOG_NAMES.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

  const script = `
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $valRunning = [bool](Get-Process -Name 'VALORANT','VALORANT-Win64-Shipping' -ErrorAction SilentlyContinue)
    $gamePids = @(Get-Process -Name 'VALORANT','VALORANT-Win64-Shipping','FortniteClient-Win64-Shipping','cs2','r5apex','r5apex_dx12','RainbowSix','RainbowSix_DX12' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $cimMap = @{}
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { $cimMap[[int]$_.ProcessId] = $_ }

    function Is-GameOwnedHelper($proc) {
      if ($proc.Name -ne 'EpicWebHelper') { return $false }
      $info = $cimMap[[int]$proc.Id]
      if (-not $info) { return $false }
      if ($info.ExecutablePath -and ($info.ExecutablePath -match 'VALORANT|Riot Games')) { return $true }
      $ppid = [int]$info.ParentProcessId
      if ($gamePids -contains $ppid) { return $true }
      $parentInfo = $cimMap[$ppid]
      if ($parentInfo -and ($gamePids -contains [int]$parentInfo.ParentProcessId)) { return $true }
      return $false
    }

    $names = @(${listStr})
    $found = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      ($names -contains $_.Name) -and
      (-not (($_.Name -eq 'RiotClientServices') -and $valRunning)) -and
      (-not (Is-GameOwnedHelper $_))
    } | Group-Object Name | ForEach-Object {
      $anyInaccessible = $false
      if (-not $isAdmin) {
        foreach ($p in $_.Group) {
          try { if (-not $p.Path) { $anyInaccessible = $true; break } } catch { $anyInaccessible = $true; break }
        }
      }
      [PSCustomObject]@{
        name = $_.Name
        count = $_.Count
        mb = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
        cpuSec = [math]::Round(($_.Group | Measure-Object CPU -Sum).Sum, 1)
        needsAdmin = $anyInaccessible
      }
    } | Sort-Object mb -Descending)
    $os = Get-CimInstance Win32_OperatingSystem
    [PSCustomObject]@{
      isAdmin = $isAdmin
      valRunning = $valRunning
      freeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
      totalRamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
      hogs = $found
    } | ConvertTo-Json -Depth 4 -Compress
  `;
  const res = await runPSJson(script, { timeoutMs: 15000 });
  const rawHogs = Array.isArray(res.hogs) ? res.hogs : (res.hogs ? [res.hogs] : []);
  res.hogs = rawHogs.map((h) => {
    const meta = HOG_CATALOG[h.name] || { label: h.name, category: 'Background', defaultCheck: true };
    const keepForGame =
      keepSet.has(h.name) ||
      (profile.id === 'valorant' && h.name === 'RiotClientServices');
    return {
      ...h,
      label: meta.label,
      category: meta.category,
      isOverlay: Boolean(meta.isOverlay),
      serviceName: meta.serviceName || null,
      needsAdmin: Boolean(h.needsAdmin || (!res.isAdmin && meta.serviceName)),
      keepForGame,
      defaultCheck: Boolean(meta.defaultCheck && !keepForGame && !meta.isOverlay),
    };
  });
  return res;
}

async function purgeBackgroundHogs(selectedNames) {
  const safeList = (selectedNames || []).filter((n) => HOG_NAMES.includes(n));
  if (safeList.length === 0) {
    return { closedCount: 0, freedMB: 0, stillRunning: [], needsAdmin: false };
  }

  const parents = safeList.filter((n) => !HELPER_CHILDREN.has(n));
  const children = safeList.filter((n) => HELPER_CHILDREN.has(n));
  const ordered = [...parents, ...children];
  const parentStr = parents.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const childStr = children.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const allStr = ordered.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

  // Map any service-backed hogs so Windows SCM stops them cleanly without auto-restarting
  const svcPairs = ordered
    .filter((n) => HOG_CATALOG[n]?.serviceName)
    .map((n) => `'${n.replace(/'/g, "''")}'='${HOG_CATALOG[n].serviceName}'`)
    .join('; ');

  const script = `
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $svcMap = @{ ${svcPairs} }
    $gamePids = @(Get-Process -Name 'VALORANT','VALORANT-Win64-Shipping','FortniteClient-Win64-Shipping','cs2','r5apex','r5apex_dx12','RainbowSix','RainbowSix_DX12' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $cimMap = @{}
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { $cimMap[[int]$_.ProcessId] = $_ }

    function Get-TargetProcs($name) {
      $all = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
      if ($name -ne 'EpicWebHelper') { return $all }
      return @($all | Where-Object {
        $info = $cimMap[[int]$_.Id]
        if (-not $info) { return $true }
        if ($info.ExecutablePath -and ($info.ExecutablePath -match 'VALORANT|Riot Games')) { return $false }
        $ppid = [int]$info.ParentProcessId
        if ($gamePids -contains $ppid) { return $false }
        $parentInfo = $cimMap[$ppid]
        if ($parentInfo -and ($gamePids -contains [int]$parentInfo.ParentProcessId)) { return $false }
        return $true
      })
    }

    $allTargets = @(${allStr})
    $parentTargets = @(${parentStr})
    $childTargets = @(${childStr})

    $beforeCount = 0
    $beforeMB = 0.0
    foreach ($t in $allTargets) {
      $ps = @(Get-TargetProcs $t)
      $beforeCount += $ps.Count
      if ($ps.Count -gt 0) {
        $beforeMB += ($ps | Measure-Object WorkingSet64 -Sum).Sum / 1MB
      }
    }

    function Kill-Target($name) {
      if ($svcMap.ContainsKey($name)) {
        Stop-Service -Name $svcMap[$name] -Force -ErrorAction SilentlyContinue
      }
      if ($name -eq 'RiotClientServices') {
        if (Get-Process -Name 'VALORANT','VALORANT-Win64-Shipping' -ErrorAction SilentlyContinue) { return }
        & taskkill.exe /F /IM "RiotClientServices.exe" 2>$null | Out-Null
      } elseif ($name -eq 'EpicWebHelper') {
        foreach ($p in @(Get-TargetProcs 'EpicWebHelper')) {
          & taskkill.exe /F /PID $p.Id 2>$null | Out-Null
          Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
        return
      } else {
        & taskkill.exe /F /T /IM "$name.exe" 2>$null | Out-Null
      }
      $rem = @(Get-TargetProcs $name)
      if ($rem.Count -gt 0) {
        $rem | Stop-Process -Force -ErrorAction SilentlyContinue
      }
    }

    foreach ($t in $parentTargets) { Kill-Target $t }
    if ($parentTargets.Count -gt 0 -and $childTargets.Count -gt 0) {
      Start-Sleep -Milliseconds 300
    }
    foreach ($t in $childTargets) { Kill-Target $t }

    Start-Sleep -Milliseconds 400

    $cimMap = @{}
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { $cimMap[[int]$_.ProcessId] = $_ }
    $afterCount = 0
    $afterMB = 0.0
    $still = @()
    foreach ($t in $allTargets) {
      $ps = @(Get-TargetProcs $t)
      if ($ps.Count -gt 0) {
        $afterCount += $ps.Count
        $afterMB += ($ps | Measure-Object WorkingSet64 -Sum).Sum / 1MB
        $still += $t
      }
    }

    $closed = [math]::Max(0, $beforeCount - $afterCount)
    $freed = [math]::Max(0.0, $beforeMB - $afterMB)
    [PSCustomObject]@{
      isAdmin = $isAdmin
      closedCount = $closed
      freedMB = [math]::Round($freed, 1)
      stillRunning = $still
      needsAdmin = ((-not $isAdmin) -and ($still.Count -gt 0))
    } | ConvertTo-Json -Depth 3 -Compress
  `;
  const res = await runPSJson(script, { timeoutMs: 20000 });
  res.stillRunning = Array.isArray(res.stillRunning)
    ? res.stillRunning
    : (res.stillRunning ? [res.stillRunning] : []);
  return res;
}

async function launchGame(gameId = 'valorant') {
  let script;
  switch (gameId) {
    case 'valorant':
      script = `
        $riot = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe'
        if (Test-Path $riot) {
          Start-Process -FilePath $riot -ArgumentList '--launch-product=valorant --launch-patchline=live'
          Write-Output 'LAUNCHED'
        } else {
          Write-Output 'NOT_FOUND'
        }
      `;
      break;
    case 'cs2':
      script = `Start-Process 'steam://rungameid/730'; Write-Output 'LAUNCHED'`;
      break;
    case 'fortnite':
      script = `Start-Process 'com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true'; Write-Output 'LAUNCHED'`;
      break;
    case 'apex':
      script = `Start-Process 'steam://rungameid/1172470'; Write-Output 'LAUNCHED'`;
      break;
    case 'r6':
      script = `Start-Process 'steam://rungameid/359550'; Write-Output 'LAUNCHED'`;
      break;
    default:
      return { stdout: 'UNSUPPORTED', stderr: '', code: 0 };
  }
  return runPS(script, { timeoutMs: 10000 });
}

module.exports = {
  scanBackgroundHogs,
  purgeBackgroundHogs,
  launchGame,
  launchValorant: () => launchGame('valorant'),
};
