const { spawn } = require('child_process');

/**
 * Runs a PowerShell script safely using UTF-16LE Base64 -EncodedCommand
 * (eliminates quoting/escaping bugs across Windows shells).
 */
function runPS(script, options = {}) {
  const { timeoutMs = 120000, onLine = null } = options;
  return new Promise((resolve, reject) => {
    const wrapped = `$ProgressPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}`;
    const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true }
    );

    let stdout = '';
    let stderr = '';
    let lineBuf = '';
    let finished = false;

    const timer = timeoutMs
      ? setTimeout(() => {
          if (!finished) {
            finished = true;
            try { child.kill(); } catch {}
            reject(new Error(`PowerShell timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs)
      : null;

    child.stdout.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      stdout += str;
      if (onLine) {
        lineBuf += str;
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop();
        for (const l of lines) {
          if (l.trim()) onLine(l);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (!finished) {
        finished = true;
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        if (timer) clearTimeout(timer);
        if (onLine && lineBuf.trim()) onLine(lineBuf);
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

async function runPSJson(script, options = {}) {
  const res = await runPS(script, options);
  const text = res.stdout;
  const start = text.indexOf('{');
  const arrStart = text.indexOf('[');
  let jsonStart = -1;
  if (start >= 0 && arrStart >= 0) jsonStart = Math.min(start, arrStart);
  else jsonStart = Math.max(start, arrStart);

  if (jsonStart < 0) {
    throw new Error(`No JSON returned from PowerShell. stdout=${text.slice(0, 300)} stderr=${res.stderr.slice(0, 300)}`);
  }
  return JSON.parse(text.slice(jsonStart));
}

module.exports = { runPS, runPSJson };
