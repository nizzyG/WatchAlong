# WatchAlong Automatic Sync Detection — v1.1 Feature Spec

**Status:** Approved by Creative Director, 2026-07-12.
**Owner:** Senior Codesmith (Sol), dispatched by the Executive Studio Coordinator.
**Prerequisite:** [Refactor complete](./2026-07-12-refactor-design.md). This feature builds on the modules, IPC pattern, and session model v4 the refactor creates.
**Purpose:** Eliminate the two remaining manual tasks in a WatchAlong session — finding the sync point and naming the frame-rate drift — by measuring both automatically from the reaction video's movie inset.

---

## The problem in one paragraph

A patron supports a reactor, downloads the full-length reaction, and loads their own movie file into WatchAlong. To watch, they must do two things by hand: (1) line up the reaction with their movie at the reactor's countdown — the **sync point** — and (2) tell WatchAlong what frame rate the reactor's source was, because a mismatch makes the two drift apart over the runtime. Both are manual. Both are fiddly. The drift one is the recurring ruin: a sync point set once and tweaked for two minutes is tolerable, but a drift that forces nudging every five minutes for a two-hour film is unbearable. This feature measures both automatically and applies them when the engine is confident.

## What the engine measures

WatchAlong already models synchronization as:

```
movieTime = reactionTime × movieRateCorrection + offsetSeconds
```

The engine estimates both values by finding multiple matched moments — **anchors** — where the same movie frame is showing in both the reaction inset and the movie file. Each anchor is a `(reactionTime, movieTime)` pair with a confidence score. Three or more anchors spanning the film fit a line; the line's **intercept is the offset** (sync point) and its **slope is the rate correction** (drift). One signal, two unknowns, both solved by the same work.

## Why matching through blur works

### The corpus finding

The Creative Director's content library (14 saved pairings, 12 fully accessible) was inspected directly. Frames were extracted from the reaction and movie files of four representative pairs spanning live-action, traditional animation, and CGI animation. The finding, consistent across the four inspected pairs (live-action, traditional animation, CGI animation):

- **The first 30–90 seconds of a reaction show the movie unblurred.** The reactor provides a clean reference window for syncing. Timecode overlays are often readable here.
- **The body of the reaction shows the movie under soft Gaussian blur.** Not pixelation, not mosaic — a smooth smear that destroys fine detail (text, texture) but preserves broad structure: shapes, brightness gradients, scene cuts, character silhouettes.

This bimodal structure is the feature's structural fact. The sync point is measurable from the clean intro. The drift requires anchors in the blurred body. The inspection covered four of the twelve accessible pairs; the remaining eight are presumed similar but unverified. The confidence gate and the shipping-corpus validation exist precisely because some pair will eventually surprise us.

### Why coarse signatures survive blur

The engine represents each frame as a coarse grid — think 16×16 blocks, each block the average luminance and color of that patch. This is the key insight: **downsampling is itself a low-pass filter.** Gaussian blur destroys high-frequency detail; downsampling throws it away deliberately. So once both the clear movie and the blurred reaction are reduced to the same coarse grid, the fine detail that would have distinguished a 10-pixel blur from a 50-pixel blur is already gone. The representation is automatically blur-invariant. We do not need to know or replicate the reactor's blur amount.

### Why this representation carries cut-matching for free

A scene cut is a sudden, whole-frame brightness change — the loudest possible event in a brightness sequence. The engine does not need a separate cut-detection pipeline; cuts are the highest-confidence moments inside the same brightness grid. This unifies the two matching intuitions the Creative Director and Coordinator converged on: the broad brightness sequence (matches through slow scenes) and the cut pattern (matches at sharp transitions) are the same signal at two time-scales.

## The engine, in five modules

Four modules are **pure TypeScript** — no Electron, no filesystem, no ffmpeg. They take data in, return data out, and test in vitest with synthetic inputs the same way the existing sync engine tests. The fifth is the main-process orchestrator.

### 1. Signatures (pure)

**What:** Turns a decoded frame into a coarse representation that survives blur, scaling, and compression.

**Input:** Decoded frame pixels (from ffmpeg, passed in as raw data).
**Output:** A compact signature — a small grid of luminance and color averages, plus optional edge/motion features.

**Invariant:** The signature of a blurred-and-scaled movie inset must be close to the signature of the clear movie frame at the same story moment. This is the property that makes matching possible, and it is the property the unit tests prove on synthetic grids before any real media is involved.

### 2. Inset geometry (pure)

**What:** Finds where the movie lives inside the reaction frame.

**Input:** Reaction signatures from the clean intro window (first ~90 seconds, offset-adjusted).
**Output:** The inset's position, size, and aspect ratio within the reaction frame.

**Invariant:** Geometry discovered in the clean intro is carried into the blurred body unchanged. The reactor does not move the inset mid-film; they blur it. One discovery, reused.

**Edge cases:** Multiple candidate regions may score well early. The geometry must be consistent across several movie sequences before it is accepted. Horizontally-flipped candidates are included (some reactors mirror the inset). Full-frame candidates are included (some reactors show the movie full-screen briefly).

### 3. Matching (pure)

**What:** Finds anchors — moments where the reaction and movie are showing the same frame.

**Input:** Reaction signatures, movie signatures, inset geometry, and candidate reaction timestamps to probe.
**Output:** A set of anchors: `{ reactionTime, movieTime, confidence }`.

**How it works:** For each probe timestamp, take a window of reaction signatures (a short run of frames around that point) and slide it against the movie signature timeline. The best alignment — where the brightness-over-time patterns line up — is the match. Cuts within the window contribute the most signal because they are the sharpest features.

**Invariant:** The match must use a *sequence* of frames, not a single frame. Single-frame matching is too noisy through blur; the surrounding frames carry the signal.

### 4. Fitting (pure)

**What:** Turns anchors into the offset and rate, with confidence.

**Input:** The set of anchors with their individual confidences.
**Output:** `{ offsetSeconds, movieRateCorrection, confidence, residualStats }`.

**How it works:** Fit a line through the anchors with outlier rejection (robust regression — e.g., RANSAC or iteratively reweighted least squares). The intercept is the offset; the slope (after dividing by the movie's known frame rate from ffprobe) is the rate correction. Residuals after the fit produce the confidence metrics.

**Snapping:** Compare the fitted rate against common ratios (23.976/24/25 fps conversions). Snap only when the fitted rate is statistically distinguishable from a nearby common rate *and* snapping reduces residual error. Otherwise keep the measured constant rate. Snapping is a refinement, not an assumption.

**Invariant:** The fit must use at least three anchors spanning at least 50% of the movie runtime. A fit from two anchors is not a fit — it is a guess, and the engine does not apply guesses.

### 5. AutoSyncService (main-process orchestrator)

**What:** Drives the pipeline end-to-end. The only module that touches the filesystem and spawns ffmpeg.

**Responsibilities:**
- Probe both files with ffprobe for duration, dimensions, frame rate, stream availability.
- Spawn ffmpeg to extract frames at the probe timestamps, scaled down for signature extraction.
- Feed frames to the four pure modules in sequence: signatures → geometry → matching → fitting.
- Manage cancellation (user can cancel mid-scan).
- Manage staleness: before committing, verify the session still references the same movie and reaction paths that were scanned.
- Write the result to the session store atomically, or signal fallback.
- Clean up all temporary analysis artifacts (extracted frames) on success, failure, and cancellation.

**Invariant:** Never sends media off-device. All analysis is local. The only network requests WatchAlong makes are the ones the user already triggers (Patreon login, reaction download).

**Probe strategy:** Sample duration-relative positions, not fixed 30-minute jumps. The same logic must work for a 22-minute episode and a three-hour film. Concentrate early probes in the clean intro window (offset-agnostic — the engine doesn't know the offset yet, so it scans the first 90–120 seconds densely). Spread drift anchors across the remaining runtime, avoiding black leaders and credits.

---

## The three outcomes

The engine returns one of three verdicts. The application flow branches on it.

### Outcome A — Confident (auto-apply both)

**Condition:** At least three anchors pass individual match and runner-up-separation checks; accepted anchors span at least half the movie; median fit residual ≤ 0.35 seconds; maximum residual ≤ 0.75 seconds; fitted rate within `[0.9, 1.1]`.

**Action:** Atomically persist `offsetSeconds`, `movieRateCorrection`, `timingOrigin: 'automatic'`, and the auto-sync metadata (`autoSyncConfidence`, `autoSyncAnalyzedAt`, `autoSyncAlgorithmVersion`). Enter the player already synchronized.

### Outcome B — Partial (auto-apply offset, suggest rate)

**Condition:** Offset is confident (intro anchors pass strongly) but the drift read is marginal (body anchors exist but residuals exceed the confident thresholds).

**Action:** Auto-apply the offset. Set `movieRateCorrection` to the measured value but flag it as low-confidence. Pre-select the best-guess frame rate on the existing reactor-source selector. Drop into the manual sync setup so the user can confirm the rate with one click instead of finding the sync point by hand.

*Note: Outcome B is the graceful middle. It kills the universal pain (sync point) even when the harder measurement (drift) is uncertain. The Creative Director's instinct — that half the manual work killed for certain is better than all-or-nothing — is preserved here.*

### Outcome C — Fallback (manual)

**Condition:** Fewer than three anchors pass, or anchors don't span enough runtime, or the fit is too noisy to trust.

**Action:** Preserve all existing timing values. Enter the existing manual sync setup unchanged. The engine has nothing confident to offer; it says so and steps aside.

---

## Application integration

### When detection runs

- **Automatically after every new import or reaction replacement.** The wizard shows a dedicated, cancellable "Finding the sync" step. On Outcome A, enter the player synced. On Outcome B or C, enter the manual sync setup (B pre-fills the offset).
- **On demand via "Detect again"** under the Timing controls. Re-runs detection on an existing session. Pauses playback. Retains current timing unless a new high-confidence result succeeds.

### Session model (already migrated by the refactor)

The refactor lands these fields at v4. The feature populates them:
- `timingOrigin: 'manual' | 'automatic'`
- `autoSyncConfidence: number | null`
- `autoSyncAnalyzedAt: string | null`
- `autoSyncAlgorithmVersion: number | null`

### Manual override semantics

Any manual sync save, reactor-source selection, or timing nudge after an automatic result flips `timingOrigin` back to `'manual'`. The user always has the final word. The automatic result's metadata is preserved for reference but no longer governs the timing.

### Media replacement

When either media file is replaced, `timingOrigin` resets to `'manual'` and the auto-sync metadata nulls out (the refactor's `setSessionMedia` / `replaceSessionMedia` already does this). Detection re-runs automatically for the new pairing.

### IPC channels

The feature adds typed channels through the modular IPC pattern the refactor creates:
- `startSessionAutoSync(sessionId)` → begins scan, returns acknowledgement
- `cancelSessionAutoSync(sessionId)` → cancels in-progress scan
- `onAutoSyncProgress` → event: `{ phase, percent, message }`
- `onAutoSyncComplete` → event: `{ outcome, offsetSeconds?, movieRateCorrection?, confidence?, ... }`

Sessions are addressed by ID. Before committing a result, the service verifies the session still references the same movie and reaction paths that were scanned — stale results from a media swap are discarded.

### UI surfaces

- **Wizard:** A "Finding the sync" step, cancellable, with phase and progress. This lives in the wizard flow where `useAutoSync` (a hook extracted in refactor Phase 4) drives it.
- **Player — Timing panel:** For automatic sessions, display "Automatically measured" with the confidence and correction rate. For manual sessions, retain the existing reactor-source controls. A "Detect again" button re-runs detection.
- **No new top-level UI.** The feature slots into existing surfaces.

---

## What is explicitly out of scope for v1.1

- **Audio fingerprinting (ChromaPrint).** The corpus shows movie audio is muted in the reactions. Audio is dead code wearing a dependency for this content. Cut. If a future reactor leaves audio in, revisit.
- **Timecode OCR.** The Creative Director confirmed reactors frequently burn a timecode into the reaction, and it is a reliable drift signal. But reading it means OCR through blur and varying fonts — a second engine to cross-check a first engine that hasn't proven itself yet. Defer to a phase-two refinement: when the image match returns a marginal drift read, a timecode cross-check could break the tie. One engine at a time.
- **Piecewise synchronization.** Reactions with hard edits, skipped scenes, or pauses baked into only one source are unsupported. They fall back to manual rather than introducing segment-based sync in v1.1.
- **Cloud processing.** All analysis is local. No media leaves the device.

---

## Validation

### The corpus as ground truth

The Creative Director's library contains 14 saved pairings with manually verified sync points — the offsets and rate corrections already in `library.json` are ground truth. Twelve pairs are fully accessible on the development machine. This corpus is the shipping gate. The engine must reproduce the known offsets and rates within tolerance on these real pairs.

**Shipping gates:**
- At least 90% of the accessible corpus pairs automatically match to a confident or partial outcome.
- Start-alignment error ≤ 0.5 seconds against the manually verified offset.
- End-of-movie alignment error ≤ 0.75 seconds (the drift compounding test).
- No known unsupported pair is auto-applied; it must fall back.

### Synthetic unit tests for the pure modules

The four pure modules test without ffmpeg and without real media. Generate signature data directly in tests:
- Intro offsets and positive/negative offsets.
- 23.976 / 24 / 25 fps drift scenarios.
- Clear, blurred, scaled, flipped, and timer-obscured insets (synthetic grids that simulate each distortion).
- Static/black scenes, repeated logos, false candidates, insufficient anchor span.
- Cancellation mid-pipeline, stale-session detection.

### Integration tests

- IPC progress events fire in order.
- Wizard auto-sync step completes, cancels, and falls back correctly.
- Successful application persists the right fields atomically.
- Re-run ("Detect again") behaves correctly.
- Manual override flips `timingOrigin` back to `'manual'`.
- Existing playback, session, and sync tests continue to pass.

### Performance target

Typical 90–150 minute scans complete within two minutes on the development machine. ffmpeg frame extraction is the bottleneck; the pure modules are fast. If extraction dominates, reduce sampling density before reducing accuracy.

---

## Assumptions this feature rests on

1. **Reactions contain a visible movie inset** (clear or blurred) for at least the intro and the majority of the runtime. Corpus-verified.
2. **The blur is soft Gaussian**, not heavy pixelation/mosaic. Corpus-verified across four pairs and three content types.
3. **The offset + rate relationship is constant** across the whole runtime. Reactions with edits or skipped scenes in one source only are unsupported and fall back.
4. **High-confidence-only application.** The engine never applies a guess. When it isn't confident, it says so and steps aside.
5. **The refactor is complete first.** This feature does not bolt onto monoliths.

---

## The order of work

This feature assumes the refactor is merged. Given that:

1. **Pure modules first.** Signatures, inset geometry, matching, fitting — built and unit-tested with synthetic data. No ffmpeg, no real media. This is where the theory is proven.
2. **AutoSyncService second.** Wire ffmpeg extraction to the pure modules. Run against the real corpus. Tune probe density and confidence thresholds against real pairs.
3. **IPC and session integration third.** Wire the service to the session store and the modular IPC handlers.
4. **Wizard and player UI last.** The "Finding the sync" step, the Timing panel changes, the "Detect again" button.

The pure modules are where the risk lives and where the fastest iteration happens. Get those right against synthetic data, then prove them against the corpus. Everything downstream is plumbing that the refactor has already staged.
