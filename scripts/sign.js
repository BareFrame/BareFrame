const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Universal electron-builder Windows code-signing hook.
 *
 * Supports 3 modes automatically via environment variables:
 *   1. Azure Trusted Signing (Recommended — ~$9.99/mo, instant SmartScreen trust):
 *        AZURE_SIGNING_ENDPOINT   (e.g. https://eus.codesigning.azure.net/)
 *        AZURE_SIGNING_ACCOUNT    (Trusted Signing account name)
 *        AZURE_SIGNING_PROFILE    (Certificate profile name)
 *        AZURE_SIGNING_DLIB       (Optional path to Azure.CodeSigning.Dlib.dll)
 *        + AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET (or `az login`)
 *   2. USB Hardware Token / Windows Cert Store (EV/OV DigiCert, Sectigo, SSL.com):
 *        WIN_CERT_SHA1            (40-char SHA1 thumbprint in Windows cert store)
 *   3. PFX Certificate File:
 *        WIN_PFX_PATH             (Path to .pfx/.p12 file)
 *        WIN_PFX_PASSWORD         (Certificate password)
 *
 * If none of the above are configured, signing is skipped cleanly for local dev builds.
 */

function findSigntool() {
  if (process.env.SIGNTOOL_PATH && fs.existsSync(process.env.SIGNTOOL_PATH)) {
    return process.env.SIGNTOOL_PATH;
  }
  const kitsRoot = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (fs.existsSync(kitsRoot)) {
    const versions = fs
      .readdirSync(kitsRoot)
      .filter((d) => /^10\./.test(d))
      .sort()
      .reverse();
    for (const v of versions) {
      const candidate = path.join(kitsRoot, v, 'x64', 'signtool.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return 'signtool.exe';
}

exports.default = async function sign(configuration) {
  const filePath = configuration.path;
  if (!filePath || !fs.existsSync(filePath)) return;

  const {
    AZURE_SIGNING_ENDPOINT,
    AZURE_SIGNING_ACCOUNT,
    AZURE_SIGNING_PROFILE,
    AZURE_SIGNING_DLIB,
    WIN_CERT_SHA1,
    WIN_PFX_PATH,
    WIN_PFX_PASSWORD,
  } = process.env;

  // Mode 1: Microsoft Azure Trusted Signing
  if (AZURE_SIGNING_ENDPOINT && AZURE_SIGNING_ACCOUNT && AZURE_SIGNING_PROFILE) {
    const signtool = findSigntool();
    const dlib =
      AZURE_SIGNING_DLIB ||
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'Microsoft',
        'MicrosoftArtifactSigningClientTools',
        'Azure.CodeSigning.Dlib.dll'
      );

    if (!fs.existsSync(dlib)) {
      throw new Error(
        `Azure.CodeSigning.Dlib.dll not found at "${dlib}". Install Microsoft.Trusted.Signing.Client or set AZURE_SIGNING_DLIB.`
      );
    }

    const metaPath = path.join(os.tmpdir(), `ff-azure-sign-${process.pid}.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        Endpoint: AZURE_SIGNING_ENDPOINT,
        CodeSigningAccountName: AZURE_SIGNING_ACCOUNT,
        CertificateProfileName: AZURE_SIGNING_PROFILE,
      })
    );

    try {
      console.log(`  • [Azure Trusted Signing] Signing ${path.basename(filePath)}`);
      execFileSync(
        signtool,
        [
          'sign',
          '/v',
          '/fd', 'SHA256',
          '/tr', 'http://timestamp.acs.microsoft.com',
          '/td', 'SHA256',
          '/dlib', dlib,
          '/dmdf', metaPath,
          filePath,
        ],
        { stdio: 'inherit' }
      );
    } finally {
      try { fs.unlinkSync(metaPath); } catch {}
    }
    return;
  }

  // Mode 2: Hardware Token / Cert Store Thumbprint
  if (WIN_CERT_SHA1) {
    const signtool = findSigntool();
    console.log(`  • [Cert Store / Token] Signing ${path.basename(filePath)}`);
    execFileSync(
      signtool,
      [
        'sign',
        '/v',
        '/fd', 'SHA256',
        '/sha1', WIN_CERT_SHA1,
        '/tr', 'http://timestamp.digicert.com',
        '/td', 'SHA256',
        filePath,
      ],
      { stdio: 'inherit' }
    );
    return;
  }

  // Mode 3: Local PFX file
  if (WIN_PFX_PATH) {
    const signtool = findSigntool();
    console.log(`  • [PFX] Signing ${path.basename(filePath)}`);
    const args = [
      'sign',
      '/v',
      '/fd', 'SHA256',
      '/f', WIN_PFX_PATH,
      '/tr', 'http://timestamp.digicert.com',
      '/td', 'SHA256',
    ];
    if (WIN_PFX_PASSWORD) args.push('/p', WIN_PFX_PASSWORD);
    args.push(filePath);
    execFileSync(signtool, args, { stdio: 'inherit' });
    return;
  }

  // Dev build: no credentials configured — skip cleanly
  console.log(`  • [Sign Skipped] No signing credentials in env for ${path.basename(filePath)} (see SIGNING.md)`);
};
