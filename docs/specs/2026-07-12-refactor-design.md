# WatchAlong Refactor — v1.1 Foundation

**Status:** Approved by Creative Director, 2026-07-12.
**Owner:** Senior Codesmith (Sol), dispatched by the Executive Studio Coordinator.
**Purpose:** Decompose the two monoliths and stage the codebase for automatic sync detection.

---

## Why this refactor exists

WatchAlong's core sync engine — `SyncController`, `timeline.ts`, `commandQueue.ts` — is clean, tested, and finished. The playback engine is not being rewritten. This refactor exists for one reason: **two files have grown large enough to slow down every change that follows them, and v1.1's headline feature needs the slots they don't currently provide.**

The feature coming next is automatic sync detection — an engine that finds the sync point and measures frame-rate drift by matching the blurred movie inset in a reaction against the clear movie file. That engine needs a home. This refactor builds the home before the engine arrives, so the engine is a clean addition to an organized codebase instead of a tangle bolted onto two monoliths.

## What the codebase looks like today

- `src/renderer/src/App.tsx` — **3,011 lines.** Orchestrates layout, 30+ reactive states, dozens of refs, global key listeners, IPC event hooks, and defines 10+ UI components inline.
- `src/main/index.ts` — **1,122 lines.** Single entry point for the main process: window lifecycles, custom protocol, and ~30 IPC handlers all registered inline.
- `src/main/mediaServices.ts` — **929 lines.** Tool resolution, Patreon session vault, browser cookie extraction, and download orchestration in one file.
- `src/shared/session.ts` — Session model at **version 3**, with a clean migration pattern (`normalizeLibrary` reshapes any incoming JSON to the current version on read).

Everything else is reasonably sized. The sync engine (`src/renderer/src/sync/`) is the crown jewel and is not touched.

## The shape this refactor creates

The end state is four organized neighborhoods, each with one clear responsibility:

```
src/main/
  index.ts              ← bootstrap only: app.whenReady, wiring, register calls
  ipc/                  ← one file per IPC category, each exporting a register function
  services/             ← the AutoSync engine's future home
  stores/               ← existing sessionStore.ts, preferencesStore.ts
src/renderer/src/
  App.tsx               ← thin coordinator
  hooks/                ← business logic extracted from App.tsx
  components/           ← UI already partially extracted (PipOverlay, SmartReactionInput)
  services/             ← typed IPC wrapper (optional, see below)
```

The feature needs three things this codebase doesn't have yet. The refactor provides them:

1. **A `src/main/services/` directory** where `AutoSyncService.ts` and its four pure submodules live.
2. **A modular IPC registration pattern** (`src/main/ipc/`) where `autoSyncIpc.ts` plugs in alongside the existing handlers.
3. **A session model migration (v3 → v4)** that adds the auto-sync metadata fields *before* the feature needs them.

## The four phases

Each phase is independently shippable and independently testable. Run them in order. After each phase, `npm run typecheck && npm test` must pass and the app must launch and play a session end-to-end. No phase changes runtime behavior. Every phase is a pure structural move.

### Phase 1 — Renderer UI extraction

Move the inline components declared at the bottom of `App.tsx` into `src/renderer/src/components/`. The existing extracted components (`PipOverlay.tsx`, `SmartReactionInput.tsx`, `pipGeometry.ts`) are the pattern: one component per file, props typed, no behavioral change.

Target components to extract (names are descriptive, not prescriptive — Sol owns the cut lines):

- Command panel
- Rename session dialog
- Delete session dialog
- Startup error state
- Welcome overlay
- Missing-media recovery view
- Library home / grid
- Library session card
- Stream volume control
- Setup scrubber
- Download indicator

**Done when:** `App.tsx` imports these instead of declaring them inline, and the app renders identically.

### Phase 2 — Main process services split

Split `mediaServices.ts` into focused modules under `src/main/services/`:

- **Tool resolution** — executable path lookups for yt-dlp, ffmpeg, ffprobe, node.
- **Patreon session vault** — encryption, decryption, validation of tokens.
- **Download manager** — spawns and manages download child processes.
- **Cookie extraction** — browser detection and session/cookie parsing.

Update imports in `index.ts` to pull from the new locations. The public API of each module stays the same; only the file boundaries move.

**This phase also creates `src/main/services/` as the home for the auto-sync engine.** The directory exists and is organized when Phase 2 lands. `AutoSyncService.ts` and its four pure submodules (signatures, inset geometry, matching, fitting) move in during the feature work — not during this refactor.

**Done when:** `mediaServices.ts` no longer exists (or is a thin barrel re-exporting for backward compat during transition), the four modules compile, all tests pass.

### Phase 3 — Main process IPC and window management isolation

Two moves:

1. **WindowManager.** Wrap the three BrowserWindow lifecycles (`mainWindow`, `wizardWindow`, `movieWindow`) in a class. The window-creation, inter-window positioning, and lifecycle-event code in `index.ts` moves there. `index.ts` calls `windowManager.createMainWindow()` instead of doing it inline.

2. **Modular IPC registration.** Group the ~30 IPC handlers in `index.ts` into category files under `src/main/ipc/`, each exporting a registration function:
   - `sessionIpc.ts` — session library reads/writes, media path operations
   - `preferencesIpc.ts` — preferences read/write, onboarding
   - `downloadIpc.ts` — download start/cancel/progress
   - `movieWindowIpc.ts` — pop-out, geometry, media event proxying
   - `patreonIpc.ts` — session extraction, login window, vault operations
   - `toolsIpc.ts` — tool checks, frame-rate detection

   `index.ts`'s `registerIpc()` becomes a list of `register*Ipc(deps)` calls. The pattern is: each file exports `registerSessionIpc({ sessionStore, mainWindowGetter, ... }): void`. Dependencies are passed in, not imported as singletons.

**Done when:** `index.ts` is a bootstrapper — app lifecycle, store/service instantiation, protocol registration, and a list of `register*()` calls. Nothing else.

### Phase 4 — Renderer hook extraction

Extract state groupings from `App.tsx` into custom hooks under `src/renderer/src/hooks/`. The grouping follows the existing seams in the component:

- **Playback hook** — play/pause, scrubbing, seeking, volume, mute, SyncController instantiation and lifecycle.
- **Session hook** — active session changes, media URL refreshes, metadata loading, rename/delete triggers.
- **Subtitles hook** — cue extraction, loading, clearing, popped-out movie subtitle sync.
- **Downloads hook** — active download tracking, job progress, completion handling.

**Optional, lower priority:** a typed IPC wrapper at `src/renderer/src/services/api.ts` that replaces direct `window.watchAlong` calls. This is a nice-to-have that makes mocking cleaner. If it adds scope without clear payoff, skip it — the existing typed preload bridge is already strong.

**Done when:** `App.tsx` is a thin coordinator that wires hooks and components together.

---

## The session model migration (v3 → v4)

This lands inside the refactor, not inside the feature. The refactor already touches `sessionStore.ts`; carrying the migration here keeps schema changes decoupled from feature code.

### New fields

Add four fields to `LibrarySession`:

| Field | Type | Default for existing sessions |
|---|---|---|
| `timingOrigin` | `'manual' \| 'automatic'` | `'manual'` |
| `autoSyncConfidence` | `number \| null` | `null` |
| `autoSyncAnalyzedAt` | `string \| null` (ISO timestamp) | `null` |
| `autoSyncAlgorithmVersion` | `number \| null` | `null` |

### What they mean

- **`timingOrigin`** records how the current timing values were established. `'manual'` is the default and the fallback. Any later manual save, source-rate selection, or timing nudge flips it back to `'manual'`. `'automatic'` is set only when auto-sync commits a high-confidence result.
- **`autoSyncConfidence`** is the engine's confidence score (0–1) for the last automatic result, or `null` if timing was never auto-measured.
- **`autoSyncAnalyzedAt`** is the ISO timestamp of the last auto-sync run.
- **`autoSyncAlgorithmVersion`** is the integer version of the engine that produced the result. Used to decide whether a stored result is stale and should be re-run when the engine improves.

### How to migrate

The codebase already has the pattern. `session.ts` has `SESSION_LIBRARY_VERSION = 3` and a `normalizeLibrary()` that reshapes any incoming JSON to the current version on every read. Bump to `4`. Extend `normalizeSession()` and `createDefaultSession()` to include the four new fields with their defaults. Existing sessions migrate as `'manual'` with null metadata — their current `offsetSeconds` and `movieRateCorrection` are preserved untouched. No rescans.

### Reset behavior

When either media file is replaced (via `setSessionMedia` or `replaceSessionMedia` with `role: 'movie'` or `'reaction'`), reset `timingOrigin` to `'manual'` and null out the three auto-sync metadata fields. This matches the existing behavior where `detectedMovieFps` is already nulled on movie replacement. The feature will re-run detection after replacement.

---

## What this refactor does not do

- **No runtime behavior change.** Every phase is structural. A user running the app before and after cannot tell the difference.
- **No sync engine changes.** `SyncController.ts`, `timeline.ts`, `commandQueue.ts` are untouched.
- **No auto-sync implementation.** This refactor creates the slots. The feature spec ([2026-07-12-autosync-design.md](./2026-07-12-autosync-design.md)) fills them.
- **No UI/UX changes.** The wizard flow, the player, the library — all behave identically.

## Success criteria

1. `npm run typecheck && npm test` passes after every phase.
2. The app launches, opens a session, plays a watch-along end-to-end after every phase.
3. At phase completion, `App.tsx` is under ~500 lines and `index.ts` is under ~200 lines.
4. `src/main/services/` and `src/main/ipc/` exist and are populated.
5. Session library version is `4`, existing sessions migrate as `'manual'` with null auto-sync metadata, and the app reads pre-existing `library.json` files without error.
6. The four pure module boundaries the feature needs are visible in the directory structure.

---

## Reference: the feature this refactor stages

The auto-sync engine (detailed in the feature spec) splits into five modules. Four are pure TypeScript — no Electron, no filesystem, no ffmpeg:

1. **Signatures** — turns a frame into a coarse brightness grid.
2. **Inset geometry** — finds the movie's position inside the reaction frame.
3. **Matching** — slides reaction signatures against movie signatures to find anchors.
4. **Fitting** — fits a line through anchors with outlier rejection; returns offset, rate, confidence.

The fifth, **AutoSyncService**, is the main-process orchestrator that spawns ffmpeg and calls the four pure modules. It lives in `src/main/services/`. This refactor builds its neighborhood; the feature fills it.

The feature also needs typed IPC channels for start/cancel/progress/completion/fallback, registered through the modular pattern Phase 3 creates. The contract is specified in the feature spec; the registration slot is what this refactor provides.
