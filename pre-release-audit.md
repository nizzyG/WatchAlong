# WatchAlong Pre-Release Audit

Audit date: 2026-05-20, using the workspace context in `America/Chicago`.

Scope: README promise review, source audit, packaging/config audit, dependency and bundled-tool checks, automated test/build verification, and a mocked renderer UI smoke test at the supported minimum app width.

I did not intentionally modify source code. Verification created ignored build output under `out/` and a partial ignored `release/` folder before `npm.cmd run dist` failed.

## README Promise Checked

The README promises:

- A local, no-account, no-telemetry desktop app for pairing owned movie files with full-length reaction videos.
- Library browsing, renaming, and deleting.
- An 800 x 600 import wizard that supports local, YouTube, and Patreon reaction sources.
- Bundled `yt-dlp`, `ffmpeg`, `node`, and `patreon-dl` on Windows and macOS.
- Synchronized full-screen reaction playback with a draggable/resizable movie PiP, pop-out movie window, source-rate correction, subtitles, and a command panel.

The core app architecture lines up with those claims, and the unit test/build baseline is strong. The release is not ready yet because packaging, bundled tool reproducibility, macOS claims, privacy/security copy, and one responsive UI regression can all break or mislead public users.

## Verification Run

- `npm run typecheck`: blocked by PowerShell execution policy because `npm.ps1` cannot run on this machine.
- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 15 test files and 104 tests. The suite still prints a React `act(...)` warning in `WizardApp.test.tsx`.
- `npm.cmd run build`: passed for main, preload, and renderer.
- `npm.cmd run dist`: failed during Windows installer packaging. `electron-builder` could not extract `winCodeSign-2.6.0.7z` because the current Windows user lacks symlink creation privilege for bundled Darwin symlinks. The same run also logged that no signing identity was found and that the default Electron icon is being used.
- `npm.cmd audit --omit=dev`: passed with 0 production dependency vulnerabilities.
- `npm.cmd audit`: failed with 16 build/dev toolchain vulnerabilities: 2 low, 5 moderate, 9 high. The high-severity chain is primarily `tar` through `electron-builder` dependencies. `esbuild`/`vite` dev-server advisories are also present.
- `npm.cmd audit --prefix resources/tools/patreon-dl`: passed with 0 vulnerabilities for the locally installed Patreon downloader dependency tree.
- `npm.cmd outdated`: Electron is current at `42.2.0`; notable old packages include `electron-builder` 25.1.8 vs 26.8.1, Vite 5.4.21 vs 8.0.13, Vitest 2.1.9 vs 4.1.7, React 18.3.1 vs 19.2.6, and `lucide-react` 0.468.0 vs 1.16.0.

Bundled tool smoke checks:

- `resources/tools/yt-dlp/yt-dlp.exe --version`: `2026.03.17`.
- `resources/tools/ffmpeg/ffmpeg.exe -version`: `8.1.1-full_build-www.gyan.dev`, built with `--enable-gpl --enable-version3`.
- `resources/tools/ffmpeg/ffprobe.exe -version`: `8.1.1-full_build-www.gyan.dev`.
- `resources/tools/node/node.exe --version`: `v24.15.0`.
- Local ignored `resources/tools/patreon-dl/node_modules/patreon-dl/package.json`: `3.9.0`.
- Direct `node .../patreon-dl/bin/patreon-dl.js --version` prints `patreon-dl v3.9.0` but exits with an option error, so it is not a reliable readiness check.

## Findings

### P1 - `npm.cmd run dist` Does Not Produce A Windows Installer In This Environment

`package.json:13` defines public distribution as `npm run build && electron-builder`, and the Windows target is NSIS at `package.json:54`. The command currently fails after creating `release/win-unpacked` because `electron-builder` downloads `winCodeSign-2.6.0.7z` and 7-Zip cannot create two symlinks without elevated Windows symlink privilege.

This is a release blocker because a maintainer following the project script cannot produce the advertised `.exe` installer on this Windows setup. The same run also reported:

- `default Electron icon is used  reason=application icon is not set`
- `no signing info identified, signing is skipped`

Recommendation: verify the release build in the actual CI/release machine, document or eliminate the symlink privilege requirement, add an app icon, and decide whether Windows code signing is required before public release. At minimum, release instructions should include the exact environment that can run `npm.cmd run dist` successfully.

### P1 - Patreon Downloader Is Not Reproducibly Bundled From A Clean Clone

`resources/tools/README.md:18` says the expected Patreon layout is `resources/tools/patreon-dl/node_modules/patreon-dl/bin/patreon-dl.js` and `dist/...`. `ToolResolver` looks for that runtime at `src/main/mediaServices.ts:205` and requires the dist path at `src/main/mediaServices.ts:212`.

However, `git ls-files resources/tools` only tracks:

- `resources/tools/patreon-dl/package.json`
- `resources/tools/patreon-dl/package-lock.json`
- the Windows `yt-dlp`, `ffmpeg`, `ffprobe`, and `node` binaries

The actual `resources/tools/patreon-dl/node_modules/...` tree exists locally but is ignored by `.gitignore:1`. There is no root script that runs `npm install --prefix resources/tools/patreon-dl` before `electron-builder`, and `package.json:45` blindly copies whatever happens to be present in `resources/tools`.

Impact: Patreon downloads may work on this machine but fail in a clean checkout, a CI release build, or another maintainer's machine. The README promise that `patreon-dl` is bundled is therefore not reproducible.

Recommendation: add a deterministic tool preparation step, such as `npm ci --prefix resources/tools/patreon-dl`, and make `build`/`dist` depend on it. Add a CI check that fails if `ToolResolver.checkTools()` cannot find the Patreon CLI and dist files after a clean install.

### P1 - macOS Is Advertised But Only Windows Tool Binaries Are Present

The README says bundled tools require no extra install "on Windows or macOS" at `README.md:55`, and installation advertises a `.dmg` at `README.md:60`. `package.json:57` also declares a macOS DMG target.

The resolver expects macOS files named `yt-dlp_macos`, `ffmpeg`, and `node` at `src/main/mediaServices.ts:62`, but the tracked resources only include:

- `resources/tools/yt-dlp/yt-dlp.exe`
- `resources/tools/ffmpeg/ffmpeg.exe`
- `resources/tools/ffmpeg/ffprobe.exe`
- `resources/tools/node/node.exe`

Impact: a macOS build would package without the promised toolchain, so YouTube downloads, Patreon downloads, and tool checks would fail.

Recommendation: either remove/defer macOS release claims and the `mac` build target, or add platform-specific resource preparation and packaging for macOS binaries before release.

### P1 - Patreon Privacy Copy Is Too Strong, And The Session Cookie Is Passed On The Command Line

The UI says "Your cookies never leave your device" at `src/renderer/src/components/SmartReactionInput.tsx:301`, and the README says Patreon credentials never leave the device unless the user opts in at `README.md:25`.

The implementation necessarily uses the Patreon session to make network requests. More importantly, `DownloadManager.runPatreon()` passes the cookie as a command-line argument:

- Cookie resolved at `src/main/mediaServices.ts:439`
- `--cookie`, `cookie` added to `args` at `src/main/mediaServices.ts:446`
- child process spawned at `src/main/mediaServices.ts:466`

Impact: the cookie is visible to local process inspection while `patreon-dl` runs, and the absolute "never leave your device" statement is inaccurate because the session is sent to Patreon as part of authenticated download requests.

Recommendation: change the copy to "WatchAlong never sends your Patreon session to WatchAlong servers; it is used locally to authenticate requests to Patreon." Also avoid command-line cookie exposure by using a temporary cookie file with restricted permissions, stdin, or another mechanism supported by `patreon-dl`.

### P1 - Remote Patreon Login Window Is Not Sandboxed And Allows Non-Patreon Popups

The Patreon login window loads remote web content and handles authentication cookies. Its `BrowserWindow` uses:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false`

See `src/main/index.ts:807`. It also allows non-Patreon popups with `{ action: 'allow' }` at `src/main/index.ts:855`.

Impact: this is weaker than it needs to be for a public app handling authentication. Even without Node integration, a remote login surface should be sandboxed and should not be able to spawn arbitrary child windows inside the app.

Recommendation: enable `sandbox: true` for the login window, deny or externalize non-Patreon popups, and add `will-navigate`/navigation checks so the auth window stays on expected Patreon origins.

### P2 - Supported Minimum Width Collapses Many Action Buttons Into Blank Squares

The app's main window minimum width is 960 at `src/main/index.ts:94`, so widths below 1100 are supported. At those widths, this global CSS applies:

```css
@media (max-width: 1100px) {
  .secondary-button {
    width: 38px;
    padding: 0;
    font-size: 0;
  }
}
```

See `src/renderer/src/styles.css:2617`.

This rule affects every `.secondary-button`, not just playback controls. In a mocked renderer at 960 x 560, the command panel's `Change` and `Forget` buttons rendered as unlabeled blank squares. It also affects:

- Wizard Back buttons at `src/renderer/src/WizardApp.tsx:286` and `src/renderer/src/WizardApp.tsx:320`
- Rename/delete dialog Cancel/Delete buttons at `src/renderer/src/App.tsx:1858`, `src/renderer/src/App.tsx:1887`, `src/renderer/src/App.tsx:1890`
- Welcome "Not now" at `src/renderer/src/App.tsx:1956`
- Missing-media "Remove session" at `src/renderer/src/App.tsx:2011`
- Command panel Library/Preferences/Help actions throughout `src/renderer/src/App.tsx:2272` through `src/renderer/src/App.tsx:2443`
- SmartReactionInput saved-session "No, re-authenticate" at `src/renderer/src/components/SmartReactionInput.tsx:316`

Impact: this is visible in normal supported window sizes and in the 800 x 600 wizard. Some buttons have icons, but several become genuinely blank.

Recommendation: scope the compact rule to the playback `.control-row` only, or introduce an explicit icon-only button class. Do not globally shrink `.secondary-button`.

### P2 - Attribution And License Packaging Are Not Release-Ready

`README.md:93` points users to `ATTRIBUTION.md`, and an `ATTRIBUTION.md` exists locally, but:

- `ATTRIBUTION.md` is currently untracked.
- The markdown is escaped with literal backslashes, for example `\#` at line 1 and `\- \*\*Version:\*\*` at line 15.
- `package.json:41` packages only `out/**/*` and `package.json` as app files, plus `resources/tools` as extra resources. Root `ATTRIBUTION.md` is not explicitly included.
- The FFmpeg binary smoke check shows a full GPL-enabled build with `--enable-gpl --enable-version3`, while `ATTRIBUTION.md:27` says only "LGPLv2.1+ / GPLv2+ (depending on build configuration)".

Impact: public binary distribution can fail basic third-party license notice expectations, especially because the app bundles FFmpeg, Node, yt-dlp, and a large `patreon-dl` dependency tree.

Recommendation: commit a correctly formatted attribution file, include it in packaged resources or an in-app About/Legal surface, and state the actual FFmpeg license obligations for the bundled build. If distributing GPL FFmpeg, make sure source/offer requirements are handled.

### P2 - Media Range Handling Misinterprets Suffix Byte Ranges

The custom media protocol advertises `Accept-Ranges: bytes` at `src/main/index.ts:974`, but `parseRange()` treats a suffix range like `bytes=-500` as `start = 0, end = 500`:

```ts
let start = match[1] ? Number.parseInt(match[1], 10) : 0
let end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1
```

See `src/main/index.ts:1018`.

HTTP suffix ranges mean "the last N bytes", not "bytes 0 through N". Some media engines and container formats use suffix or tail reads for metadata/index data.

Impact: edge-case video loading, seeking, or duration detection can fail for files whose metadata requires tail reads, undermining the "sync-perfect playback" promise for otherwise valid local files.

Recommendation: implement full single-range parsing for `bytes=start-end`, `bytes=start-`, and `bytes=-suffixLength`, and add unit tests around 206/416 responses.

### P2 - README Over-Promises General Movie File Support Compared With Electron Playback Reality

The README broadly says users can load their own movie files. The picker accepts `mp4`, `m4v`, `mov`, `webm`, `ogv`, `ogg`, `mkv`, and `avi` in `src/main/index.ts:906`, but playback is just Electron's HTML5 video element. The UI error tells users to use MP4/WebM with browser-supported codecs at `src/renderer/src/App.tsx:1388`.

The wizard has a small hint that "MKV/AVI may not play", but the README and release pitch do not make that limitation clear. Bundling FFmpeg can also imply transcoding/remuxing support that the app does not provide.

Impact: users with common Blu-ray MKV rips may experience first-run failure even though the app appears to support their files.

Recommendation: either add a remux/transcode/probe flow using the bundled FFmpeg, or make README/install copy explicit that MP4/WebM browser-compatible codecs are the supported path and MKV/AVI are best-effort.

### P2 - Download Cancellation Can Be Followed By A Failure Event

`DownloadManager.cancel()` kills the child process, emits `cancelled`, and deletes the running job at `src/main/mediaServices.ts:359`. The child `close` handler still runs afterward and emits `failed` for any nonzero exit code at `src/main/mediaServices.ts:499`.

Impact: depending on platform and child-process exit behavior, users can click Cancel and then see a failed download notification or a failed state in the command panel.

Recommendation: track cancelled job IDs or a `cancelled` flag in `RunningDownload`, then suppress `failed`/`success` handling after intentional cancellation. Add a unit test for killed child processes.

### P2 - Dev/Release Setup Depends On Git LFS But README Does Not Mention It

`.gitattributes:1` through `.gitattributes:3` mark `node.exe`, `ffmpeg.exe`, and `ffprobe.exe` as Git LFS files. The developer README flow is just:

```bash
git clone
npm install
npm run dev
```

Impact: a contributor or release runner without Git LFS installed can get pointer files instead of actual binaries, making tool checks fail even though the README says the tools are bundled.

Recommendation: document Git LFS in developer prerequisites or add a postinstall/tool-verify command that fails with a clear message when LFS binaries are not materialized.

### P3 - Test Suite Passes But Emits React `act(...)` Warnings

`npm.cmd test` passes, but `WizardApp.test.tsx > resets the reaction when the selected movie changes` prints two React `act(...)` warnings for `SmartReactionInput`.

Impact: warning noise trains maintainers to ignore test output and can hide a future real regression.

Recommendation: wrap the async update in `act`/`waitFor`, then keep CI warning-free.

### P3 - Patreon Save Toggle Can Look Enabled Even When Encryption Is Unavailable

`PatreonStorageOffer` sets `enabled` before awaiting `saveLastPatreonSession()` at `src/renderer/src/components/SmartReactionInput.tsx:421`. `PatreonSessionVault.save()` returns without saving when `safeStorage.isEncryptionAvailable()` is false at `src/main/mediaServices.ts:314`.

Impact: on a machine without secure storage, the Save checkbox can remain checked even though no session was saved.

Recommendation: disable the toggle when `canEncrypt` is false, or revert `enabled` based on the returned `status.available`.

### P3 - PiP Toolbar Is Hover-Only, Not Focus-Visible

The PiP toolbar and resize handle are hidden whenever the PiP is not hovered:

```css
.pip:not(:hover) .pip-titlebar,
.pip:not(:hover) .pip-resize {
  opacity: 0;
}
```

See `src/renderer/src/styles.css:694`.

Impact: keyboard users can tab into controls that remain visually hidden because there is no `.pip:focus-within` rule. This is easy to miss in pointer-only testing.

Recommendation: keep the toolbar visible on `.pip:focus-within`, and add a keyboard navigation regression test if possible.

### P3 - Release Polish Placeholders Remain

- `DONATION_URL` is still `null` in `src/renderer/src/App.tsx:92`.
- README still links to `https://ko-fi.com/your-link-here` at `README.md:69`.
- `electron-builder` reports that the default Electron icon is used.
- There is no project app icon asset outside dependency templates.

Impact: this does not break core playback, but it makes the public release feel unfinished and can reduce user trust.

Recommendation: either remove donation UI/copy for 0.1.0 or provide the real URL, and add Windows/macOS app icons before packaging.

## Things That Look Solid

- TypeScript strict builds pass.
- Unit coverage is broad for session normalization/storage, preferences, subtitles, PiP geometry, sync timeline/queue/controller, remote movie adapter, media tool helpers, and major App/Wizard/SmartReactionInput flows.
- Detached movie command timeouts and off-screen window clamping are now implemented in `movieWindowHelpers`.
- The custom protocol does not expose arbitrary file paths directly; media URLs resolve through session IDs and roles.
- The renderer production CSP is restrictive enough for the local app shell, aside from expected inline styles.
- The mocked renderer at 1280 x 720 and 960 x 560 did not show broad layout overflow; the major visual issue found was the global `.secondary-button` collapse.

## Recommended Release Gate

Do not publish yet.

Minimum fixes before a public release:

1. Make `npm.cmd run dist` succeed in the intended release environment.
2. Make bundled tools reproducible from a clean clone/CI build, especially `patreon-dl`.
3. Remove or fulfill macOS release claims.
4. Fix the global `.secondary-button` responsive rule.
5. Correct Patreon privacy wording and avoid exposing the session cookie in process arguments.
6. Harden the Patreon login window.
7. Commit/package proper third-party attribution and clarify FFmpeg licensing.

After those are fixed, rerun `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run dist`, `npm.cmd audit`, `npm.cmd audit --prefix resources/tools/patreon-dl`, and a minimum-width UI smoke test.
