const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let psSeq = 0;

/**
 * Runs a PowerShell script safely. Uses UTF-16LE Base64 -EncodedCommand for
 * short scripts and automatically falls back to a temporary UTF-8 BOM .ps1
 * file when the encoded command would approach Windows' 32,767-char CLI limit.
 */
function runPS(script, options = {}) {
  const { timeoutMs = 120000, onLine = null } = options;
  return new Promise((resolve, reject) => {
    const wrapped = `$ProgressPreference = 'SilentlyContinue'\n[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}`;
    const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');

    let tmpFile = null;
    let args;
    if (encoded.length > 20000) {
      tmpFile = path.join(os.tmpdir(), `bf-ps-${process.pid}-${Date.now()}-${++psSeq}.ps1`);
      fs.writeFileSync(tmpFile, '\uFEFF' + wrapped, 'utf8');
      args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile];
    } else {
      args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
    }

    const cleanupTmp = () => {
      if (tmpFile) {
        try { fs.unlinkSync(tmpFile); } catch {}
        tmpFile = null;
      }
    };

    const child = spawn('powershell.exe', args, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    let lineBuf = '';
    let finished = false;

    const timer = timeoutMs
      ? setTimeout(() => {
          if (!finished) {
            finished = true;
            try { child.kill(); } catch {}
            cleanupTmp();
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
        cleanupTmp();
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        if (timer) clearTimeout(timer);
        cleanupTmp();
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
