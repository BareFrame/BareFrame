const { runPSJson } = require('./ps');

const GAME_PROFILES = {
  valorant: {
    id: 'valorant',
    name: 'VALORANT',
    shortName: 'VALORANT',
    engine: 'UE4 Â· DX11',
    antiCheat: 'Riot Vanguard',
    accent: 'red',
    executables: ['VALORANT-Win64-Shipping.exe'],
    defenderHint: 'Riot Games & VALORANT AppData',
    configTitle: 'VALORANT Display & Config',
    configSummary: 'Sets hidden sg.*Quality=0 and ImproveClarity=False while preserving resolution, sensitivity, and crosshairs.',
    tweakSummary: 'High process priority, Windows Security exclusions, display config & session statistics',
    launchLabel: 'Launch VALORANT',
    keepProcesses: [],
    vbsNote: 'Leaves TPM 2.0 & Secure Boot enabled for Vanguard. If your account receives VAN:RESTRICTION, restore VBS & Memory Integrity.',
    hasTelemetry: true,
  },
  cs2: {
    id: 'cs2',
    name: 'Counter-Strike 2',
    shortName: 'CS2',
    engine: 'Source 2 Â· DX11/Vulkan',
    antiCheat: 'VAC Â· FACEIT AC',
    accent: 'blue',
    executables: ['cs2.exe'],
    defenderHint: 'Steam CS2 install folder',
    configTitle: 'CS2 Fullscreen & DPI Scaling',
    configSummary: 'Disables Fullscreen Optimizations and enables High-DPI scaling override on cs2.exe without modifying your autoexec, resolution, or keybinds.',
    tweakSummary: 'High process priority on cs2.exe, Steam folder exclusions & fullscreen display flags',
    launchLabel: 'Launch CS2',
    keepProcesses: ['steam', 'steamwebhelper'],
    vbsNote: 'Compatible with VAC. If FACEIT Anti-Cheat requires Memory Integrity on your account, leave VBS enabled.',
    hasTelemetry: false,
  },
  fortnite: {
    id: 'fortnite',
    name: 'Fortnite',
    shortName: 'Fortnite',
    engine: 'UE5 Â· DX12 / Perf',
    antiCheat: 'EAC Â· BattlEye',
    accent: 'blue',
    executables: ['FortniteClient-Win64-Shipping.exe'],
    defenderHint: 'Epic Fortnite & FortniteGame AppData',
    configTitle: 'Fortnite Graphics & Input',
    configSummary: 'Backs up GameUserSettings.ini and sets bShowGrass=False, bMotionBlur=False, and bDisableMouseAcceleration=True while preserving resolution, binds, and rendering mode.',
    tweakSummary: 'High process priority, Epic folder exclusions, input config & keeps Epic Launcher active',
    launchLabel: 'Launch Fortnite',
    keepProcesses: ['EpicGamesLauncher'],
    vbsNote: 'Compatible with Easy Anti-Cheat & BattlEye. Keeps TPM 2.0 & Secure Boot ON.',
    hasTelemetry: false,
  },
  apex: {
    id: 'apex',
    name: 'Apex Legends',
    shortName: 'Apex Legends',
    engine: 'Source Â· DX11/DX12',
    antiCheat: 'Easy Anti-Cheat',
    accent: 'red',
    executables: ['r5apex.exe', 'r5apex_dx12.exe'],
    defenderHint: 'Apex Legends install & Respawn Saved Games',
    configTitle: 'Apex Legends Display & VSync',
    configSummary: 'Backs up videoconfig.txt, disables VSync and backbuffer queuing, and disables Fullscreen Optimizations on r5apex executables.',
    tweakSummary: 'High process priority on r5apex (DX11 & DX12), folder exclusions & display flags',
    launchLabel: 'Launch Apex Legends',
    keepProcesses: ['steam', 'steamwebhelper', 'EADesktop'],
    vbsNote: 'Compatible with Easy Anti-Cheat. Leaves TPM 2.0 & Secure Boot untouched.',
    hasTelemetry: false,
  },
  r6: {
    id: 'r6',
    name: 'Rainbow Six Siege',
    shortName: 'R6 Siege',
    engine: 'AnvilNext Â· DX11/DX12',
    antiCheat: 'BattlEye',
    accent: 'blue',
    executables: ['RainbowSix.exe', 'RainbowSix_DX12.exe'],
    defenderHint: 'Rainbow Six Siege install & GameSettings folder',
    configTitle: 'R6 Siege Display Settings',
    configSummary: 'Backs up GameSettings.ini and disables VSync, MotionBlur, LensEffects, and ZoomInDepthOfField while preserving resolution, aspect ratio, and sensitivity.',
    tweakSummary: 'High process priority on RainbowSix (DX11 & DX12), folder exclusions & display settings',
    launchLabel: 'Launch R6 Siege',
    keepProcesses: ['steam', 'steamwebhelper', 'upc', 'UbisoftConnect'],
    vbsNote: 'Compatible with BattlEye. Leaves TPM 2.0 & Secure Boot enabled.',
    hasTelemetry: false,
  },
  all: {
    id: 'all',
    name: 'All Games (Global)',
    shortName: 'All Games',
    engine: 'Windows 10 & 11',
    antiCheat: 'Vanguard Â· FACEIT Â· EAC Â· BE',
    accent: 'blue',
    executables: [
      'VALORANT-Win64-Shipping.exe',
      'cs2.exe',
      'FortniteClient-Win64-Shipping.exe',
      'r5apex.exe',
      'r5apex_dx12.exe',
      'RainbowSix.exe',
      'RainbowSix_DX12.exe',
    ],
    defenderHint: 'Detected game installation folders',
    configTitle: 'Global Game Profile',
    configSummary: 'Skips individual .ini file edits and applies Windows Game Mode, Game Bar Capture Off, and High process priority across supported titles.',
    tweakSummary: 'Full Windows, processor, power, USB, GPU & Ethernet configuration for all games',
    launchLabel: null,
    keepProcesses: [],
    vbsNote: 'Leaves TPM 2.0 & Secure Boot ON. Disables WSL2/Hyper-V until reverted.',
    hasTelemetry: true,
  },
};

const GAME_ORDER = ['valorant', 'cs2', 'fortnite', 'apex', 'r6', 'all'];

function getGameProfile(gameId) {
  return GAME_PROFILES[gameId] || GAME_PROFILES.valorant;
}

function getGameList() {
  return GAME_ORDER.map((id) => GAME_PROFILES[id]);
}

// Fast local detection of installed games (read-only, no admin required)
async function detectInstalledGames() {
  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $steamRoots = @('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\SteamLibrary', 'E:\\SteamLibrary')
    $vdf = 'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf'
    if (Test-Path $vdf) {
      $txt = Get-Content $vdf -Raw
      foreach ($m in [regex]::Matches($txt, '"path"\\s+"([^"]+)"')) {
        $p = $m.Groups[1].Value -replace '\\\\\\\\', '\\'
        if ($p -and ($steamRoots -notcontains $p)) { $steamRoots += $p }
      }
    }

    function Test-SteamGame($sub) {
      foreach ($r in $steamRoots) {
        if (Test-Path (Join-Path $r "steamapps\\common\\$sub")) { return $true }
      }
      return $false
    }

    $hasVal = (Test-Path "$env:LOCALAPPDATA\\VALORANT\\Saved\\Config") -or (Test-Path 'C:\\Riot Games\\VALORANT')
    $hasCs2 = Test-SteamGame 'Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe'
    $hasFn = (Test-Path "$env:LOCALAPPDATA\\FortniteGame\\Saved\\Config\\WindowsClient") -or (Test-Path 'C:\\Program Files\\Epic Games\\Fortnite')
    $hasApex = (Test-SteamGame 'Apex Legends') -or (Test-Path "$env:USERPROFILE\\Saved Games\\Respawn\\Apex")
    $hasR6 = (Test-SteamGame "Tom Clancy's Rainbow Six Siege") -or (Test-Path "$env:USERPROFILE\\Documents\\My Games\\Rainbow Six - Siege")

    [PSCustomObject]@{
      valorant = [bool]$hasVal
      cs2 = [bool]$hasCs2
      fortnite = [bool]$hasFn
      apex = [bool]$hasApex
      r6 = [bool]$hasR6
      all = $true
    } | ConvertTo-Json -Compress
  `;
  try {
    return await runPSJson(script, { timeoutMs: 8000 });
  } catch {
    return { valorant: false, cs2: false, fortnite: false, apex: false, r6: false, all: true };
  }
}

module.exports = {
  GAME_PROFILES,
  GAME_ORDER,
  getGameProfile,
  getGameList,
  detectInstalledGames,
};
