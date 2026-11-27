const { runPS, runPSJson } = require('./ps');

const HOG_NAMES = [
  'chrome',
  'msedge',
  'firefox',
  'opera',
  'brave',
  'EpicWebHelper',
  'EpicGamesLauncher',
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

async function scanBackgroundHogs() {
  const listStr = HOG_NAMES.map((n) => `'${n}'`).join(',');
  const script = `
    $names = @(${listStr})
    $found = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.Name } | Group-Object Name | ForEach-Object {
      [PSCustomObject]@{
        name = $_.Name
        count = $_.Count
        mb = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
        cpuSec = [math]::Round(($_.Group | Measure-Object CPU -Sum).Sum, 1)
        isOverlay = ($_.Name -match 'NVIDIA Overlay|PresentMon|Overwolf')
      }
    } | Sort-Object mb -Descending)
    $os = Get-CimInstance Win32_OperatingSystem
    [PSCustomObject]@{
      freeRamGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
      totalRamGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
      hogs = $found
    } | ConvertTo-Json -Depth 4 -Compress
  `;
  return runPSJson(script, { timeoutMs: 15000 });
}

async function purgeBackgroundHogs(selectedNames) {
  // Never kill NVIDIA Overlay forcefully via kill-only without telling user, allow killing user-selected hogs safely
  const safeList = (selectedNames || []).filter((n) => HOG_NAMES.includes(n));
  if (safeList.length === 0) return { closedCount: 0, freedMB: 0 };
  const listStr = safeList.map((n) => `'${n}'`).join(',');
  const script = `
    $targets = @(${listStr})
    $freed = 0.0; $closed = 0
    foreach ($t in $targets) {
      $procs = @(Get-Process -Name $t -ErrorAction SilentlyContinue)
      if ($procs.Count -gt 0) {
        $freed += ($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        $closed += $procs.Count
      }
    }
    [PSCustomObject]@{ closedCount = $closed; freedMB = [math]::Round($freed, 1) } | ConvertTo-Json -Compress
  `;
  return runPSJson(script, { timeoutMs: 15000 });
}

async function launchValorant() {
  const script = `
    $riot = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe'
    if (Test-Path $riot) {
      Start-Process -FilePath $riot -ArgumentList '--launch-product=valorant --launch-patchline=live'
      Write-Output 'LAUNCHED'
    } else {
      Write-Output 'NOT_FOUND'
    }
  `;
  return runPS(script, { timeoutMs: 10000 });
}

module.exports = { scanBackgroundHogs, purgeBackgroundHogs, launchValorant };
