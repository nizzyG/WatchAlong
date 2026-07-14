# Auto-Sync — Timer Overlay Follow-Up Dispatch

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `feature/v1.1-autosync` (your working tree, uncommitted)
**Predecessor:** `docs/specs/2026-07-12-autosync-dispatch.md`
**Scope:** One focused fix. The engine works. One content layout breaks it.

---

## Where things stand

The Creative Director ran the engine on real content. The verdict:

**Across the Universe (Shanelle Riccio)** — a musical he could never sync by hand, where drift is fatal — **synced perfectly in ~30 seconds, all the way through.** The theory held. The engine works on real content.

**X-Men First Class (Shanelle Riccio)** — **failed twice.** The Creative Director set the sync manually afterward and confirmed there is no drift; the movie stays lined up the whole way. So the content is syncable in principle. The engine is failing to find it.

## The failure mode

The Creative Director looked at the reaction and identified the cause: **the reactor placed her timer text box directly on top of the blurred movie inset.** The timer is a persistent overlay — it sits in the same position, showing bright text, for the entire runtime.

This is not a rare layout. Placing a timer, countdown, or branding text on or near the movie inset is common practice among reactors. The engine must handle it automatically, because this will bite real users.

## Why the current defense doesn't catch it

Your `signatureDistance` already uses a trimmed mean (keep-fraction 0.82) to ignore the worst per-cell errors — the comment names timers and overlays explicitly. That defense works when the overlay covers a small fraction of the inset's cells. It breaks when the overlay is large, or positioned over the inset's high-information region, because the corrupted cells exceed what the trim can remove. At that point the overlay stops being ignorable noise and becomes the dominant feature — it flattens the discrimination signal across candidate offsets because the same bright text is baked into the same cells at every alignment.

## The invariant that fixes it

**The persistent overlay is a low-temporal-variance region.**

The movie cells inside the inset change every frame — brightness shifts, cuts happen, motion. High temporal variance. The timer cells are static text sitting still. Low temporal variance. The overlay reveals itself by not changing.

This is the same architectural pattern you already use for inset geometry: discover a property of the reaction in the body, carry it forward as a mask or constraint. Here, the property is "which cells of the inset are temporally static." Once you know that, those cells can be down-weighted or excluded from the signature distance, per-reaction, adaptively. No timer, no masking. Large timer, large masking. The fix adapts to the content instead of assuming a global overlap fraction.

## Why the cheap fix is wrong

Do not simply lower the trimmed-mean keep-fraction globally. Turning 0.82 into 0.65 to handle a big timer would weaken the signal on *unobstructed* insets — the pairs that currently work, including Across the Universe. That trades one failure for regressions elsewhere. A global knob turned to fix a local problem is a hack. The masking must be per-reaction and driven by the actual overlay geometry.

## What I need from you

1. **Diagnose the X-Men pair specifically.** Run the corpus gate on that pair (`WATCHALONG_CORPUS=1 WATCHALONG_CORPUS_INDEX=8 npm test` — it's the 8th session in the library) and confirm where in the pipeline the failure happens. Is geometry finding the inset but matching failing on the body? Is geometry itself failing because the intro region also has the timer? Know the failure point before you fix it.

2. **Implement per-reaction overlay masking** using the temporal-variance invariant. The shape of the solution is yours — sample the body, find the static cells, carry the mask into signature extraction. Discover once, reuse, same as geometry.

3. **Remove the `knownUnsupported` exemption** for X-Men in `corpusValidation.test.ts` once the pair passes. The honesty was right when we thought it was genuinely unsupported. Now that we have a fix, the exemption becomes a hidden regression. X-Men must pass the same gate as every other pair.

## Success condition

The corpus shipping gate passes with **no exempted pairs.** Every accessible verified pairing matches to confident or partial within tolerance, or falls back honestly because the content is genuinely ambiguous — never because of an overlay we could have handled.

The Creative Director is holding the release until X-Men passes. This is the one known blocker. Fix it and v1.1 ships.

## What stays the same

Everything else. The five-module architecture, the three outcomes, the confidence gates, the pure-module boundaries — all hold. This is a targeted improvement to the signature pipeline, not a redesign. The forge is yours. The gaps are ours to catch.
