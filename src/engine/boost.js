const { runPS, runPSJson } = require('./ps');
const { getGameProfile } = require('./games');

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

async function scanBackgroundHogs(gameId = 'valorant') {
  const profile = getGameProfile(gameId);
  const keepSet = new Set(profile.keepProcesses || []);
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
  const res = await runPSJson(script, { timeoutMs: 15000 });
  const rawHogs = Array.isArray(res.hogs) ? res.hogs : (res.hogs ? [res.hogs] : []);
  res.hogs = rawHogs.map((h) => ({
    ...h,
    keepForGame: keepSet.has(h.name),
  }));
  return res;
}

async function purgeBackgroundHogs(selectedNames) {
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
