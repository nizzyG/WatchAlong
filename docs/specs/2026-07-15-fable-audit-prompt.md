# WatchAlong — Security Review and Hardening Assessment

You are conducting a comprehensive security review of WatchAlong, a free, open-source Electron desktop application that synchronizes locally-owned movie files with full-length reaction videos from creators the user supports on Patreon.

WatchAlong is privacy-first by design: no telemetry, no server, no account system. All media analysis runs on-device using bundled tools (yt-dlp, ffmpeg, ffprobe, patreon-dl). The app never sends user media to any remote service.

This is a defensive review — your goal is to identify weaknesses before they reach users and recommend specific hardening measures.

---

## Scope

### 1. Inter-process communication boundary

Review every IPC channel registered in `src/main/ipc/`, the preload bridge in `src/preload/index.ts`, and the `handleTrustedIpc` wrapper in `src/main/ipc/security.ts`. The trusted-sender check verifies renderer role, sender frame, and URL. Assess whether this validation can be circumvented — for example, by a renderer navigating to an unexpected URL, a frame injection, or a protocol handler that loads untrusted content.

For each IPC handler, verify that input arguments are validated before use and that no privileged operation is reachable from an untrusted renderer context.

### 2. Patreon credential handling

The app reads, stores, and uses the user's Patreon `session_id` cookie — a bearer token that authenticates as the user. Review:

- Firefox cookie extraction (via yt-dlp) in `src/main/services/cookieExtraction.ts`
- Encrypted storage via Electron `safeStorage` in `src/main/services/patreonSessionVault.ts`
- The in-app login window flow in `src/main/services/patreonLoginWindow.ts`
- Temporary file creation and cleanup during download in `src/main/services/patreonDownload.ts`

Identify any path where the token could be exposed: temp files that persist beyond their intended lifetime, log messages that capture token values, IPC channels that pass credentials to untrusted surfaces, or error messages that leak sensitive data.

### 3. Child process security

The app spawns yt-dlp, ffmpeg, ffprobe, and patreon-dl as child processes with user-supplied arguments (file paths, URLs, cookie values). Review argument construction in `src/main/services/downloadProcess.ts`, `src/main/services/youtubeDownload.ts`, and `src/main/services/patreonDownload.ts`. Assess whether user-controlled input — filenames, URLs, or cookie values — could influence process behavior beyond its intended scope.

Verify that all child processes are spawned with appropriate restrictions (`windowsHide`, no shell, limited environment).

### 4. Privacy verification

WatchAlong publicly claims: no telemetry, no analytics, no crash reporter, no server, no account, and media never leaves the device. Verify each claim against the source code. Identify any network request the application makes that is not explicitly initiated by the user (Patreon authentication, reaction download, or YouTube metadata retrieval). If any background update check, analytics call, or telemetry beacon exists, document it.

### 5. Documentation accuracy

Review `README.md`, `FAQ.md`, `DISCLAIMER.md`, `PRIVACY.md`, and `SECURITY.md` for accuracy against the implementation. Identify any statement that overclaims capability or security, any language that could be misread as encouraging unauthorized use, any privacy or security promise the code does not fully deliver, and any gap where a reasonable user might misunderstand their responsibilities.

### 6. Asset licensing verification

Verify that the bundled wood textures in `src/renderer/src/assets/wood/` match their documented CC0 sources in `CABINET_TEXTURE_PROVENANCE.md`. Confirm the SHA-256 checksums are accurate and that all bundled third-party assets have proper licensing documented in `THIRD_PARTY_NOTICES.md`.

---

## Reporting

For each finding, classify as:

- **Critical:** a vulnerability that could compromise user data or system security; must be fixed before release.
- **High:** a real weakness that should be addressed before release.
- **Medium:** a hardening opportunity that improves security posture.
- **Informational:** worth documenting; not blocking.

Include the specific file path, line numbers where applicable, a description of the weakness, and a recommended hardening measure.

Distinguish clearly between "this is broken and exploitable" and "this could be strengthened."

---

## Project context

WatchAlong is a pro-consumer, pro-creator, anti-corporate tool. It exists because a person who supports creators on Patreon and owns his media got tired of juggling two media players and nudging sync by hand every five minutes. The app takes no position on how users acquire their files. It takes a strong position on what it does with them: synchronizes them locally, with nothing leaving the device unless the user explicitly initiates it.

The privacy guarantee is not a settings toggle — it is a structural property of the architecture. The auto-sync engine runs entirely on-device because the matching algorithm was designed to work with one local file, not against a server-side database. The engine never applies a guess — when it isn't confident, it says so and steps aside.

Every recommendation you make should strengthen these principles. Identify vulnerabilities, not features to remove. Harden surfaces, not restrict capability. The goal is a more secure, more private, more trustworthy WatchAlong that is even more fully itself.

Maintain the ethical boundaries and deliberate artistic vision of WatchAlong.
