# Windows Code Signing Guide for FrameForge

To remove the Windows SmartScreen **"Windows protected your PC / Unknown Publisher"** warning for buyers, your `.exe` files must be signed with a **publicly trusted** Code Signing certificate issued by a Microsoft-trusted Certificate Authority (CA).

> **Why not a self-signed cert?** A self-signed certificate is only trusted on your own PC — every buyer's PC will still block it with SmartScreen.

---

## Best Certificate Options (2026)

| Option | Cost | SmartScreen Trust | Best For |
| :--- | :--- | :--- | :--- |
| **1. Microsoft Azure Trusted Signing** *(Recommended)* | **~$9.99/mo** | **Instant** (Microsoft-issued) | Solo devs & startups (US/CA/EU/UK) |
| **2. SignPath Foundation** | **$0 (Free)** | High | Open-source projects on GitHub |
| **3. SSL.com / Sectigo / DigiCert** | ~$250–$500/yr | Builds over downloads (EV = faster) | Commercial businesses outside Azure regions |

---

## Option 1: 5-Minute Setup with Microsoft Azure Trusted Signing

1. Sign in to **Azure Portal** (`portal.azure.com`) and create a **Trusted Signing Account** (`Basic` tier ~$9.99/mo).
2. Under **Identity Validations**, complete **Individual** or **Organization** identity verification (takes 1–3 days; requires government ID or LLC/business registration).
3. Under **Certificate Profiles**, create a **Public Trust** certificate profile (e.g., `frameforge-public-trust`).
4. Create a Microsoft Entra **App Registration** (Service Principal) and assign it the **Trusted Signing Certificate Profile Signer** role on your signing account.
5. Set the 6 environment variables (see `.env.example`) locally or in **GitHub Repository Secrets**:
   - `AZURE_SIGNING_ENDPOINT` (e.g., `https://eus.codesigning.azure.net/`)
   - `AZURE_SIGNING_ACCOUNT`
   - `AZURE_SIGNING_PROFILE`
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
6. Run:
   ```powershell
   npm run build
   ```
   Or push a git tag (`git tag v1.0.0 && git push origin v1.0.0`) — `.github/workflows/release.yml` will automatically build, sign both `.exe` installers via Azure Trusted Signing, and publish your GitHub Release!

---

## Verify a Signed Executable
After building with signing enabled, verify the signature locally:
```powershell
Get-AuthenticodeSignature "dist\FrameForge-Setup-1.0.0.exe" | Format-List Status, SignerCertificate, TimeStamperCertificate
```
`Status` should report **`Valid`**.
