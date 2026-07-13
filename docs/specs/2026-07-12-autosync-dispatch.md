# Auto-Sync — Dispatch to the Senior Codesmith

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `feature/v1.1-autosync` (created off main, post-refactor)
**Spec:** `docs/specs/2026-07-12-autosync-design.md` — read it first; this dispatch carries the vision and the invariants, not a tool-inventory.

---

## What you're building

WatchAlong already keeps two videos locked once they're aligned. The sync engine is finished — `SyncController`, `timeline.ts`, `commandQueue.ts` are tested and untouched by the refactor. What's missing is the last manual friction: a user has to find the sync point by eye and guess the frame-rate drift from a dropdown.

You're eliminating both. The engine finds the sync point (the offset) and measures the drift (the rate correction) by matching the movie inset inside a reaction video against the user's clear movie file. One signal — visual similarity between the two files — solves both unknowns. The intercept of the fit is the offset. The slope is the drift.

## The vision

A patron supports a reactor, downloads the reaction, loads their movie, and the app lines them up itself. No nudging. No dropdown. No drift ruining the third act.

The user's library — twelve accessible pairings with manually verified sync points — is your ground truth. The offsets and rate corrections already saved in `library.json` are the numbers your engine must reproduce. That corpus is the shipping gate. When nine in ten pairs match within tolerance, it ships. Until then, you iterate.

## The theory that makes it work

The reactor blurs the movie inset to dodge content matching. Soft Gaussian blur — not pixelation. We verified this by inspecting real frames from four pairs across live-action and animation. The blur destroys fine detail (text, texture) but preserves broad structure: brightness gradients, scene cuts, color blocks, character silhouettes.

Here is the key insight. We don't need to know the reactor's blur amount, because **downsampling is itself a low-pass filter.** When we shrink each frame to a coarse grid — 16×16 blocks, each block the average luminance and color of that patch — we throw away the fine detail that blur would have destroyed anyway. So a 10-pixel blur and a 50-pixel blur produce nearly the same coarse grid, because the fine detail that would have distinguished them is already gone. The representation is automatically blur-invariant. We don't guess their blur and replicate it. We meet both images in a space where the blur stops mattering.

This also carries cut-matching for free. A scene cut is a sudden whole-frame brightness jump — the loudest event in a brightness sequence. Cuts are the highest-confidence moments inside the same coarse grid. The broad brightness sequence (matches through slow scenes) and the cut pattern (matches at sharp transitions) are the same signal at two time-scales. One engine, not two.

## The five modules

Four are **pure TypeScript** — no Electron, no filesystem, no ffmpeg. They take data in, return data out, and test in vitest with synthetic inputs the same way the existing sync engine tests. The fifth is the main-process orchestrator.

### 1. Signatures (pure) — `src/main/services/autosync/signatures.ts`

Turns a decoded frame into a coarse representation that survives blur, scaling, and compression. Input is frame pixels; output is a compact signature (a small grid of luminance/color averages, plus optional edge/motion features). The invariant your tests must prove: the signature of a blurred-and-scaled movie inset is close to the signature of the clear movie frame at the same story moment. Prove this on synthetic grids before any real media is involved.

### 2. Inset geometry (pure) — `src/main/services/autosync/insetGeometry.ts`

Finds where the movie lives inside the reaction frame, in the clean intro window (first ~90 seconds) where it's unblurred. Output is the inset's position, size, and aspect ratio. Geometry discovered in the clean intro is carried into the blurred body unchanged — the reactor blurs the inset, they don't move it. Include full-frame candidates and horizontally-flipped candidates (some reactors mirror the inset). Require geometry to be consistent across several movie sequences before accepting it.

### 3. Matching (pure) — `src/main/services/autosync/matching.ts`

Finds anchors — moments where the reaction and movie are showing the same frame. For each probe timestamp, take a window of reaction signatures and slide it against the movie signature timeline. The best alignment is the match. Cuts within the window contribute the most signal. Output is a set of `{ reactionTime, movieTime, confidence }` anchors. **Match sequences of frames, not single frames.** Single-frame matching is too noisy through blur; the surrounding frames carry the signal.

### 4. Fitting (pure) — `src/main/services/autosync/fitting.ts`

Turns anchors into the offset and rate, with confidence. Fit a line through the anchors with outlier rejection (robust regression). The intercept is the offset; the slope (after dividing by the movie's known frame rate from ffprobe) is the rate correction. Compare the fitted rate against common ratios (23.976/24/25 fps); snap only when the fitted rate is statistically distinguishable from a nearby common rate *and* snapping reduces residual error. Otherwise keep the measured constant rate. **At least three anchors spanning ≥50% of the movie runtime.** A fit from two anchors is a guess, and the engine does not apply guesses.

### 5. AutoSyncService (orchestrator) — `src/main/services/autosync/AutoSyncService.ts`

Drives the pipeline end-to-end. The only module that touches the filesystem and spawns ffmpeg. Probes both files with ffprobe; extracts frames at probe timestamps via ffmpeg; feeds them to the four pure modules in sequence; manages cancellation, staleness (verify the session still references the same paths before committing), and cleanup of temporary artifacts. Never sends media off-device. Register it through the modular IPC pattern the refactor created — `src/main/ipc/autoSyncIpc.ts`, following the dependency-injection shape the other IPC files already use.

## The three outcomes

The engine returns one of three verdicts:

**A — Confident.** At least three anchors pass individual match and runner-up-separation checks; anchors span ≥50% of the movie; median fit residual ≤0.35s; max residual ≤0.75s; fitted rate within `[0.9, 1.1]`. Auto-apply both offset and rate. Set `timingOrigin: 'automatic'` and the metadata fields. Enter the player synced.

**B — Partial.** Offset is confident (intro anchors pass strongly) but drift is marginal (body anchors exist but residuals exceed thresholds). Auto-apply the offset. Pre-select the best-guess rate on the existing reactor-source selector. Drop into manual sync setup with the offset already filled. Half the manual work killed for certain.

**C — Fallback.** Fewer than three anchors pass, or span is insufficient, or fit is too noisy. Preserve existing timing. Enter manual sync setup unchanged. The engine says "I'm not sure" and steps aside.

The confidence gate is the most important invariant in the whole system. **The engine never applies a guess.** When it isn't confident, it says so. A sync tool that confidently lines you up wrong is worse than one that asks you to do it yourself.

## What's already staged for you

The refactor created every slot you need:
- `src/main/services/` exists — your `autosync/` subdirectory goes here.
- `src/main/ipc/` exists with a DI registration pattern — `autoSyncIpc.ts` plugs in like the others.
- Session model is v4 — the four fields (`timingOrigin`, `autoSyncConfidence`, `autoSyncAnalyzedAt`, `autoSyncAlgorithmVersion`) already exist on `LibrarySession`, default to `'manual'`/null, and reset on media replacement or manual timing override. You don't build the migration; you populate fields that already exist.
- `src/renderer/src/hooks/` exists — `useAutoSync` goes here.

## What's out of scope

- **Audio fingerprinting.** The corpus shows movie audio is muted in reactions. Dead code wearing a dependency. Cut.
- **Timecode OCR.** Reactors often burn a timecode in, and it's a reliable drift signal — but reading it means OCR through blur, a second engine to cross-check a first that hasn't proven itself. Defer to phase two.
- **Piecewise synchronization.** Reactions with hard edits or skipped scenes in one source only are unsupported. They fall back.

## The order of work

1. **Pure modules first.** Signatures, geometry, matching, fitting — built and unit-tested with synthetic data. No ffmpeg, no real media. This is where the theory is proven and where the fastest iteration happens.
2. **AutoSyncService second.** Wire ffmpeg extraction to the pure modules. Run against the real corpus (the Creative Director's library at `C:\Users\nizar\Videos\WatchAlong\Reactions`, paired with the movie paths in `library.json`). Tune probe density and confidence thresholds against real pairs.
3. **IPC and session integration third.** Wire the service to the session store and the modular IPC handlers.
4. **Wizard and player UI last.** The "Finding the sync" step, the Timing panel changes, the "Detect again" button.

## Shipping gates

- ≥90% of the accessible corpus pairs (12 pairs) match to a confident or partial outcome.
- Start-alignment error ≤0.5s against the manually verified offset.
- End-of-movie alignment error ≤0.75s (the drift compounding test).
- No known unsupported pair is auto-applied; it must fall back.
- Typical 90–150 minute scans complete within two minutes.
- All existing tests continue to pass.

## The invariants, restated

- Never apply a guess. The confidence gate is load-bearing.
- Never send media off-device. All analysis is local.
- Match sequences, not single frames.
- Discover geometry in the clean intro; carry it into the blurred body.
- At least three anchors spanning half the runtime, or fallback.
- Manual override always wins. The user has the final word.

The vision is a patron who loads their movie and their reaction and never thinks about sync again. The craft is getting the math right on synthetic data, proving it against the corpus, and having the honesty to step aside when it isn't sure.

The forge is yours. The gaps are ours to catch.
