# WatchAlong Pre-release Audit 3

Date: 2026-05-21  
Auditor: Antigravity  
Scope: Full static code audit of the renderer, main process, preload bridge, shared modules, sync engine, and CSS. Focus on edge-case bugs, UI/UX regressions, feature completeness against the README, and React lifecycle correctness. No source code was modified.

---

## Executive Verdict

WatchAlong is architecturally sound and impressively well-structured for a desktop application of this scope. The TypeScript types are clean, the test suite is comprehensive (119 tests across 16 files, all passing), and the IPC bridge is consistent. The core sync engine, library management, and download pipeline all demonstrate careful engineering.

However, several edge-case bugs and UX inconsistencies remain that could surface during real-world usage. The most impactful are: multiple `useEffect` hooks running without dependency arrays (causing unnecessary re-subscriptions on every render), a stale-closure race in the wizard lifecycle handler, the PiP overlay being completely inaccessible to keyboard and touch users, and subtle state management gaps in the sync controller's error recovery path. None are data-loss risks, but several could produce visible playback stutters, ghost event listeners, or confusing UX under normal usage patterns.

I would address the P1 and P2 items before cutting a public release.

---

## Verification Run

| Check | Result |
|---|---|
| `npm run typecheck` | **Passed** — both `tsconfig.node.json` and `tsconfig.web.json` clean |
| `npm test` | **Passed** — 119 tests across 16 files |
| React `act(...)` warnings | 1 warning in `WizardApp.test.tsx > resets the reaction when the selected movie changes` |
| Vite CJS deprecation | Warning present but non-blocking |

---

## P1 — Blocking / High-Priority Findings

### 1.1 Multiple `useEffect` hooks have no dependency array — re-run on every render

**Where:** `src/renderer/src/App.tsx` lines 426–443, 445–514, 861–890, 900–914

**Evidence:** At least four `useEffect` calls in the main `App` component have no dependency array:

```tsx
// Line 426 — window resize handler
useEffect(() => {
    const onResize = (): void => { ... }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  })  // ← no dependency array

// Line 445 — keyboard shortcut handler
useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => { ... }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })  // ← no dependency array

// Line 861 — movie window geometry/pop-in/closed listeners
useEffect(() => {
    const unsubscribeGeometry = window.watchAlong.onMovieWindowGeometry(...)
    const unsubscribePopIn = window.watchAlong.onMovieWindowPopInRequest(...)
    const unsubscribeClosed = window.watchAlong.onMovieWindowClosed(...)
    return () => { ... }
  })  // ← no dependency array

// Line 900 — auto pop-out restoration
useEffect(() => {
    if (...) return
    void popOutMovie('screen')
  })  // ← no dependency array
```

**Why this matters:** Without a dependency array, each of these effects runs its setup and teardown on **every single render**. This means:
- The `resize` and `keydown` listeners are removed and re-added on every state change, creating unnecessary GC pressure and potential event ordering issues.
- The IPC subscriptions for movie window events (geometry, pop-in, closed) are unsubscribed and re-subscribed on every render, creating a window where events can be missed between teardown and setup.
- The auto pop-out restoration effect runs on every render, and is only guarded by a ref check — if the ref is reset at the wrong time (e.g., during a session switch), the movie could pop out unexpectedly.

The keyboard handler in particular captures closures over `commandPanelOpen`, `appView`, `setupModeRef`, and several callback functions. The lack of a dependency array makes this intentional-looking (to always have fresh closure values), but the tradeoff is ~50+ event listener re-registrations per second during playback (since `onPosition` triggers `setPosition` which triggers re-render).

**Recommendation:** For the keyboard and resize handlers, either:
1. Add explicit dependency arrays and use `useCallback` for the captured callbacks, or
2. Use refs for the values that change frequently (like `commandPanelOpen`) and keep the dependency array empty, or
3. At minimum, document the intentional lack of dependency array with a comment explaining the tradeoff.

For the IPC listeners (line 861), this is more urgent — IPC subscription churn can cause race conditions with the movie window. These should have a dependency array, with the callback functions wrapped in `useCallback` or using refs.

### 1.2 Stale closure in `handleWizardLifecycle` for `canPlay` and `isPlaying`

**Where:** `src/renderer/src/App.tsx` lines 594–643

**Evidence:** The `handleWizardLifecycle` closure captures `canPlay` and `isPlaying` from the render scope. However, the effect's dependency array is `[canPlay, commitLibrary, isPlaying, movieWindowActive, refreshMediaUrls]`. This means:

```tsx
// Line 598-601
pausedForWizardRef.current = canPlay && isPlaying  // captures current render's canPlay/isPlaying
if (pausedForWizardRef.current) {
  controllerRef.current?.pause()
}
```

When the wizard opens, it captures the `canPlay` and `isPlaying` values from the *current render*. But `canPlay` depends on `metadataReady` and `activeSession` — if a background download completes and updates the session between the `useEffect` re-registration, the captured values could be stale. Combined with finding 1.1 (the pop-out listeners re-registering every render), the wizard lifecycle handler could have a brief window where `canPlay` is `true` in the render scope but the effect was registered with a previous value.

**Why this matters:** In the `'cancelled'` path (line 606-612), `shouldResume && canPlay` guards the resume call. If `canPlay` goes from `false` to `true` between wizard open and wizard cancel (e.g., metadata finishes loading while the wizard is open), the user's playback won't resume even though both videos are now ready. This is an edge case, but it creates a "stuck in paused" state that requires manual intervention.

**Recommendation:** Read `canPlay` and `isPlaying` from refs at the time of the callback rather than from the closure. Use `controllerRef.current?.getState()` to determine the actual current sync state.

### 1.3 `RemoteVideoAdapter.send()` throws after updating state on error

**Where:** `src/renderer/src/sync/RemoteVideoAdapter.ts` lines 134–141

**Evidence:**
```typescript
private async send(command: RemoteMediaCommandInput): Promise<RemoteMediaCommandResult> {
    const result = await this.transport.sendCommand(...)
    this.state = { ...this.state, ...result.state }  // state updated
    if (!result.ok) {
      throw new Error(result.error ?? 'Movie command failed')  // then throws
    }
    return result
  }
```

The state is updated *before* the error throw. The callers for `currentTime` setter, `playbackRate` setter, `volume` setter, and `muted` setter all catch this error via `.catch((error) => this.dispatchError(error))`, which dispatches an `'error'` event. But the state has already been contaminated with the error result's state, which may contain unexpected values (e.g., a `duration: NaN` or stale `currentTime`).

Meanwhile, the `play()` method does NOT catch the error — it rethrows to the caller:
```typescript
async play(): Promise<void> {
    const result = await this.send({ type: 'play' })
    if (!result.ok) {
      throw new Error(result.error ?? 'Movie playback failed')
    }
  }
```

But `send()` already throws if `!result.ok`, so `play()` has a double-throw path. The second throw is unreachable dead code.

**Why this matters:** If the movie window becomes unresponsive and `sendCommand` returns `{ ok: false }`, the adapter's local state will be updated with potentially stale/corrupt state data, and the `SyncController` will base its drift correction on that corrupted state. This could cause a brief playback desync after recovery.

**Recommendation:** Only update state when `result.ok === true`. Remove the unreachable error check in `play()`.

---

## P2 — Medium-Priority Findings

### 2.1 PiP overlay is completely invisible to keyboard and touch users

**Where:** `src/renderer/src/styles.css` lines 694–697

**Evidence:**
```css
.pip:not(:hover) .pip-titlebar,
.pip:not(:hover) .pip-resize {
  opacity: 0;
}
```

There is no `:focus-within` rule anywhere in the CSS. A search for `focus-within` across the entire stylesheet returns zero results. This means:
- Keyboard users who Tab into the PiP controls (snap, pop-out, hide) will see no visual indication they've focused a control.
- Touch/pen users on tablets have no reliable hover state, so PiP controls are permanently invisible.
- Screen reader users can still operate the controls via aria labels, but sighted keyboard users cannot.

**Why this matters:** Audit 2 flagged this as P3. I'm elevating it to P2 because the PiP overlay contains the **movie pop-out control**, which is one of the README's headline features. A keyboard/touch user cannot discover or use pop-out without first knowing it exists via hover.

**Recommendation:** Add:
```css
.pip:focus-within .pip-titlebar,
.pip:focus-within .pip-resize {
  opacity: 1;
}
```

### 2.2 `SyncController.correctDrift()` soft-correction dead zone between RESET_DRIFT and SOFT_DRIFT

**Where:** `src/renderer/src/sync/SyncController.ts` lines 568–579

**Evidence:**
```typescript
const SOFT_DRIFT_SECONDS = 0.1
const RESET_DRIFT_SECONDS = 0.03

function correctedRate(driftSeconds: number, basePlaybackRate = 1): number {
  const absoluteDrift = Math.abs(driftSeconds)
  if (absoluteDrift < RESET_DRIFT_SECONDS) {    // < 0.03s → reset to base rate ✓
    return basePlaybackRate
  }

  if (absoluteDrift < SOFT_DRIFT_SECONDS) {      // 0.03s–0.1s → ALSO reset to base rate ??
    return basePlaybackRate
  }

  return driftSeconds > 0 ? basePlaybackRate * 0.97 : basePlaybackRate * 1.03
}
```

Both the `< RESET_DRIFT_SECONDS` and `< SOFT_DRIFT_SECONDS` branches return the same value (`basePlaybackRate`). This means there is no gradual correction between 0.03s and 0.1s of drift. The sync engine only corrects when drift exceeds 0.1s, and even then only applies a fixed 3% rate adjustment. Drift between 0.03–0.1s is silently ignored.

**Why this matters:** For a ~2-hour movie with a 1.001x rate correction, accumulated micro-drift in the 30ms–100ms range will go uncorrected until it exceeds 100ms, at which point the 3% correction kicks in. This creates a "sawtooth" drift pattern where the movie slowly drifts 100ms, gets corrected back, and repeats. On high-quality audio where lip-sync matters, this could be perceptible.

**Recommendation:** Either:
1. Add a proportional soft correction in the 30ms–100ms range (e.g., `basePlaybackRate * (1 - drift * 0.3)`), or
2. If the current behavior is intentional (to avoid jittery speed changes), add a comment explaining the design decision.

### 2.3 Import wizard does not pause popped-out movie on open

**Where:** `src/renderer/src/App.tsx` lines 594–602

**Evidence:** (Carried forward from Audit 2, P2, not yet fixed.)

When the wizard lifecycle sends `'opened'`, the handler does:
```tsx
pausedForWizardRef.current = canPlay && isPlaying
if (pausedForWizardRef.current) {
  controllerRef.current?.pause()
}
```

`controllerRef.current?.pause()` pauses the reaction video and the *local* movie adapter. But when the movie is popped out to a separate window, `controllerRef.current` is using a `RemoteVideoAdapter`, and `pause()` sends an async IPC command. The `canPlay && isPlaying` check captures the state at the time of the effect closure (see P1.2), and the IPC pause is fire-and-forget — it won't block the wizard from opening.

However, `openImportWizard` (line 916–920) calls `setCommandPanelOpen(false)` and `setControlsIdle(false)`, but does **not** directly pause the controller. The pause only happens inside the wizard lifecycle handler, which is an async IPC callback from the main process. This creates a race where the wizard could fully open before the pause command reaches the popped-out movie window.

**Why this matters:** Users can hear movie audio continuing from the pop-out window while interacting with the import wizard. The wizard is modal, so they can't easily pause it manually.

**Recommendation:** Call `controllerRef.current?.pause()` synchronously in `openImportWizard` before opening the wizard window.

### 2.4 `LibraryPanel` component is dead code

**Where:** `src/renderer/src/App.tsx` lines 2568–2606

**Evidence:** The `LibraryPanel` component is defined with full props interface (`LibraryPanelProps`) but is never imported or rendered anywhere in the codebase. It uses a `<details>` HTML element pattern that differs from the `CommandPanel > Library section` pattern actually used in the app.

**Why this matters:** Dead code adds maintenance burden and can confuse contributors. The component also has rename/delete handlers that duplicate the `LibrarySessionCard` functionality.

**Recommendation:** Remove `LibraryPanel` and `LibraryPanelProps` before release.

### 2.5 Subtitle parser does not handle SSA/ASS format

**Where:** `src/renderer/src/subtitles.ts`

**Evidence:** The parser handles SRT and VTT formats (both use `-->` timing lines). The file picker in the main process only offers `.srt` and `.vtt` extensions (line 953–957 of `index.ts`). However, many movie subtitle files distributed online use SSA/ASS format (`.ass`, `.ssa`), which uses a completely different `Dialogue:` line format.

The README does not mention subtitle format restrictions, but the file picker silently excludes SSA files. If a user selects "All files" and picks an ASS file, `parseSubtitleText` will return an empty array (no `-->` timing lines found), and the movie will play with no visible subtitles and no error message.

**Why this matters:** This is a silent failure with no user feedback. The user may think subtitles aren't working rather than understanding it's a format limitation.

**Recommendation:** Either:
1. Add ASS/SSA parsing support, or
2. Show an error or warning when the parsed cue array is empty after loading a non-empty file.

### 2.6 Patreon login allowlist doesn't include OAuth providers

**Where:** `src/main/index.ts` lines 884–891

**Evidence:**
```typescript
function isAllowedPatreonLoginUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return url.protocol === 'https:' && (url.hostname === 'patreon.com' || url.hostname === 'www.patreon.com')
}
```

Patreon's login page supports "Sign in with Google" and "Sign in with Apple" OAuth flows, which redirect to `accounts.google.com` and `appleid.apple.com` respectively. These are blocked by the allowlist, which only permits `patreon.com` and `www.patreon.com`.

When a user clicks "Sign in with Google" in the Patreon login window:
- The `will-navigate` handler (line 867–872) prevents navigation and calls `openExternalUrl(url)`, which opens the Google OAuth page in the system browser.
- The user completes Google auth in the system browser, which redirects back to `patreon.com`.
- But the redirect goes to the system browser's Patreon, not the app's login window.
- The login window never receives the `session_id` cookie.

**Why this matters:** "Sign in with Google" is one of the most common login methods. Users who use Google login for Patreon will be unable to authenticate via the in-app login flow.

**Recommendation:** Expand the allowlist to include Google and Apple OAuth domains:
```typescript
const allowedHosts = ['patreon.com', 'www.patreon.com', 'accounts.google.com', 'appleid.apple.com']
```

---

## P3 — UX Polish and Low-Priority Findings

### 3.1 Movie window "Close" button actually pops in, not closes

**Where:** `src/renderer/src/MovieWindowApp.tsx` lines 128–136

**Evidence:** (Carried forward from Audit 2, still present.)

Both the "Pop movie back in" button and the "Close" button call `requestMovieWindowPopIn()`. The close button's `aria-label` is `"Close"`, but the behavior is "pop in" not "close."

**Recommendation:** Rename the label to "Return to main window" or implement a true close action.

### 3.2 `formatRelativeTime` is not reactive — library cards show stale timestamps

**Where:** `src/renderer/src/App.tsx` lines 2750–2783

**Evidence:** `formatRelativeTime` converts an ISO timestamp to a relative string like "5 minutes ago". But it's called during render without any timer-based re-render. A session updated "Just now" will still show "Just now" an hour later if the user stays on the library view without navigating away and back.

**Why this matters:** This is cosmetic but can be confusing if the user leaves the library open for an extended period.

**Recommendation:** Either add a minute-interval timer to force library re-renders, or switch to absolute timestamps (e.g., "May 21, 3:42 PM").

### 3.3 `CommandPanelSection` type name collides with `CommandPanelSection` component name

**Where:** `src/renderer/src/App.tsx` lines 69, 2465

**Evidence:**
```tsx
type CommandPanelSection = 'now-playing' | 'library' | 'downloads' | 'preferences' | 'help'
// ...
function CommandPanelSection({ id, ... }: { id: CommandPanelSection; ... }) { ... }
```

The type `CommandPanelSection` (line 69) and the component function `CommandPanelSection` (line 2465) share the same name. TypeScript allows this because types and values occupy different namespaces, but it creates cognitive overhead for maintainers and confuses IDE autocomplete.

**Recommendation:** Rename the type to `CommandPanelSectionId` or the component to `CommandPanelAccordion`.

### 3.4 `window.open()` bypasses Electron's security model in the "Online Help" button

**Where:** `src/renderer/src/App.tsx` lines 2437, 2448–2451

**Evidence:**
```tsx
onClick={() => window.open(ONLINE_HELP_URL, '_blank')}
// ...
onClick={() => { if (DONATION_URL) { window.open(DONATION_URL, '_blank') } }}
```

These use `window.open()` from the renderer, which in an unsandboxed Electron renderer will attempt to open a new Electron BrowserWindow. The main process has a `setWindowOpenHandler` that redirects to `shell.openExternal()`, so this works correctly — but only because the main window handler is in place.

**Why this matters:** If the main window handler were ever removed or if these buttons were used in a sandboxed context, `window.open` would either fail silently or open an insecure renderer window.

**Recommendation:** Use `window.watchAlong` IPC bridge to open external URLs, or expose a dedicated `openExternal` API method.

### 3.5 Download indicator uses hardcoded fallback percentage

**Where:** `src/renderer/src/App.tsx` line 2532

**Evidence:**
```tsx
<ReadOnlyProgress value={event.percent ?? (working ? 42 : ready ? 100 : 0)} />
```

When `event.percent` is `null` during the `'checking'` or `'downloading'` state, the progress bar shows 42%. This is a magic number with no visual indication that it's indeterminate.

**Why this matters:** Users see a progress bar frozen at 42% and may think the download is stuck.

**Recommendation:** Use the existing `progress-indeterminate` CSS class (already used in `SmartReactionInput.tsx` line 406) to show an animated indeterminate state instead of a fixed percentage.

### 3.6 The `bothReady()` method in `SyncController` is unused

**Where:** `src/renderer/src/sync/SyncController.ts` lines 517–519

**Evidence:**
```typescript
private bothReady(): boolean {
    return this.options.reaction.readyState >= HAVE_FUTURE_DATA && this.options.movie.readyState >= HAVE_FUTURE_DATA
  }
```

This method is never called anywhere in the class. `readyForCurrentTimeline()` is used instead, which has smarter logic that accounts for whether the movie should be playing at the current reaction time.

**Recommendation:** Remove `bothReady()` to reduce dead code.

### 3.7 `SyncController.setVolume()` is never called

**Where:** `src/renderer/src/sync/SyncController.ts` lines 164–168

**Evidence:**
```typescript
setVolume(volume: number): void {
    const safeVolume = Math.min(1, Math.max(0, volume))
    this.options.reaction.volume = safeVolume
    this.options.movie.volume = safeVolume
  }
```

This method sets both reaction and movie to the *same* volume, but the app uses independent volume controls via `setAudio()`. `setVolume()` is never called from `App.tsx` or any test.

**Recommendation:** Remove `setVolume()` — it's dead code and would be incorrect if called (it ignores independent volume settings).

### 3.8 React `act(...)` warning in WizardApp test

**Where:** `src/renderer/src/WizardApp.test.tsx`

**Evidence:** (Carried forward from Audit 2.)

The `SmartReactionInput` component triggers async state updates (browser detection, Patreon session status) that resolve after the test's interaction phase. This produces a React `act(...)` warning that makes the test output noisy.

**Recommendation:** Wrap the relevant async settling in `act(...)` or Testing Library's `waitFor()`.

### 3.9 `APP_VERSION` is hardcoded, not read from `package.json`

**Where:** `src/renderer/src/App.tsx` line 93

**Evidence:**
```tsx
const APP_VERSION = '0.1.0'
```

This version string is duplicated from `package.json` and will need manual synchronization on every version bump.

**Recommendation:** Either inject the version at build time via Vite's `define` or read it from the Electron API at runtime.

### 3.10 `DONATION_URL` placeholder renders a disabled button

**Where:** `src/renderer/src/App.tsx` lines 95, 2442–2457

**Evidence:**
```tsx
const DONATION_URL: string | null = null
// ...
<button disabled={!DONATION_URL} title={DONATION_URL ? 'Open donation page' : 'Donation link coming soon.'}>
  Buy the developer a coffee
</button>
```

A permanently disabled button with tooltip "Donation link coming soon" in a release build looks unfinished.

**Recommendation:** Either set the real donation URL before release, or hide the button entirely when `DONATION_URL` is null.

---

## Items That Look Solid

- **TypeScript types are comprehensive** — the `WatchAlongApi` interface, `LibrarySession`, and all IPC types provide strong contracts between main/preload/renderer.
- **Session persistence is atomic** — `SessionStore` writes to a `.tmp` file and renames, preventing corruption on crash.
- **Legacy migration is safe** — `migrateLegacyUserData` only copies if the target doesn't exist, preventing overwrite.
- **Session deduplication** — `createOrSwitchSession` checks for existing sessions with matching file paths before creating new ones.
- **Patreon login window is sandboxed** — `sandbox: true` with domain-restricted navigation.
- **Content Security Policy** — `index.html` has a restrictive CSP that only allows `watchalong:` and `blob:` for media sources.
- **Command queue supersedes outdated commands** — `SyncCommandQueue.supersedeCommands()` correctly collapses redundant seek/play/pause commands.
- **PiP geometry constraining** — `constrainOverlay` correctly handles viewport resizing, minimum sizes, and snap corners.
- **Movie window bounds clamping** — `ensureVisibleWindowBounds` prevents offscreen windows on multi-monitor setups.
- **Download cancellation** — `child.kill()` properly terminates download processes, and the UI immediately reflects the cancelled state.
- **Subtitle parser handles BOM and line endings** — strips `\uFEFF`, normalizes `\r\n` and `\r` to `\n`, handles VTT settings after timing lines.
- **Test coverage is comprehensive** — 119 tests covering sync controller, command queue, timeline mapping, PiP geometry, subtitle parsing, session store, media range, movie window helpers, preferences, media services, smart reaction input, PiP overlay, App component, and WizardApp.
- **The test for popped-out movie wizard interaction exists and passes** — `App.test.tsx > pauses and resumes a playing popped-out movie around a cancelled wizard` specifically tests the scenario flagged in Audit 2.

---

## Recommended Release Gate

| # | Gate | Status |
|---|---|---|
| 1 | All TypeScript typechecks pass | ✅ |
| 2 | All 119 tests pass | ✅ |
| 3 | Fix missing `useEffect` dependency arrays (P1.1) | ⬜ |
| 4 | Fix stale closure in wizard lifecycle handler (P1.2) | ⬜ |
| 5 | Fix `RemoteVideoAdapter.send()` state corruption on error (P1.3) | ⬜ |
| 6 | Add PiP `:focus-within` CSS rule (P2.1) | ⬜ |
| 7 | Pause popped-out movie synchronously on wizard open (P2.3) | ⬜ |
| 8 | Add Google/Apple OAuth domains to Patreon login allowlist (P2.6) | ⬜ |
| 9 | Remove dead code: `LibraryPanel`, `bothReady()`, `setVolume()` (P2.4, P3.6, P3.7) | ⬜ |
| 10 | Set final APP_VERSION, DONATION_URL, and app icon | ⬜ |
| 11 | Address all prior Audit 2 P1 items (installer build, package size, cookie exposure) | ⬜ |

---

## Audit Limitations

- I did not run the app in Electron — all findings are from static code analysis and test execution.
- I did not test with real Patreon or YouTube accounts.
- I did not test macOS packaging or runtime behavior.
- I did not audit CSS for visual rendering — only for functional correctness (focus states, overflow, z-index conflicts).
- I did not audit the bundled tool binaries (yt-dlp, ffmpeg, patreon-dl) beyond what Audit 2 already covered.
- I did not perform a security penetration test or license audit.
