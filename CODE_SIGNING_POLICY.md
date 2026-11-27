# Code Signing Policy

**Status:** Pending Approval (Application Submitted)  
**Attribution:** Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

---

## 1. Overview
**BareFrame** uses automated code signing to guarantee binary integrity and prove that official Windows releases originate strictly from our public GitHub repository ([github.com/BareFrame/BareFrame](https://github.com/BareFrame/BareFrame)).

* **Signing Service:** [SignPath.io](https://signpath.io/)
* **Certificate Authority:** [SignPath Foundation](https://signpath.org/)
* **License:** MIT Open-Source License ([LICENSE](./LICENSE))

---

## 2. Signing Scope
Only official, tagged stable releases built exclusively on GitHub-hosted CI runners (`windows-latest`) are eligible for code signing.

* **Signed Artifacts:**
  * `BareFrame-Setup.exe` (Windows NSIS Installer)
  * `BareFrame-Portable.exe` (Windows Single-File Portable Executable)
* **Exclusions:** Pull request builds, local developer builds, nightly/experimental builds, and source archives are never signed with production keys.
* **No Local Signing:** No maintainer or contributor signs production binaries on a local machine. All production signing keys remain isolated inside SignPath's Hardware Security Module (HSM).

---

## 3. Team Roles & Responsibilities
* **Maintainer / Committer / Approver:** `makafk34-hash` (Organization Owner, `BareFrame`)
* Multi-factor authentication (MFA) is enforced on GitHub and SignPath accounts with repository administration or signing approval privileges.

---

## 4. Build & Release Process
1. All source code changes are committed publicly to `https://github.com/BareFrame/BareFrame`.
2. Pushing a semantic version tag (`v*`) triggers `.github/workflows/release.yml` on GitHub-hosted `windows-latest` runners.
3. The workflow installs dependencies, packages the unsigned `BareFrame-Setup.exe` and `BareFrame-Portable.exe` artifacts, and uploads them as GitHub Actions workflow artifacts.
4. The workflow submits the GitHub artifact ID to SignPath.io via `signpath/github-action-submit-signing-request`.
5. SignPath verifies build origin metadata against this repository and workflow, signs the approved artifacts with an RFC 3161 timestamp, and returns the signed executables to be published directly to GitHub Releases.

---

## 5. Security & Incident Response
If a maintainer account, repository workflow, or signed binary is ever suspected of compromise:
1. Automated release signing will be halted immediately.
2. Maintainers will investigate the incident and promptly notify SignPath Foundation.
3. Affected certificates or signatures will be revoked through SignPath Foundation if necessary.

---

## 6. Privacy Policy
**BareFrame does not collect, store, or transmit any personal data, hardware identifiers, or usage telemetry to any server.**

All hardware audits, system optimizations, backups, System Restore Points, CPU clock tests, and local Valorant log analyses run **100% locally** on the user's machine. The application makes only two optional, read-only network interactions:
1. Checking `https://api.github.com/repos/BareFrame/BareFrame/releases/latest` on startup (or when clicking *Check for Updates*) to notify the user if a newer GitHub Release exists.
2. Opening the user's web browser only when the user explicitly clicks a GitHub or Ko-fi link.
