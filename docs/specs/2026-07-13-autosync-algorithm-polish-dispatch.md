# Auto-Sync — Algorithm Polish Dispatch

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `feature/v1.1-autosync`
**Predecessors:** [Auto-sync dispatch](./2026-07-12-autosync-dispatch.md) · [Timer-overlay fix](./2026-07-13-autosync-timer-overlay-followup.md)
**Scope:** Four literature-grounded improvements to the matching engine. Each step is independently shippable and corpus-validated. Do them in order.

---

## Why this dispatch exists

The engine works. Across the Universe synced perfectly. X-Men passes after the timer fix. But we're not the first people to solve the picture-in-picture matching problem — there's a decade of published research called Content-Based Video Copy Detection (CBVCD), funded by NIST's four-year [TRECVID CCD benchmark](https://repository.ubn.ru.nl/bitstream/handle/2066/129924/3/129924pre.pdf) (2008–2011). Our exact problem — a movie appearing as a blurred, scaled inset inside a reaction video with text overlays — is **TRECVID Transformation T2 (Picture-in-Picture) with T3 (Insertion) on top.** The techniques that won are known.

We reinvented from first principles and got most of it right. The coarse-grid blur-invariance, the cut-weighted sequence matching, the rate-snapping — all confirmed by the literature. But the field found things we didn't. This dispatch applies four of them, in order of payoff-to-risk.

## What we got right (the literature confirms — don't change these)

- **Coarse-grid downsampling as blur-invariance.** Universal in the field.
- **Cuts as high-signal moments.** The temporal-network literature relies on the same observation.
- **Rate-snapping to common ratios.** *None* of the surveyed literature does this. It's our novel contribution for the reaction-video domain. Keep it.
- **Sub-frame precision via weighted line fit.** HV/TN/DP/TMK all resolve to frame granularity. Our WLS fit gives real-valued offset and slope — better than all of them. Don't abandon it.

## The four steps

### Step 1 — Temporal Ordinal Measure (TOM) channel

**The technique:** [Law-To et al., "Video Copy Detection: a Comparative Study," CIVR 2007](https://www.irisa.fr/vista/Papers/2007_civr_law-to.pdf).

Instead of comparing absolute luma values (which blur, gamma, contrast, and compression shift around), rank a window of frames by a scalar statistic *along the time axis* and compare rank sequences. A rank is invariant to any monotonic transformation — blur preserves the *ordering* of brightness even as it changes the values. The IRISA study found TOM achieved 100% recall with zero false alarms under blur and contrast changes. It's also inherently immune to spatially-localized disturbances — text overlays and face-cam occlusion — because it operates on temporal traces, not spatial cells.

**What to do:** Add a temporal-rank feature to the signature pipeline. For each grid cell (or for the frame's overall statistic), over a window of W consecutive sampled frames, store the rank of the current frame's value among those W. Compare rank sequences between reaction and movie with normalized L1 distance: `(1/C(W)) · Σ|rank_q(j) − rank_r(j)|` where `C(W) = W²/2`. Fuse the TOM distance with the existing spatial-grid distance — don't replace the grid, augment it. The TOM channel handles blur and overlay robustness; the spatial grid handles discrimination and geometry. Together they cover more than either alone.

**Where it lives:** `signatures.ts` gains a temporal-rank computation that operates on sequences of `FrameSignature`. The matching layer (`matching.ts`) gains a TOM-based sequence distance alongside the existing spatial distance. The fusion weight between spatial and temporal is yours to tune — the corpus will tell you the right balance.

**Why this is first:** Highest payoff, lowest risk, cheapest to implement. Directly addresses our two known weak spots (blur and overlays). Composes cleanly with everything we have. Every one of my four research threads independently named this as the top priority.

**Key references:** IRISA comparative study (above) · [Extended TOM with spatially normalized mean](https://www.researchgate.net/publication/251075411_Extended_Temporal_Ordinal_Measurement_Using_Spatially_Normalized_Mean_for_Video_Copy_Detection)

### Step 2 — Burstiness re-weighting (Douze Eq. 13)

**The technique:** [Douze, Jégou, Schmid, Pérez, "Compact Video Description for Copy Detection with Precise Temporal Alignment," ECCV 2010, §4 Eq. 13](https://inria.hal.science/inria-00548641v1/document).

A visually generic scene — a dark room, a credits scroll, a static logo — will match dozens of movie windows with similar confidence. A distinctive scene matches one. Before fitting, reweight each match score to suppress the generic ones:

```
s1(q,r) = s(q,r) / sqrt( Σ_r s(q,r) )      // movie-frame normalization
s2(q,r) = s1(q,r) / sqrt( Σ_q s1(q,r) )    // reaction-frame normalization
```

This divides each match score by the square root of how many strong matches that frame has. Distinctive frames (few strong matches) keep their score; generic frames (many matches) are down-weighted. The paper reports this "significantly improves the quality of the Hough estimation" and it attacks the *cause* of false anchors (non-distinctive frames) rather than rejecting them post-hoc by residual.

**What to do:** Apply this normalization to the match scores before they enter the fitting pipeline. One formula, applied to the similarity data before outlier rejection. It's a pre-filter on the anchors — principled suppression of the false-anchor problem our current MAD-rejection handles crudely.

**Where it lives:** `matching.ts`, in the sequence-matching output, before anchors are passed to `fitting.ts`. The normalization needs the full set of candidate matches (not just the kept anchors), so the match score data needs to flow through.

**Why this is second:** Tiny code change, directly improves anchor quality, makes Step 3 more effective (better-weighted votes). Very low risk.

### Step 3 — 2D Hough vote as consensus gate

**The technique:** [Douze et al. ECCV 2010 §4](https://inria.hal.science/inria-00548641v1/document) · [VCSL benchmark (HV/TN/DP/DTW reference implementations)](https://github.com/alipay/VCSL) · [He et al., "VCSL," CVPR 2022](https://arxiv.org/abs/2203.02654).

Don't probe-then-fit-reject-outliers. Instead, every match votes for an (offset, slope) hypothesis in a 2D Hough accumulator. Offset bins span the plausible offset range; slope bins span `[0.9, 1.1]` in fine steps. Each anchor `(reactionTime, movieTime)` votes, weighted by its confidence, for every (offset, slope) line that passes through it. True matches pile into one bin; false matches scatter across the accumulator. The winning bin seeds the inliers for the final WLS regression.

**Why 2D and not 1D:** The standard temporal Hough is 1D (offset only) and assumes slope = 1. Our problem has real drift — the slope varies. A 1D histogram smears under drift because the offset between reaction and movie *changes over time*. A 2D (offset, slope) accumulator handles drift natively: each anchor votes for the line it supports, and drift-consistent anchors cluster in one (offset, slope) bin regardless of where they sit on the timeline.

**What to do:** Add a Hough voting layer between matching and fitting. The existing WLS fit stays — it gives sub-frame precision that Hough can't. But it runs *after* the vote, on the inliers the vote identified, not on the raw anchor set. The architecture becomes: match → burstiness re-weight → Hough vote → WLS fit on winning bin's inliers → rate-snap → confidence. The literature is unanimous that this is the right shape for low-inlier-ratio cases (10–30% true matches) that plain MAD-rejection struggles with.

**Where it lives:** A new module — `src/main/services/autosync/houghVoting.ts` (pure, testable with synthetic data). `fitting.ts` accepts a seed inlier set from the vote rather than running its own outlier rejection cold. The confidence model shifts toward the Hough literature's "mean similarity along the recovered path" and "peak margin over runner-up" — the VCSL reference implementations all score this way, and it's better-grounded than our current weighted blend.

**Why this is third:** Biggest structural change. Medium risk because it changes the fitting handoff. But the literature converged on this architecture across four independent methods (HV/TN/DP/DTW), and our sub-frame WLS fit stays for the precision step. The corpus gate protects against regressions.

**Key references:** [VCSL reference code](https://github.com/alipay/VCSL) (HV/TN/DP/DTW implementations) · [Tan et al. WACV 2022](https://openaccess.thecvf.com/content/WACV2022/papers/Tan_A_Fast_Partial_Video_Copy_Detection_Using_KNN_and_Global_WACV_2022_paper.pdf) (temporal network with explicit slope band)

### Step 4 — Differential-sign descriptor (MPEG-7 Video Signature)

**The technique:** [MPEG-7 Video Signature Tools (ISO/IEC 15938-3/Amd.4)](https://mpeg.chiaraglione.org/standards/mpeg-7/visual) · [Paschalakis & Iwamoto](https://www.researchgate.net/publication/241638907_The_MPEG7_Video_Signature_Tools_for_Content_Identification).

For each pair of grid cells, store only the *sign* (−1/0/+1) of their luma difference. A frame becomes a ternary bit-string of pairwise cell comparisons. This is invariant to any monotonic per-cell transformation (blur, gamma, compression) because it preserves only the *ordering* relationship between cells, not their values. MPEG reports 96.4% average detection; the image-signature variant achieves 99.29% at <0.05 false-alarm rate.

**What to do:** Add a differential-sign channel to the signature. For each pair of grid cells (i, j), store `sign(L_i − L_j)`. Compare with Hamming-like distance. Fuse with the existing luma/chroma/TOM channels. The pairwise-sign structure also gives flip-tolerance for free if you reverse the pair order under mirroring — which could let us drop the explicit `flipHorizontal` candidate doubling in the geometry search.

**Where it lives:** `signatures.ts` gains a sign-computation pass over the grid. `matching.ts` gains a Hamming-style distance. The fusion weight across all channels (spatial grid, TOM, differential-sign) is tuned against the corpus.

**Why this is last:** It's a signature change that requires re-tuning all the distance metrics and fusion weights. Widest surface area. But it's the commercial-grade robustness standard, and if Steps 1–3 don't close the gap on the hardest pairings, this is the literature's next answer. Defer the decision to use it until after Step 3 is corpus-validated — if the corpus passes cleanly after Steps 1–3, Step 4 becomes a "nice to have for v1.2" rather than a v1.1 requirement.

## The validation discipline

**After each step, run the corpus gate:**

```bash
WATCHALONG_CORPUS=1 npm test
```

The test must continue to pass with no exempted pairs. If a step improves some pairs but regresses others, the fusion weights need tuning before moving on. The corpus table tells you which pairs and which thresholds. Do not proceed to the next step on a failing corpus.

**The shipping bar has not changed:** 90% of verified pairs match to confident or partial, ≤0.5s start error, ≤0.75s end error, ≤2 min/pair, no exempted pairs. But the *goal* of this polish is to raise the bar internally: we want every accessible pair to pass confident, not just 90%, before the Creative Director tests new pairings from outside the library.

## What stays the same

- **The five-module architecture.** No new top-level modules except `houghVoting.ts` in Step 3.
- **The three outcomes** (confident/partial/fallback) and the confidence gate.
- **The pure/isolatable boundary.** Every change in Steps 1–4 is in the pure modules and testable with synthetic data. No ffmpeg, no Electron.
- **The session model and IPC.** Untouched.
- **Rate-snapping and sub-frame WLS precision.** Our novel contributions — keep them.

## The order is load-bearing

Steps 1 and 2 improve the inputs to fitting. Step 3 improves the fitting itself, and it works better when its inputs are burstiness-normalized (Step 2) and TOM-augmented (Step 1). Step 4 is the deepest signature change and is most disruptive to re-tune. Do them in order, validate each against the corpus, and let the data tell you whether the next step is needed.

The forge is yours. The gaps are ours to catch.
