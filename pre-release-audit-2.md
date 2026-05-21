# WatchAlong Pre-release Audit 2

Date: 2026-05-21  
Auditor: Codex  
Scope: README promise review, static code audit, package/build audit, dependency audit, bundled-tool smoke checks, and renderer UX smoke tests. No source code was changed for this audit.

## Executive verdict

WatchAlong is close, and several high-risk items from the prior audit appear to be fixed. The app now typechecks, the full test suite passes, the production dependency audit is clean, the core local UX renders cleanly at the checked desktop and compact sizes, and the previous media range, Patreon login hardening, detached-window command timeout, offscreen-window bounds, attribution, and macOS executable-bit problems are addressed.

I would not cut the public release from this tree yet. The remaining concerns are not cosmetic. The Windows installer build fails in the audited environment, the unpacked Windows app is about 1.64 GB because every platform's toolchain and the full Patreon dependency tree are copied into every package, Patreon authentication cookies are passed to a child process on the command line and kept in memory after success, and at least one promised workflow can keep playback running behind the import wizard when the movie is popped out.

## README promise check

The README promises a local-first watchalong app with no accounts, no cloud backend, bundled tools, local/YouTube/Patreon reactions, sync-perfect playback, pop-out/PiP/subtitles, library management, and an 800x600 import wizard.

| Promise area | Audit result |
| --- | --- |
| Local app, no telemetry/cloud | No telemetry or backend calls were found in the app code. Network use is limited to user-requested YouTube/Patreon/media fetch flows and external links. |
| Bundled tools | Tools are present and smoke-tested on Windows, but packaging currently copies all platform tools into every build and the Patreon CLI smoke behavior is suspicious. |
| Local media imports | The renderer and tests support this path. README wording still over-promises broad movie-file support compared with Electron/browser codec limits. |
| YouTube imports | The code paths and yt-dlp tool are present. I smoke-tested the bundled binary version, not a live YouTube download. |
| Patreon imports | The login flow is much better hardened than before. Cookie handling and tool readiness still need release attention. I did not authenticate with a real Patreon account. |
| Sync-perfect playback | The core sync code and source-rate correction are present, with tests around important pieces. One modal/lifecycle edge case remains when using the popped-out movie window. |
| Library management | Browse/rename/delete flows are implemented in the main renderer and local storage/store layer. |
| 800x600 wizard | The wizard renders within 800x600. Expanded Patreon controls create an internal scroll region, but the footer remains reachable. |
| PiP/pop-out/subtitles/command panel | Features are present. PiP has a keyboard visibility issue, and the movie pop-out titlebar has a misleading "Close" control. |

## Verification run

Commands and checks completed:

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 16 test files and 113 tests. One React `act(...)` warning remains in a wizard test.
- `npm.cmd run build`: passed.
- `npm.cmd run dist`: failed while electron-builder was packaging the Windows installer.
- `npm.cmd audit --omit=dev`: passed with 0 production vulnerabilities.
- `npm.cmd audit`: failed with 16 dev/build-chain vulnerabilities: 2 low, 5 moderate, 9 high.
- `npm.cmd audit --prefix resources/tools/patreon-dl`: passed with 0 vulnerabilities.
- Bundled tool smoke checks:
  - `resources\tools\yt-dlp\yt-dlp.exe --version`: `2026.03.17`.
  - `resources\tools\ffmpeg\ffmpeg.exe -version`: `8.1.1-full_build-www.gyan.dev`.
  - `resources\tools\ffprobe.exe -version`: `8.1.1-full_build-www.gyan.dev`.
  - `resources\tools\node\node.exe --version`: `v24.15.0`.
  - `npm.cmd ls patreon-dl --prefix resources/tools/patreon-dl`: `patreon-dl@3.9.0`.
  - Direct Patreon CLI smoke printed `patreon-dl v3.9.0 Patreon Downloader` and then exited non-zero with `Error processing options: Unknown command-line option '0'`.
- Renderer UX smoke:
  - Loaded the built renderer through a temporary local harness with mocked `window.watchAlong`.
  - Checked desktop viewport 1280x720: main chrome, PiP, player controls, timeline, and library list rendered without overlap.
  - Checked compact desktop viewport 960x560: no horizontal body overflow, control row remained usable, secondary control buttons collapsed only in the control row.
  - Checked command panel at 960x560: panel opened cleanly and buttons were visible.
  - Checked wizard at 800x600: movie and reaction steps fit the window; Patreon-expanded state remains usable through internal scrolling.

## Blocking and high-priority findings

### P1 - `npm run dist` does not complete the Windows installer build in the audited environment

**Where:** `package.json` build scripts and electron-builder packaging output.

**Evidence:** `npm.cmd run dist` successfully ran `npm ci --prefix resources/tools/patreon-dl`, built the renderer/main/preload bundles, and produced `release/win-unpacked`. It then failed while extracting `winCodeSign-2.6.0.7z`:

```text
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

The failing paths were OpenSSL symlinks inside electron-builder's cached macOS signing utility. The build log also noted that no signing information was found and that the default Electron icon is used.

**Why this matters:** A public release needs a repeatable release command. This may be an environment privilege problem rather than app logic, but from the perspective of the release gate, the documented build did not create the installer in a normal non-elevated Windows shell.

**Recommendation:** Add a CI release job or documented local release shell that has the required symlink privilege, then verify `npm run dist` produces the expected installer artifact from a clean checkout. If Windows local releases are supported, document the exact privilege requirement in `BUILDING.md` next to the command, not just as tribal knowledge.

### P1 - Packaged Windows app is about 1.64 GB because every platform toolchain is copied

**Where:** `package.json` `build.extraResources` copies `resources/tools` wholesale.

**Evidence:** The failed `dist` run still produced `release/win-unpacked`. Its size was `1,640,459,208` bytes. The copied tools alone account for most of it:

| Directory | Bytes |
| --- | ---: |
| `release/win-unpacked/resources/tools/ffmpeg` | 580,286,456 |
| `release/win-unpacked/resources/tools/node` | 335,162,584 |
| `release/win-unpacked/resources/tools/patreon-dl` | 276,751,329 |
| `release/win-unpacked/resources/tools/yt-dlp` | 55,211,733 |

The source tree includes Windows and macOS binaries under the same `resources/tools` root, and `extraResources` has no platform filter. A Windows user receives macOS binaries, and a macOS user is likely to receive Windows binaries.

**Why this matters:** This directly disturbs the public release UX: oversized downloads, slower installs, more antivirus scanning, slower first launch if extracted, and unnecessary disk usage. It also increases the surface area for attribution, license, and vulnerability review.

**Recommendation:** Split bundled tools by platform in electron-builder config, for example with platform-specific `extraResources` entries or a prepack step that stages only the current target's tool files. Also prune `resources/tools/patreon-dl/node_modules` to production dependencies only if that tree is intentionally vendored.

### P1 - Patreon cookies are exposed on the child-process command line and retained in memory

**Where:** `src/main/mediaServices.ts`.

**Evidence:** The Patreon download path appends `--cookie` and the raw cookie string to the `patreon-dl` argument array before spawning the process. The cookie is also stored in the `completedCookies` map and later reused by `saveLastPatreonSession`, with no observed deletion after success.

Relevant locations from inspection:

- `src/main/mediaServices.ts:354` keeps completed cookies in memory.
- `src/main/mediaServices.ts:383-386` saves the last Patreon session from that memory map.
- `src/main/mediaServices.ts:459` appends `--cookie` and the raw cookie value.
- `src/main/mediaServices.ts:466` spawns the Patreon downloader with those args.
- `src/main/mediaServices.ts:535` records the cookie after completion.

**Why this matters:** Command-line arguments are visible to local process inspection tools while the child process is running. This conflicts with the README's local/privacy-forward posture even though no cloud service is involved. Keeping the cookie in memory after completion also extends the lifetime of sensitive data beyond the immediate download.

**Recommendation:** Prefer passing the cookie through stdin, an inherited pipe, or a temporary file with restrictive permissions if the CLI supports it. If a temporary file is required, delete it immediately after spawn completion. Delete map entries after save/cancel/failure paths and avoid retaining the cookie longer than needed.

## Medium-priority findings

### P2 - Patreon downloader readiness check can report healthy when the CLI invocation is not healthy

**Where:** `src/main/mediaServices.ts:232-264`.

**Evidence:** `checkPatreonDl` verifies the configured CLI path, Node executable, dist directory, and package metadata. It does not execute the bundled CLI. A direct smoke command against the audited tree:

```text
resources\tools\node\node.exe resources\tools\patreon-dl\node_modules\patreon-dl\bin\patreon-dl.js --version
```

printed the expected version and then exited with:

```text
Error processing options: Unknown command-line option '0'
```

**Why this matters:** The UI can tell users the Patreon tool is ready even if the exact bundled invocation has a runtime argument/parsing issue. Because Patreon imports are one of the README's headline features, the readiness check should prove the CLI can actually execute in the way the app will call it.

**Recommendation:** Add a startup or diagnostic smoke command that executes the bundled CLI through the same Node path and validates a zero exit status for a harmless command. If `--version` is broken upstream, choose another deterministic command or patch/wrap the invocation.

### P2 - Import wizard does not pause playback when the movie is popped out

**Where:** `src/renderer/src/App.tsx`.

**Evidence:** `handleWizardLifecycle` only records a pause-on-open state when `!movieWindowActive && canPlay && isPlaying` (`src/renderer/src/App.tsx:595-603`). `openImportWizard` opens the wizard without first pausing playback (`src/renderer/src/App.tsx:916-919`). The completed import path closes the detached movie window later (`src/renderer/src/App.tsx:616-621`), but the in-progress wizard flow can leave popped-out playback running behind a focused import modal/window.

**Why this matters:** This is a UX disturbance in the exact "seamless watchalong" area the README emphasizes. Users can start an import operation and still have movie audio/video continuing in another window, which is surprising and can make offset selection harder.

**Recommendation:** Treat wizard-open as a playback-interrupting modal state regardless of whether the movie is inline or popped out. Preserve whether playback was active, pause all movie surfaces, and restore only when the wizard closes without replacing the session.

### P2 - Main local renderer windows run with `sandbox: false`

**Where:** `src/main/index.ts`.

**Evidence:** The main window, import wizard window, and movie window are created with `sandbox: false`:

- `src/main/index.ts:98-102`
- `src/main/index.ts:150-154`
- `src/main/index.ts:331-335`

The Patreon login window is now sandboxed (`src/main/index.ts:807-811`), which is a good fix from the prior audit.

**Why this matters:** The app handles local file paths, remote media metadata, subtitles, and downloaded media. Keeping local renderers unsandboxed increases the impact of any renderer bug or unexpected content injection path. This is not a direct exploit finding, but it is an unnecessary public-release hardening gap.

**Recommendation:** Move the local windows toward `sandbox: true` while preserving the existing preload API boundary. If any current renderer dependency requires unsandboxed behavior, document that dependency and isolate it to the smallest window/surface possible.

### P2 - README over-promises broad movie-file support compared with Electron codec limits

**Where:** `README.md`, `src/renderer/src/App.tsx`.

**Evidence:** The README repeatedly describes watching "movie files" and "your own media" in broad terms. The app's runtime error copy is more accurate: unsupported movie files should be converted to `MP4 or WebM with browser-supported codecs` (`src/renderer/src/App.tsx:1388-1391`). The importer accepts common file containers such as MKV/AVI, but playback is still through Chromium/Electron media support.

**Why this matters:** Public users will reasonably expect common downloaded/ripped movie containers to work if the README says "movie files" without a codec caveat. A failed first import looks like a broken app even when the underlying limitation is Chromium codec support.

**Recommendation:** Add a visible README caveat near the first "movie files" claim and in the import section: local movie playback requires an Electron-supported container/codec, with MP4/H.264/AAC and WebM as recommended formats. If broader support is intended, add a transcode/remux flow or a player backend that supports those formats.

## UX polish and lower-priority findings

### P3 - PiP titlebar and resize controls are hover-only, which makes keyboard focus invisible

**Where:** `src/renderer/src/styles.css:694-697`.

**Evidence:** CSS hides `.pip-titlebar` and `.pip-resize` under `.pip:not(:hover)`. I did not find a matching `.pip:focus-within` override.

**Why this matters:** Keyboard users can tab into controls that are visually hidden, and touch/pen users do not have reliable hover. The main UI is otherwise polished enough that this stands out as an avoidable accessibility/UX snag.

**Recommendation:** Keep hover reveal, but also reveal controls for `:focus-within`, active drag/resize states, and coarse pointer devices.

### P3 - Movie pop-out titlebar "Close" button actually pops the movie back in

**Where:** `src/renderer/src/MovieWindowApp.tsx:119-133`.

**Evidence:** The pop-in button and the titlebar button both call `requestMovieWindowPopIn()`. The titlebar button is labelled `Close` and uses `aria-label="Close movie window"`.

**Why this matters:** This is small, but it violates user expectation. "Close" normally dismisses a window; here it changes layout state by returning the movie to the main window.

**Recommendation:** Rename the title/aria label to "Pop in" or implement a true close action if that is the intended behavior.

### P3 - Patreon "save session" toggle can stay checked when secure storage is unavailable

**Where:** `src/renderer/src/components/SmartReactionInput.tsx:421-425`, `src/main/mediaServices.ts:324-330`.

**Evidence:** The renderer sets the toggle state before awaiting `saveLastPatreonSession`. In the main process, `PatreonSessionVault.save()` returns without saving if `safeStorage.isEncryptionAvailable()` is false. The UI can then show secure storage is unavailable while the toggle remains checked.

**Why this matters:** This creates a false sense that a Patreon login session will be remembered. The next import may ask the user to log in again even though the toggle appeared enabled.

**Recommendation:** Make `saveLastPatreonSession` return a success/failure result and only check the toggle after success. If encryption is unavailable, force the toggle off and keep the warning visible.

### P3 - Tests pass, but one React `act(...)` warning remains

**Where:** `src/renderer/src/__tests__/WizardApp.test.tsx`, warning points to `SmartReactionInput`.

**Evidence:** `npm.cmd test` passed all tests, but logged React warnings for `WizardApp.test.tsx > resets the reaction when the selected movie changes`.

**Why this matters:** Passing tests with act warnings can mask real asynchronous state timing problems. It also makes release-test output noisier, which makes future warnings easier to miss.

**Recommendation:** Wrap the state-changing interaction or async settling in `act(...)`/Testing Library's async utilities so the test suite is warning-clean.

### P3 - Public-release placeholders remain

**Where:** `src/renderer/src/App.tsx:95`, `README.md`, `BUILDING.md`, electron-builder output.

**Evidence:** `DONATION_URL` is still `null`, the README has a placeholder Ko-fi note, and the packaging log reports the default Electron icon is used. The build also reports no signing information.

**Why this matters:** These do not break app behavior, but they are visible public-release signals. A default icon, placeholder support link, and unsigned build can make the release feel unfinished.

**Recommendation:** Set the real donation/support URL or remove the UI path, add final app icons, and publish a clear signing/notarization policy for each platform.

### P3 - `yt-dlp.exe` is tracked directly instead of through Git LFS

**Where:** `.gitattributes`, `resources/tools/yt-dlp/yt-dlp.exe`.

**Evidence:** `git ls-files --stage` shows `resources/tools/yt-dlp/yt-dlp.exe` as a normal tracked blob. `git check-attr` shows LFS configured for `yt-dlp_macos`, but not for the Windows `.exe`.

**Why this matters:** This is repository hygiene rather than runtime behavior. Large binary churn in Git history makes future clones and updates heavier.

**Recommendation:** Track large tool binaries consistently through Git LFS, or move tool acquisition to a reproducible release/prepack step.

## Items that look fixed or solid

- `src/shared/mediaRange.ts` now handles suffix byte ranges correctly, and there are tests covering the behavior.
- The Patreon login window is sandboxed, limits navigation to Patreon origins, and sends non-Patreon popups/links externally.
- Detached movie command tracking has a timeout instead of waiting forever.
- Detached movie window bounds are clamped through `ensureVisibleWindowBounds`.
- The compact control-row behavior is scoped to `.control-row .secondary-button`, so the earlier blank-button regression did not reproduce.
- `ATTRIBUTION.md` exists and is included in packaged resources.
- macOS tool binaries are tracked through LFS and have executable file modes.
- `package.json` now runs `npm run postinstall` before packaging so `resources/tools/patreon-dl` dependencies are installed for release builds.
- Production `npm audit --omit=dev` is clean.
- `resources/tools/patreon-dl` has a clean audit in its own dependency tree.
- The main renderer, command panel, and wizard all rendered without horizontal overflow in the checked viewports.

## Dependency and release-chain notes

The production dependency audit is clean, which is the result that matters most for shipped runtime code. The full audit still reports 16 vulnerabilities in dev/build tooling. The notable chains are:

- `@tootallnate/once <3.0.1` through electron-builder dependencies.
- `tar <=7.5.10` through electron-builder dependencies.
- `esbuild <=0.24.2` through Vite/Vitest dev server dependencies.

This does not mean the shipped app has those vulnerabilities in production code, but it does mean the build toolchain should be updated or accepted explicitly before release. `npm outdated` also shows major available updates for Vite, Vitest, React, Testing Library, and electron-builder. Electron itself is installed as `electron@42.2.0` and was not flagged by `npm outdated` in this audit.

## Recommended release gate

I would use this checklist before calling the release public-ready:

1. Produce a clean signed/notarized installer from CI or a documented privileged release environment.
2. Split `resources/tools` packaging by target platform and confirm the installed app size is intentional.
3. Remove raw Patreon cookie values from process arguments and clean up retained cookie memory after each flow.
4. Add a real Patreon CLI readiness smoke check or fix the current non-zero `--version` behavior.
5. Pause all playback surfaces when the import wizard opens, including the popped-out movie window.
6. Either sandbox the local renderer windows or document why each unsandboxed window is still required.
7. Clarify supported local movie codecs/containers in the README before public users hit unsupported-file errors.
8. Make the release polish decisions final: icon, signing stance, donation/support link, and warning-clean tests.

## Audit limitations

- I did not log in to a real Patreon account or download paid Patreon content.
- I did not perform a live YouTube download; I smoke-tested the bundled `yt-dlp` binary and audited the code paths.
- I did not perform a legal review of third-party licenses. I only verified that attribution resources exist and are packaged.
- I did not test macOS packaging/runtime on macOS from this Windows workspace.
