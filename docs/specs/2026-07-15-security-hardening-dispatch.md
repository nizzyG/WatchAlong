# Security Hardening — Fable Audit Findings

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

Fable conducted a full security review of the codebase. The architecture is sound — no critical vulnerabilities, every circumvention path blocked, credential handling excellent. The remaining gaps are all platform defaults inherited from Electron and yt-dlp that need to be explicitly closed. Every finding below has a specific fix.

---

## High — ship before release

### H1. Disable the spellchecker — it contacts a Google CDN

Electron enables the spellchecker by default. On Windows/Linux it downloads Hunspell dictionaries from a Google CDN the first time a user types in an editable field. WatchAlong has editable fields (session rename, URL inputs, login window). This is a background network request the user never initiated — directly contradicting the privacy promise that says "the only network requests are ones you trigger."

**Fix:** add `spellcheck: false` to both `secureRendererWebPreferences` in `rendererSecurityPolicy.ts` and `secureLoginWebPreferences` in `patreonLoginWindow.ts`. Confirm no `gvt1.com` or `dl.google.com` traffic occurs in a packaged build.

### H2. Deny-all permission handler for the Patreon login window

When no permission handler is registered, Electron grants permission requests by default. The Patreon login window hosts live remote content from patreon.com, accounts.google.com, facebook.com, and appleid.apple.com. A compromised script on any of those origins could be auto-granted camera, microphone, geolocation, or `clipboard-read`.

**Fix:** register a deny-all `setPermissionRequestHandler` and `setPermissionCheckHandler` on `session.defaultSession` at startup and on every `patreon-login-*` partition when created. If Patreon's login ever needs a specific permission, allowlist it explicitly.

---

## Medium — fix before or shortly after release

### M1. Firefox extraction writes the entire cookie jar to disk

yt-dlp's `--cookies-from-browser firefox` exports all Firefox cookies — banking, email, everything — not just Patreon's. The temp directory is private (0700 on POSIX), the file is 0600, and it's zeroed and deleted immediately. But the jar persists after a crash until the next launch, and it sits in `%TEMP%` where backup tools and indexers can see it.

**Fix:**
- Add a stale-temp sweep on `before-quit` as well as on launch (currently only on launch).
- Pre-create the cookie file with `0600` before yt-dlp runs, so creation-time permissions are never yt-dlp's default.
- Longer-term: extract only the `patreon.com` domain by reading `cookies.sqlite` directly or post-filtering immediately. Document this as a known limitation for v1.1 if the full fix is complex.

### M2. Child processes inherit full environment and yt-dlp config

Two related issues:

1. **yt-dlp config loading:** no invocation passes `--ignore-config`. yt-dlp loads user-level config files (`%APPDATA%\yt-dlp\config`, `~/.config/yt-dlp/config`) which can inject any option — including `--exec` (arbitrary command execution on download completion) and `--proxy` (silently routing traffic elsewhere, breaking the privacy story). A user with an existing yt-dlp config gets unpredictable behavior.

2. **Environment inheritance:** the bundled `node.exe` running patreon-dl inherits `NODE_OPTIONS`, `NODE_PATH`, and `NODE_REPL_*`, which can `--require` arbitrary code into the process that holds the session cookie.

**Fix:**
- Add `--ignore-config` (and `--no-plugin-dirs` where the bundled version supports it) to every yt-dlp spawn — downloads, cookie extraction, avatar retrieval, and version checks.
- Spawn all child processes with a sanitized copy of the environment: strip `NODE_OPTIONS`, `NODE_PATH`, `NODE_REPL_*`, `ELECTRON_RUN_AS_NODE`.

### M3. Dead `manual` session source is IPC-reachable

The `manual` Patreon session type (`{ type: 'manual', sessionId: string }`) is accepted by the IPC layer but never constructed by the UI (only tests use it). The string flows unvalidated into the patreon-dl config file as `cookie = "session_id=<value>"`. Newline stripping blocks injection, but it's an unused credential-format path.

**Fix:** remove the `manual` variant from the `PatreonSessionSource` union type and its handling code, or validate it against a strict charset (`/^[A-Za-z0-9%_-]+$/`) like the vault token validation does.

### M4. Release artifacts are unsigned with no checksums

Users have no way to verify the installer they downloaded is the one CI built. The release workflow uploads `.exe`/`.dmg` files with `CSC_IDENTITY_AUTO_DISCOVERY: false`.

**Fix:** generate and attach a `SHA256SUMS.txt` in the release job. Document verification in the README. Code signing/notarization when budget allows — for now, checksums are the honest minimum.

### M5. Tool binaries have no provenance verification

The wood textures get SHA-256 checksums in `CABINET_TEXTURE_PROVENANCE.md`. The executables — ffmpeg, yt-dlp, node — get versions and source links but no hashes, and CI performs no integrity check.

**Fix:** create a `TOOL_PROVENANCE.md` mirroring the texture document (upstream URL + SHA-256 per binary). Add a CI step that fails the build on hash mismatch.

---

## Informational — quick wins

### I1. PRIVACY.md network table missing the Firefox-extraction probe

Firefox one-click connect runs yt-dlp against `https://www.patreon.com/posts/0` to verify the cookie works, sending the user's Patreon cookies to Patreon as part of the probe. User-triggered and destination-appropriate, but the privacy table promises to be exhaustive. Add the row. Also test whether yt-dlp writes the cookie jar even on a failed/offline extraction — if so, the network touch can be dropped entirely.

### I2. Verify SECURITY.md revocation path

SECURITY.md says "Patreon → Settings → Connected apps → Sign out of all sessions." Patreon's session logout may have moved to Account/Security, not Connected apps (which is OAuth). Verify the click-path is current before release.

### I3. Add a global web-contents-created guard

Every window is individually hardened today, but a future window type could be missed. Add a global deny-by-default `setWindowOpenHandler` and `will-navigate` fallback on `app.on('web-contents-created')` as cheap insurance.

### I4. Refine "scrubs" wording in SECURITY.md

Overwrite-then-delete is not forensic erasure on SSDs (wear leveling). The current language is defensible. "Best-effort clearing" is bulletproof. Update the wording for precision.

---

## Priority

H1 and H2 are one-liners with no behavior change — disable a feature nobody asked for, register a deny-all handler. Do them first.

M2 is the most impactful Medium — `--ignore-config` and env sanitization affect real user behavior and the privacy story.

The rest are hardening that makes the architecture match its promises. Sol can handle all of them.
