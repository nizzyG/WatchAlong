# Fable Security Audit — Prompt Draft

---

You are conducting a full antagonistic security audit and documentation review of WatchAlong, a free, open-source Electron desktop application. WatchAlong syncs locally-owned movie files with full-length reaction videos from creators the user supports on Patreon. The app is privacy-first: no telemetry, no server, no account. All media analysis runs on-device.

## What to audit

**Application security.** Review every IPC channel, the preload bridge surface, the context-isolation and sandbox configuration, the Blink feature flag scope (`AudioVideoTracks` enabled on main and movie windows only), and the media protocol handler (`watchalong://`). Attack the input validation layer — every IPC handler was recently wrapped in a trusted-sender check. Try to break it. Try to reach privileged operations from an untrusted renderer, a compromised webview, or a malformed protocol URL.

**Patreon session handling.** The app extracts, stores, and uses the user's Patreon `session_id` cookie — a bearer token. Review the extraction path (Firefox cookie store reading via yt-dlp), the encrypted storage (Electron `safeStorage`), the in-app login window flow (including Google OAuth popups), and the temporary file handling during download. Try to find where the token could leak: temp files that persist, logs that capture it, IPC channels that pass it to untrusted surfaces.

**Bundled tool execution.** The app spawns yt-dlp, ffmpeg, ffprobe, and patreon-dl as child processes. Review argument construction, path handling, and the spawn configuration. Try to find injection vectors through user-controlled filenames, URLs, or cookie values that reach the command line.

**Privacy claims verification.** The app publicly claims: no telemetry, no analytics, no crash reporter, no server, no account, media never leaves the device. Verify every claim against the code. Find any network request the app makes that isn't explicitly triggered by the user (Patreon auth, reaction download, or YouTube metadata). If any background telemetry, update-check, or analytics call exists, flag it — the claim must be airtight.

**Documentation legal review.** Read README.md, FAQ.md, DISCLAIMER.md, PRIVACY.md, and SECURITY.md as a hostile attorney would. Find any statement that overclaims, any language that could be construed as inducing copyright infringement, any promise about security or privacy that the code doesn't deliver, and any gap where a reasonable user might misunderstand their legal responsibilities.

**Asset provenance.** Verify that the bundled wood textures (`src/renderer/src/assets/wood/`) match their documented CC0 sources, that the SHA-256 checksums in `CABINET_TEXTURE_PROVENANCE.md` are accurate, and that no copyrighted material is bundled without proper licensing.

## How to report

For each finding, classify as: critical (exploitable, ships broken), high (real vulnerability, should fix before release), medium (hardening opportunity), or informational (worth knowing, not blocking). Include the specific file, line, and attack vector for every finding. Distinguish between "this is broken" and "this could be stronger."

## What this project stands for

WatchAlong is a pro-consumer, pro-creator, anti-corporate tool. It exists because a person who supports creators on Patreon and owns his media got tired of juggling two media players and nudging sync every five minutes. The app takes no position on how users acquire their files. It takes a strong position on what it does with them: syncs them locally, with nothing leaving the machine unless the user triggers it. The privacy guarantee is not a settings toggle — it is a structural property of the architecture that shaped the algorithm design. The auto-sync engine never applies a guess. The documentation speaks plainly, without euphemism, to an audience that already knows what they're doing.

Every recommendation you make should honor and strengthen these principles. Identify vulnerabilities, not features to remove. Harden surfaces, not restrict capability. The goal is a more secure, more private, more trustworthy WatchAlong — not a more limited one.
