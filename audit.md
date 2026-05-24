# WatchAlong Release Audit

Date: 2026-05-20
Scope: Recent UI/UX changes, especially detached/default PiP movie playback, plus release-readiness checks around packaging, docs, dependencies, and bundled tools.

## Verification Run

- `npm.cmd run typecheck`: passed.
- `npm.cmd test`: passed, 14 test files and 83 tests. One React `act(...)` warning remains in `WizardApp.test.tsx`.
- `npm.cmd run build`: passed for main, preload, and renderer bundles.
- `npm.cmd audit --omit=dev`: passed with 0 production dependency vulnerabilities.
- `npm.cmd audit`: failed with 18 dev/runtime-tooling vulnerabilities, including high-severity Electron advisories. Electron is listed as a dev dependency, but it is still the runtime shipped with the desktop app.
- `npm.cmd outdated`: Electron is installed at 31.7.7, wanted 31.7.7, latest 42.2.0. Several build/test packages are also materially behind.
- Bundled tool smoke checks:
  - `yt-dlp.exe --version`: `2026.03.17`.
  - `ffmpeg.exe -version`: `8.1.1`.
  - `node.exe --version`: `v24.15.0`.
  - `patreon-dl` package version: `3.9.0`.
  - Direct `patreon-dl --version` did not return promptly and was killed during the audit. The app currently reads the package metadata for this tool check, so this is a CLI smoke-test gap rather than a confirmed app failure.

## Findings

### P1 - Import Wizard Can Leave A Stale Detached Movie Connected

`src/renderer/src/App.tsx:592` handles import wizard lifecycle, but the completed-wizard path refreshes the active library/session without calling `stopDetachedMovie()` first. Other replacement paths do stop the detached movie (`src/renderer/src/App.tsx:945`, `src/renderer/src/App.tsx:982`, `src/renderer/src/App.tsx:1077`, `src/renderer/src/App.tsx:1093`, `src/renderer/src/App.tsx:1109`, `src/renderer/src/App.tsx:1123`), so this path is inconsistent.

The same wizard-open branch intentionally avoids pausing when `movieWindowActive` is true (`src/renderer/src/App.tsx:595`). That means playback can continue while the import wizard is open, and after wizard completion the remote movie adapter/window can still point at the previous movie while the app has switched sessions.

Recommendation: stop and detach the popped-out movie before opening or completing the import wizard, or explicitly rebind the movie window to the new session/media before the new session becomes active.

### P1 - Electron Runtime Is Vulnerable Before Publish

`npm.cmd audit` reports high-severity advisories against `electron <=39.8.4`; the installed Electron is 31.7.7. Even though Electron is in `devDependencies`, it is bundled into the published desktop app.

Recommendation: upgrade Electron and run the full Electron smoke suite again. Do not treat `npm audit --omit=dev` as sufficient for this app because the runtime lives in dev dependencies.

### P1 - macOS Release Path Is Advertised But The Bundled Tools Are Windows-Only

`package.json:57` defines a macOS build target and `README.md:59` tells users to install a `.dmg`, but `resources/tools/README.md:9` documents only `.exe` tool binaries. `ToolResolver` looks for non-Windows names on macOS/Linux (`src/main/mediaServices.ts:100`, `src/main/mediaServices.ts:107`, `src/main/mediaServices.ts:113`), but the current resources contain Windows executables. Browser detection is also Windows-path based in `src/main/mediaServices.ts:30`.

Recommendation: either remove/defer macOS publishing claims and targets, or add platform-specific tool resources and browser detection before shipping a macOS build.

### P1 - Missing Third-Party Attribution File For Bundled Binaries

`README.md:92` says bundled tools are covered in `ATTRIBUTION.md`, but no `ATTRIBUTION.md` exists in the repo. This matters because the app bundles ffmpeg, yt-dlp, Node, and patreon-dl plus patreon-dl dependencies.

Recommendation: add attribution/license notices before publishing installers.

### P2 - PiP Toolbar Buttons Also Trigger Drag Handling

`PipOverlay` puts `onPointerDown={beginDrag}` on the whole titlebar (`src/renderer/src/components/PipOverlay.tsx:119`). The Snap, Pop Out, Pop In, and Hide buttons live inside that same titlebar (`src/renderer/src/components/PipOverlay.tsx:122`, `src/renderer/src/components/PipOverlay.tsx:139`, `src/renderer/src/components/PipOverlay.tsx:146`) and do not stop pointer-down propagation.

In real pointer input, pressing a toolbar button can start the drag path and commit/snap geometry on pointer-up. It may also interfere with click/focus behavior. Current tests use `fireEvent.click`, so they do not exercise this pointer sequence.

Recommendation: make only the grip/title text start drag, or stop pointer-down propagation on titlebar buttons. Add a pointer-event regression test for the pop-out button.

### P2 - `notifyMainWindow: false` Does Not Actually Suppress Close Events

`closeMovieWindow({ notifyMainWindow: false })` is used from the renderer for intentional mode changes (`src/renderer/src/App.tsx:706`, `src/renderer/src/App.tsx:809`) and in the main process before opening a replacement movie window (`src/main/index.ts:283`). However, the movie window `closed` handler always sends `movie-window-closed` to the main renderer (`src/main/index.ts:343`, `src/main/index.ts:357`). `closeMovieWindow` can then send a second close event when `notifyMainWindow` is true (`src/main/index.ts:395`).

The renderer masks some of this with `closingMovieWindowRef`, but the IPC option name and behavior do not match, and the default path can double-notify.

Recommendation: centralize close-event emission and honor `notifyMainWindow` for both the direct close path and the `closed` event handler.

### P2 - Remote Movie Commands Can Hang Forever

Main-process movie commands are stored in `pendingMovieCommands` (`src/main/index.ts:71`, `src/main/index.ts:491`) and resolved only when the movie window acknowledges (`src/main/index.ts:628`) or when the window closes (`src/main/index.ts:343`). There is no timeout. `popInMovie()` awaits a `fadeOut` command before closing (`src/renderer/src/App.tsx:807`), so a wedged movie renderer can make pop-in hang.

Recommendation: add a per-command timeout and resolve with an error state so the UI can still close/recover the detached movie window.

### P2 - Restored Pop-Out Geometry Can Reopen Off-Screen

Auto-restore uses saved screen geometry (`src/renderer/src/App.tsx:881`, `src/renderer/src/App.tsx:891`). The main process accepts `geometryMode === 'screen'` geometry directly (`src/main/index.ts:437`, `src/main/index.ts:439`) and only normalizes finite values/minimum size (`src/main/index.ts:465`). It does not clamp to any current display work area.

Users who unplug a monitor or change display layout can end up with an invisible popped-out movie window on next launch.

Recommendation: use Electron `screen` display bounds/workArea to constrain restored movie windows.

### P3 - `PipOverlay` Popped-Out UI Is Disconnected

`PipOverlay` has a `poppedOut` branch and a "Movie is popped out." button (`src/renderer/src/components/PipOverlay.tsx:125`, `src/renderer/src/components/PipOverlay.tsx:133`), and there is a component test for it (`src/renderer/src/components/PipOverlay.test.tsx:79`). But `App` renders `PipOverlay` only when `!movieWindowActive` and always passes `poppedOut={false}` (`src/renderer/src/App.tsx:1552`, `src/renderer/src/App.tsx:1557`).

This is disconnected code. Either remove the branch/test or render the placeholder/status intentionally while the movie is popped out.

### P3 - Movie Window Close Label Does Not Match Behavior

In `MovieWindowApp`, the X button is titled and labeled "Close" but calls `requestMovieWindowPopIn()` (`src/renderer/src/MovieWindowApp.tsx:129`, `src/renderer/src/MovieWindowApp.tsx:133`). Functionally, it pops the movie back into the player rather than simply closing it.

Recommendation: change the label to match the behavior, or implement a true close/dismiss action if that is the intended affordance.

### P3 - Test Output Has A React `act(...)` Warning

The full suite passes, but `WizardApp.test.tsx` logs a React `act(...)` warning during "resets the reaction when the selected movie changes". Passing tests with warnings are easy to ignore later when a real warning appears.

Recommendation: wrap the triggering async state update in `act`/`waitFor` so the suite is quiet before release.

### P3 - Release Polish Items Remain

- `DONATION_URL` is set to `https://ko-fi.com/watchalong`, and the README points at the same active Ko-fi support page.
- No app icon assets were found, and `package.json` does not configure an installer/app icon.
- The README still describes the movie only as a PiP overlay (`README.md:26`, `README.md:28`) and does not mention the new detached movie-window behavior.

Recommendation: keep the active support link in release builds, add app icons, and update user-facing docs for pop-out behavior.

## Test Coverage Gaps To Add

- App-level test for opening the import wizard while `movieWindowActive` is true, confirming the detached movie is stopped or rebound.
- Pointer-event test proving PiP toolbar buttons do not trigger drag/snap.
- Main-process unit test for `closeMovieWindow({ notifyMainWindow: false })` not emitting `movie-window-closed`.
- Command-timeout test for unacknowledged movie-window IPC.
- Geometry restore test for saved screen coordinates outside available displays.

## Overall Release Readiness

The TypeScript, unit test, and production build baselines are good. I would not publish yet because the detached movie lifecycle has at least one stale-window path, Electron needs a security update before distribution, and attribution/platform packaging gaps need to be closed for a public release.
