const { runPSJson } = require('./ps');

const GAME_PROFILES = {
  valorant: {
    id: 'valorant',
    name: 'VALORANT',
    shortName: 'VALORANT',
    engine: 'UE4 · DX11',
    antiCheat: 'Riot Vanguard',
    accent: 'red',
    executables: ['VALORANT-Win64-Shipping.exe'],
    defenderHint: 'Riot Games & VALORANT AppData',
    configTitle: 'Valorant .ini Scalability & Improve Clarity Fix',
    configSummary: 'Sets hidden sg.*Quality=0 & ImproveClarity=False while keeping res, sens & crosshairs.',
    tweakSummary: 'IFEO High on VALORANT, Riot Defender exclusions, .ini scalability fix & log analyzer',
    launchLabel: 'Launch VALORANT',
    keepProcesses: [],
    vbsNote: 'Leaves TPM 2.0 & Secure Boot ON for Vanguard. If your account receives VAN:RESTRICTION, revert Bare-Metal Mode.',
    hasTelemetry: true,
  },
  cs2: {
    id: 'cs2',
    name: 'Counter-Strike 2',
    shortName: 'CS2',
    engine: 'Source 2 · DX11/Vulkan',
    antiCheat: 'VAC · FACEIT AC',
    accent: 'blue',
    executables: ['cs2.exe'],
    defenderHint: 'Steam CS2 install folder',
    configTitle: 'CS2 Fullscreen Optimizations OFF & High-DPI Override',
    configSummary: 'Applies Windows AppCompat fullscreen pacing & DPI override on cs2.exe without touching your autoexec, res, or binds.',
    tweakSummary: 'IFEO High on cs2.exe, Steam CS2 Defender exclusion & fullscreen pacing flags',
    launchLabel: 'Launch CS2',
    keepProcesses: ['steam', 'steamwebhelper'],
    vbsNote: 'Safe with VAC. If you play FACEIT and FACEIT AC requests Memory Integrity on your account, uncheck Bare-Metal Mode.',
    hasTelemetry: false,
  },
  fortnite: {
    id: 'fortnite',
    name: 'Fortnite',
    shortName: 'Fortnite',
    engine: 'UE5 · DX12 / Perf',
    antiCheat: 'EAC · BattlEye',
    accent: 'blue',
    executables: ['FortniteClient-Win64-Shipping.exe'],
    defenderHint: 'Epic Fortnite & FortniteGame AppData',
    configTitle: 'Fortnite GameUserSettings Latency Cleanup',
    configSummary: 'Backs up GameUserSettings.ini and sets bShowGrass=False, bMotionBlur=False & bDisableMouseAcceleration=True (keeps res, binds & rendering mode).',
    tweakSummary: 'IFEO High on Fortnite, Epic Defender exclusions, .ini latency cleanup & keeps Epic Launcher alive',
    launchLabel: 'Launch Fortnite',
    keepProcesses: ['EpicGamesLauncher'],
    vbsNote: 'Compatible with Easy Anti-Cheat & BattlEye. Keeps TPM 2.0 & Secure Boot ON.',
    hasTelemetry: false,
  },
  apex: {
    id: 'apex',
    name: 'Apex Legends',
    shortName: 'Apex Legends',
    engine: 'Source · DX11/DX12',
    antiCheat: 'Easy Anti-Cheat',
    accent: 'red',
    executables: ['r5apex.exe', 'r5apex_dx12.exe'],
    defenderHint: 'Apex Legends install & Respawn Saved Games',
    configTitle: 'Apex Legends Fullscreen & videoconfig Low-Latency Pass',
    configSummary: 'Backs up videoconfig.txt, disables VSync/backbuffer lag & sets Fullscreen Optimizations OFF on r5apex executables (keeps FOV, res & sens).',
    tweakSummary: 'IFEO High on r5apex (DX11 & DX12), Defender exclusions & low-latency video flags',
    launchLabel: 'Launch Apex Legends',
    keepProcesses: ['steam', 'steamwebhelper', 'EADesktop'],
    vbsNote: 'Compatible with Easy Anti-Cheat. Leaves TPM 2.0 & Secure Boot untouched.',
    hasTelemetry: false,
  },
  r6: {
    id: 'r6',
    name: 'Rainbow Six Siege',
    shortName: 'R6 Siege',
    engine: 'AnvilNext · DX11/DX12',
    antiCheat: 'BattlEye',
    accent: 'blue',
    executables: ['RainbowSix.exe', 'RainbowSix_DX12.exe'],
    defenderHint: 'Rainbow Six Siege install & GameSettings folder',
    configTitle: 'R6 Siege GameSettings.ini Frame-Pacing Cleanup',
    configSummary: 'Backs up GameSettings.ini and turns off VSync, MotionBlur, LensEffects & ZoomInDepthOfField while keeping res, aspect ratio & sens.',
    tweakSummary: 'IFEO High on RainbowSix (DX11/DX12), Defender exclusions & GameSettings.ini pacing fix',
    launchLabel: 'Launch R6 Siege',
    keepProcesses: ['steam', 'steamwebhelper', 'upc', 'UbisoftConnect'],
    vbsNote: 'Compatible with BattlEye. Leaves TPM 2.0 & Secure Boot enabled.',
    hasTelemetry: false,
  },
  all: {
    id: 'all',
    name: 'All Competitive Games',
    shortName: 'All Games',
    engine: 'Universal Windows',
    antiCheat: 'Vanguard · FACEIT · EAC · BE',
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
    defenderHint: 'Detected competitive game folders',
    configTitle: 'Multi-Game Config & Fullscreen Pacing Pass',
    configSummary: 'Skips single-game .ini edits and applies clean Windows Game Mode, GameDVR OFF & IFEO High Priority across supported competitive executables.',
    tweakSummary: 'Full Windows, kernel, power, USB, GPU & Ethernet stack for every game',
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
