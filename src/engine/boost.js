const { runPS, runPSJson } = require('./ps');
const { getGameProfile } = require('./games');

const HOG_NAMES = [
  'chrome',
  'msedge',
  'firefox',
  'opera',
  'brave',
  'Riot Client',
  'RiotClientUx',
  'RiotClientUxRender',
  'RiotClientServices',
  'EpicGamesLauncher',
  'EpicWebHelper',
  'SnippingTool',
  'CrossDeviceService',
  'CrossDeviceResume',
  'Lunar Client',
  'DubbingAI',
  'OneDrive',
  'Spotify',
  'Teams',
  'ms-teams',
  'NVIDIA Overlay',
  'PresentMon_x64',
  'Overwolf',
  'Blitz',
];

// Always terminate parent launchers before helper children so parents cannot respawn helpers
const HELPER_CHILDREN = new Set([
  'EpicWebHelper',
  'RiotClientUxRender',
  'CrossDeviceService',
  'CrossDeviceResume',
]);

async function scanBackgroundHogs(gameId = 'valorant') {
  const profile = getGameProfile(gameId);
  const keepSet = new Set(profile.keepProcesses || []);
  const listStr = HOG_NAMES.map((n) => `'${n}'`).join(',');
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
        isOverlay = ($_.Name -match 'NVIDIA Overlay|PresentMon|Overwolf')
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
  res.hogs = rawHogs.map((h) => ({
    ...h,
    keepForGame:
      keepSet.has(h.name) ||
      (profile.id === 'valorant' && h.name === 'RiotClientServices'),
  }));
  return res;
}

async function purgeBackgroundHogs(selectedNames) {
  const safeList = (selectedNames || []).filter((n) => HOG_NAMES.includes(n));
  if (safeList.length === 0) {
    return { closedCount: 0, freedMB: 0, stillRunning: [], needsAdmin: false };
  }

  // Sort parents before helper children (e.g. EpicGamesLauncher before EpicWebHelper)
  const parents = safeList.filter((n) => !HELPER_CHILDREN.has(n));
  const children = safeList.filter((n) => HELPER_CHILDREN.has(n));
  const ordered = [...parents, ...children];
  const parentStr = parents.map((n) => `'${n}'`).join(',');
  const childStr = children.map((n) => `'${n}'`).join(',');
  const allStr = ordered.map((n) => `'${n}'`).join(',');

  const script = `
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

    # Snapshot before
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
      # Safety guard: NEVER kill RiotClientServices if VALORANT is running (it is VALORANT's parent process!)
      if ($name -eq 'RiotClientServices') {
        if (Get-Process -Name 'VALORANT','VALORANT-Win64-Shipping' -ErrorAction SilentlyContinue) {
          return
        }
        & taskkill.exe /F /IM "RiotClientServices.exe" 2>$null | Out-Null
      } elseif ($name -eq 'EpicWebHelper') {
        # Kill only non-game EpicWebHelper PIDs so we never touch VALORANT's Unreal Engine CEF child
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

    Start-Sleep -Milliseconds 350

    # Refresh CIM map & verify which non-game targets actually exited vs survived
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
