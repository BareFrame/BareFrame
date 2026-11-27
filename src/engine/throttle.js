const { runPS } = require('./ps');

/**
 * Runs a 35-second sustained multi-core CPU clock test to catch
 * Intel/AMD PL1 power-limit or thermal throttling (past the 28s Tau window).
 */
async function runThrottleTest(onSample) {
  const script = `
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $baseMHz = [int]$cpu.MaxClockSpeed
    if ($baseMHz -lt 500) { $baseMHz = 2500 }
    $loadThreads = [math]::Min(6, [math]::Max(2, [int]$cpu.NumberOfCores))

    $jobs = 1..$loadThreads | ForEach-Object {
      Start-Job -ScriptBlock {
        $end = (Get-Date).AddSeconds(36)
        $x = 1.0001
        while ((Get-Date) -lt $end) { $x = [math]::Sqrt($x + 1.234567) }
      }
    }

    $marks = @(3, 8, 14, 20, 26, 30, 34)
    $prev = 0
    foreach ($sec in $marks) {
      Start-Sleep -Seconds ($sec - $prev)
      $prev = $sec
      $samples = (Get-Counter '\\Processor Information(*)\\% Processor Performance' -ErrorAction SilentlyContinue).CounterSamples |
        Where-Object { $_.InstanceName -match '^0,\\d+$' }
      $vals = $samples | ForEach-Object { [math]::Round(($_.CookedValue / 100.0) * $baseMHz, 0) } | Sort-Object -Descending
      $topCores = $vals | Select-Object -First $loadThreads
      $avgTop = [math]::Round(($topCores | Measure-Object -Average).Average, 0)
      $peak = ($topCores | Measure-Object -Maximum).Maximum
      $obj = [PSCustomObject]@{ sec = $sec; avgMHz = $avgTop; peakMHz = $peak; baseMHz = $baseMHz }
      Write-Output ("SAMPLE:" + ($obj | ConvertTo-Json -Compress))
    }

    $jobs | Wait-Job | Remove-Job
  `;

  const points = [];
  await runPS(script, {
    timeoutMs: 65000,
    onLine: (line) => {
      if (line.startsWith('SAMPLE:')) {
        try {
          const pt = JSON.parse(line.slice(7));
          points.push(pt);
          if (onSample) onSample(pt);
        } catch {}
      }
    },
  });

  if (points.length === 0) {
    throw new Error('Could not read Windows Processor Performance counters.');
  }

  const initialMHz = points[0].avgMHz;
  const maxMHz = Math.max(...points.map((p) => p.avgMHz));
  const sustainedPoints = points.filter((p) => p.sec >= 20);
  const minSustained = sustainedPoints.length ? Math.min(...sustainedPoints.map((p) => p.avgMHz)) : points[points.length - 1].avgMHz;
  const dropMHz = Math.max(0, maxMHz - minSustained);
  const dropPct = maxMHz > 0 ? Number(((dropMHz / maxMHz) * 100).toFixed(1)) : 0;

  let verdict = 'ROCK SOLID';
  let explanation = `P-cores held ${minSustained} MHz sustained (only -${dropMHz} MHz / -${dropPct}% variance). No PL1 power or thermal throttling detected!`;
  if (dropMHz >= 350 || dropPct >= 9) {
    verdict = 'THROTTLING DETECTED';
    explanation = `Clocks dropped from ${maxMHz} MHz down to ${minSustained} MHz (-${dropMHz} MHz / -${dropPct}%) under sustained load! Check CPU temps (thermal throttle) or unlock PL1/PL2 power limits in BIOS.`;
  } else if (dropMHz >= 180 || dropPct >= 4.5) {
    verdict = 'MILD THROTTLE';
    explanation = `Slight sustained dip (${maxMHz} → ${minSustained} MHz, -${dropPct}%). Raising BIOS PL1/PL2 power limits or tightening fan curve can lock clocks flat.`;
  }

  return { points, initialMHz, maxMHz, minSustained, dropMHz, dropPct, verdict, explanation };
}

function getBiosGuide(vendor = '', model = '') {
  const v = `${vendor} ${model}`.toUpperCase();
  if (v.includes('ASUS')) {
    return {
      brand: 'ASUS',
      key: 'Del / F2',
      steps: [
        'Press F7 to enter Advanced Mode → open the Ai Tweaker tab.',
        'Confirm Ai Overclock Tuner = XMP I (Intel) or EXPO I (AMD).',
        'Set ASUS Performance Enhancement 3.0 = Enabled (90°C limit) if present.',
        'Open Internal CPU Power Management → raise PL1 (Long Duration) to 125–148W and PL2 (Short Duration) to 148W+ (based on your cooler).',
        'Enable ReSize BAR (top-right bar) and press F6 (Q-Fan) → set CPU Fan to Turbo.',
        'Press F10 → Save & Exit.',
      ],
    };
  }
  if (v.includes('MSI') || v.includes('MICRO-STAR')) {
    return {
      brand: 'MSI',
      key: 'Del',
      steps: [
        'Press F7 for Advanced Mode → open OC (Overclocking).',
        'Enable Extreme Memory Profile (XMP / EXPO).',
        'Set CPU Cooler Tuning = Tower Air Cooler or Water Cooler (unlocks PL1/PL2 limits safely).',
        'Under Settings → Advanced → PCIe Subsystem Settings, enable Above 4G Decoding & Re-Size BAR Support.',
        'Open Hardware Monitor → set CPU Smart Fan curve slightly higher above 70°C.',
        'Press F10 → Save & Reboot.',
      ],
    };
  }
  if (v.includes('GIGABYTE') || v.includes('AORUS')) {
    return {
      brand: 'GIGABYTE',
      key: 'Del',
      steps: [
        'Press F2 for Advanced Mode → open Tweaker.',
        'Enable Extreme Memory Profile (X.M.P. / EXPO) → Profile 1.',
        'Open Advanced CPU Settings → Turbo Power Limits → set Package Power Limit 1 & 2 to 125–148W (or Enabled).',
        'Open Settings → IO Ports → enable Above 4G Decoding and Re-Size BAR Support.',
        'Press F10 → Save & Exit.',
      ],
    };
  }
  if (v.includes('ASROCK')) {
    return {
      brand: 'ASRock',
      key: 'F2 / Del',
      steps: [
        'Press F6 for Advanced Mode → open OC Tweaker.',
        'Open DRAM Configuration → Load XMP / EXPO Setting.',
        'Open CPU Configuration → raise Long Duration Power Limit (PL1) and Short Duration Power Limit (PL2).',
        'Under Advanced → PCI Configuration, enable Above 4G Decoding and C.A.M. (Clever Access Memory / ReBAR).',
        'Press F10 → Save Changes and Exit.',
      ],
    };
  }
  return {
    brand: vendor || 'Generic UEFI',
    key: 'Del / F2 / F10',
    steps: [
      'Enter Advanced Mode and enable XMP / EXPO Profile 1 for full rated RAM speed.',
      'Locate CPU Power Management and raise Long Duration Power Limit (PL1) & Short Duration (PL2) if your cooler keeps temps under 85°C.',
      'Enable Above 4G Decoding and Resizable BAR (ReBAR).',
      'Set CPU fan curve to Turbo / Performance and press F10 to Save & Exit.',
    ],
  };
}

async function rebootToBios() {
  return runPS(`shutdown /r /fw /t 8 /c "BareFrame: Rebooting straight into UEFI BIOS..."`);
}

module.exports = { runThrottleTest, getBiosGuide, rebootToBios };
