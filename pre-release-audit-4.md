# WatchAlong Pre-release Audit 4

Date: 2026-05-21  
Auditor: Antigravity  
Scope: Comprehensive static code and security audit of the renderer, main process, IPC preload bridge, and media serving protocol. Reviewing recent patches for Patreon OAuth flows, hook dependency arrays, remote video state safety, and media parsing. No source code was modified.

---

## Executive Verdict

The WatchAlong codebase is in a highly polished state. All 119 unit and integration tests pass successfully, and TypeScript compilation (`npm run typecheck`) is clean across both Node.js (main/preload) and Web (renderer) targets. 

Recent uncommitted fixes applied to the workspace successfully resolve critical issues from Audit 3, including standardizing `useEffect` dependency arrays, fixing stale closures in the import wizard, preventing state contamination on remote adapter errors, and adding focus-within styling for PiP accessibility.

However, several new edge cases, UX inconsistencies, and minor security gaps have been identified that should be resolved before cutting the public release. Most notably, the Picture-in-Picture (PiP) placeholder is completely unmounted when a movie is popped out (rendering pop-in recovery unreachable from the main window), and Facebook OAuth redirects remain blocked in the Patreon login window.

---

## Verification Run

| Check | Result |
|---|---|
| `npm run typecheck` | **Passed** — clean compile for Node and Web configurations |
| `npm test` | **Passed** — 119 tests across 16 files |
| React `act(...)` warning | Present in `WizardApp.test.tsx > resets the reaction when the selected movie changes` (async state settling) |
| Vite CJS deprecation warning | Present but non-blocking |

---

## P1 — Blocking / High-Priority Findings

### 1.1 PiP Overlay placeholder and Pop-In controls unmounted during Pop-Out
**Where:** [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L1598-L1614)  
**Details:** The `<PipOverlay>` component contains specific styling and layout for when the movie is popped out (`poppedOut={true}`), rendering a placeholder banner stating *"Movie is popped out. Pop back in"* with a click trigger. However, in `App.tsx`, the overlay is conditionally rendered as:
```tsx
{hasMedia && !movieWindowActive && (
  <PipOverlay poppedOut={false} ... />
)}
```
When a movie is popped out to a separate window (`movieWindowActive === true`), the component is completely unmounted. Consequently, the placeholder is never rendered, leaving the main window blank. Sighted users have no visual indication that the movie is active in another window, nor can they pop the movie back in from the main window controls.  
**Impact:** Critical UX degradation. If the movie window is minimized, hidden behind other windows, or placed off-screen, the user cannot easily retrieve it from the main interface.  
**Recommendation:** Render `<PipOverlay>` regardless of `movieWindowActive` status, passing `movieWindowActive` as the `poppedOut` prop:
```tsx
{hasMedia && (
  <PipOverlay
    poppedOut={movieWindowActive}
    ...
  />
)}
```

### 1.2 Patreon Facebook OAuth redirect blocked by login allowlist
**Where:** [index.ts](file:///c:/Users/nizar/Projects/WatchAlong/src/main/index.ts#L907-L923)  
**Details:** Patreon's login page supports Google, Apple, and Facebook OAuth logins. While Conversation `b581abc3` updated `isAllowedPatreonLoginUrl()` to allow Google and Apple subdomains, Facebook domains are not allowlisted:
```typescript
function isAllowedPatreonLoginUrl(rawUrl: string): boolean {
  ...
  return (
    host === 'patreon.com' ||
    host === 'www.patreon.com' ||
    host.endsWith('.google.com') ||
    host.endsWith('.apple.com')
  )
}
```
If a user attempts to sign in via Facebook, the oauth redirection to `facebook.com` fails the allowlist, triggering the `will-navigate` interceptor which blocks navigation in the popup and opens the URL in the system's default browser instead. The desktop app never receives the login cookie.  
**Impact:** Users who authenticate with Facebook credentials on Patreon cannot sign in.  
**Recommendation:** Extend `isAllowedPatreonLoginUrl` to allow Facebook hosts:
```typescript
host === 'facebook.com' || host.endsWith('.facebook.com')
```

---

## P2 — Medium-Priority Findings

### 2.1 Missing protocol schemes disable URL inputs silently
**Where:** [SmartReactionInput.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/components/SmartReactionInput.tsx#L142-L153)  
**Details:** When users copy-paste YouTube or Patreon URLs from modern browser address bars, the protocol scheme (e.g., `https://`) is frequently omitted (e.g., `youtube.com/watch?v=...` or `patreon.com/posts/...`). The input validates URLs via:
```typescript
new URL(value.trim())
```
Because the protocol is missing, the `URL` constructor throws a parsing exception. The form remains invalid, and the download button is disabled with no helper feedback explaining the protocol omission.  
**Recommendation:** Automatically prepend `https://` to the input value during validation check if it is missing, or display a helper message.

### 2.2 Blank lines with spaces drop subtitle cues
**Where:** [subtitles.ts](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/subtitles.ts#L20-L30)  
**Details:** The subtitle parser splits file content into cue blocks using `.split(/\n{2,}/)`. In SRT/VTT files that contain trailing whitespace on blank lines (e.g., `\n \n`), the split regex fails. Multiple subtitle cues are grouped into a single text block. The parser extracts only the first timing line it finds in the block and silently drops the rest, leading to missing subtitle cues during playback.  
**Recommendation:** Normalize blank lines containing spaces before parsing:
```typescript
const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
const blocks = normalized.split(/\n\s*\n/)
```

### 2.3 Window retrieval 1-pixel edge-case vulnerability
**Where:** [movieWindowHelpers.ts](file:///c:/Users/nizar/Projects/WatchAlong/src/main/movieWindowHelpers.ts#L97-L124)  
**Details:** `intersectsAnyWorkArea()` evaluates to `true` if the overlap area with any monitor work area is `> 0`. If a window is positioned or dragged such that only a 1-pixel border overlaps a screen corner, the window is considered "visible" and not repositioned. Since a 1-pixel border is too small for a user to click, grab, or drag, the window becomes effectively lost/unreachable.  
**Recommendation:** Require a minimum overlap size (e.g., at least `50` pixels or a percentage of the window's dimensions) or verify that the window's title bar is accessible within the display boundary.

### 2.4 Duplicate/Confusing Movie Window titlebar controls
**Where:** [MovieWindowApp.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/MovieWindowApp.tsx#L119-L137)  
**Details:** The header of the popped-out movie window renders both a "Pop back in" button (`LogIn` icon) and a "Close" button (`X` icon). However, both buttons call `requestMovieWindowPopIn()`. Sighted users expect the `X` button to close the session or hide the window, rather than restoring the video layout back to the main window.  
**Recommendation:** Make the `X` close button act as a true close (e.g. close the movie window and pause playback) or remove the duplicate button.

### 2.5 Sync Controller soft-drift correction dead zone
**Where:** [SyncController.ts](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/sync/SyncController.ts#L568-L579)  
**Details:** Inside `correctedRate()`, both `< RESET_DRIFT_SECONDS` (30ms) and `< SOFT_DRIFT_SECONDS` (100ms) branches return the unmodified `basePlaybackRate`. This creates a dead zone under 100ms where rate correction is completely disabled. As a result, drift will always hover around ~100ms, creating a perceptible lip-sync delay.  
**Recommendation:** Implement gradual proportional soft rate correction in the 30ms–100ms range instead of a hard cut-off.

### 2.6 Redundant / Dead code in codebase
**Details:** 
- **`LibraryPanel` component:** [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L2592-L2630) defines a detailed accordion-like component that is never used or rendered in the application.
- **`SyncController` methods:** `bothReady()` and `setVolume()` are unused. `setVolume()` is particularly dangerous as it overrides independent volume settings for reaction and movie streams.
- **Legacy migration cleanup:** `migrateLegacySession()` in `SessionStore` migrates legacy sessions but never deletes the legacy file, which leaves redundant configuration files on the user's filesystem.

---

## P3 — Low-Priority / UX Polish Findings

### 3.1 Relative timestamps are not reactive
**Where:** [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L2774-L2807)  
**Details:** `formatRelativeTime` converts timestamps to relative strings (e.g., "5 minutes ago") but is evaluated only on render. A session card will display stale relative time (e.g. "Just now") indefinitely if the user remains on the library screen.  
**Recommendation:** Implement a periodic force-update timer (e.g. every 60 seconds) in `LibraryHome` to keep dates fresh.

### 3.2 Type and Component Identifier Collision
**Where:** [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L69) and [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L2489)  
**Details:** Both the union type representing sections (`CommandPanelSection`) and the rendering helper component (`CommandPanelSection`) share the same identifier. While compiler namespaces separate them, it causes autocomplete issues and IDE confusion.  
**Recommendation:** Rename the union type to `CommandPanelSectionKey`.

### 3.3 Security Envelope Bypass in Help and Donation links
**Where:** [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L2461) and [App.tsx](file:///c:/Users/nizar/Projects/WatchAlong/src/renderer/src/App.tsx#L2474)  
**Details:** External link buttons invoke standard browser-global `window.open()` instead of routing through the pre-configured `openExternalUrl()` preload bridge API. While caught by Electron handlers, direct renderer-side instantiation of browser popups should be avoided.  
**Recommendation:** Route help and donation links through the preload bridge API.

---

## Verified Audit 3 Fixes

The following issues identified in **Pre-release Audit 3** have been verified as resolved:
1. **Effect Dependency Arrays (P1.1):** Cleaned up. Resize and geometry listeners now properly hook into reference values and dependency arrays, stopping listener thrashing.
2. **Wizard Lifecycle Stale Closures (P1.2):** Resolved. Hook now tracks `canPlayRef` and `isPlayingRef` dynamically, preventing sync states from getting stuck paused.
3. **Adapter State Contamination (P1.3):** Resolved. `RemoteVideoAdapter` only merges remote states on command success.
4. **PiP Focus Accessibility (P2.1):** Resolved. Added `.pip:focus-within` styles to make resize and overlay controls accessible via keyboard Tab key navigation.
5. **Wizard Async Pause Race (P2.3):** Resolved. Synchronous controller pauses are initiated immediately upon wizard trigger.

---

## Recommended Release Gate

| # | Gate | Status |
|---|---|---|
| 1 | All TypeScript typechecks pass | ✅ |
| 2 | All 119 tests pass | ✅ |
| 3 | Clean up unused `useEffect` dependency arrays (from Audit 3) | ✅ |
| 4 | Fix state contamination on remote command failure | ✅ |
| 5 | Pause movie synchronously before import wizard | ✅ |
| 6 | Mount PiP Overlay placeholder when movie popped out (P1.1) | ⬜ |
| 7 | Add Facebook to Patreon Login allowlist (P1.2) | ⬜ |
| 8 | Implement protocol normalize on URL validators (P2.1) | ⬜ |
| 9 | Normalize whitespace split pattern in subtitle parser (P2.2) | ⬜ |
| 10 | Address 1-pixel window overlap retrieval edge-case (P2.3) | ⬜ |
| 11 | Resolve soft-drift correction dead zone (P2.5) | ⬜ |
| 12 | Purge dead code: `LibraryPanel`, `bothReady()`, `setVolume()` | ⬜ |
