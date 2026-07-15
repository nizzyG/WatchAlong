# We Repurposed the Copyright-Enforcement Industry's Own Algorithms to Help You Watch the Creators You Pay

**Format:** YouTube video essay · first-person narration
**Target runtime:** ~17 minutes (~2,700 narration words at ~155 wpm)
**Audience:** technical — engineers, CS-curious viewers, reaction-channel patrons
**Voice notes:** conversational but precise. No hype reads. The tone is "let me show you something," not "you won't BELIEVE this." Pauses marked with [beat].

**How to read this script:** plain text is narration, spoken verbatim. `[VISUAL: …]` lines are production directions — screen captures, animations, B-roll. `[LOWER THIRD: …]` is on-screen text. Every factual claim in this script is verified against the WatchAlong repo; see the fact appendix at the end.

---

## COLD OPEN — 0:00–1:05

[VISUAL: Black. A single video frame fades in — a reaction video: creator's face large, and in the corner, a small, heavily blurred rectangle. Slow push-in on the blurred inset.]

There is a movie hidden inside this video.

[VISUAL: A detection overlay animates over the inset — bounding box, scan lines, "MATCH FOUND" styling. Deliberately evokes content-ID / surveillance aesthetics.]

You can't see it. It's been shrunk into a corner, blurred into soup, and buried under a face cam. But an algorithm can see it. The copyright-enforcement industry spent more than a decade building algorithms for exactly this: find the movie inside another video — no matter how it's been cropped, blurred, flipped, or re-encoded — so it can be flagged, blocked, and removed.

[beat]

[VISUAL: The detection overlay rotates 180°. The "MATCH FOUND" box turns from red to green. Cut to a two-window desktop: reaction video on one side, the viewer's own crisp copy of the movie on the other, playing in perfect lockstep.]

This is the story of how we took those same algorithms and pointed them the other way. Not to find the movie and kill it — to find the movie and sync with it. To help you watch the creators you pay, against the media you own.

They built the detector. We built the companion.

[VISUAL: Title card: "We repurposed the copyright-enforcement industry's own algorithms to help you watch the creators you pay." Hold 3 seconds.]

---

## ACT 1 — THE PROBLEM — 1:05–4:00

[VISUAL: Montage of reaction-channel thumbnails (blurred/anonymized), Patreon-style "full length reactions" tier cards.]

If you've never been inside this corner of the internet: reaction channels watch movies on camera. On YouTube they post edited highlights. But the real product — the thing patrons actually pay for — is the full-length reaction. Two hours of a person you like, watching a movie you love.

And in that full-length version, the movie itself is small and blurred. Not because the creator is lazy. Because that blur is what keeps the video alive. Automated copyright matching killed the alternative years ago. Creators shrink and smear the film until the detectors stop recognizing it.

[VISUAL: Split screen — left: blurred inset in the reaction; right: a Blu-ray case and a local video file. Center: the viewer, mimed as a human metronome, alt-tabbing.]

So here's the deal the audience actually signed up for. You pay the creator. You own the movie. And then you — a human being with a remote in each hand — become the sync engine. You line up your copy of the film with their reaction and press play at exactly the right moment.

Getting the start point right is annoying. But it's the tolerable kind of annoying — two minutes of nudging, once. The thing that actually ruins the experience is what happens forty minutes later.

[VISUAL: Animation — two timeline bars labeled REACTION and YOUR MOVIE, starting aligned, slowly shearing apart. A counter shows the gap growing.]

Drift.

Here's the villain, and it's a fun one: television standards from the analog era. Film runs at 24 frames per second — 23.976 in North America, for legacy reasons that deserve their own video. European television runs at 25. When film gets converted for PAL regions, the standard trick is to just… play it 4% faster. Nobody notices 4% in isolation.

But if your creator's copy came from a PAL source and yours is a Blu-ray, their movie is running 4% faster than yours. Four percent over a two-hour film is roughly five minutes. Your perfectly-aligned start point decays into chaos — a few frames every minute, forever.

[LOWER THIRD: "23.976 fps × (25/24) — the PAL speedup"]

I can tell you the exact shape of this pain, because it's mine: I don't mind spending two extra minutes getting the starting sync perfect. But if it drifts, and I'm nudging a few frames every five minutes, it ruins the entire experience. The sync point is universal pain. The drift is recurring ruin.

[VISUAL: Napkin-sketch animation — three dots on a graph, a wobbly line drawn through them.]

My first instinct was the obvious one: jump ahead, check the alignment, jump again, check again. Three points, fit a line. And that instinct is correct — the whole solution really is "fit a line." The flaw is that three isolated points are noisy, and a line through three noisy points is a guess.

What you actually want is hundreds of points. And it turns out an entire research field spent a decade learning how to get them — for the opposite reason.

---

## ACT 2 — THE INDUSTRY THAT SOLVED THIS BY ACCIDENT — 4:00–6:45

[VISUAL: Academic-paper aesthetic. Scanned figures from CBVCD papers, the TRECVID logo, conference headers: CIVR 2007, ECCV 2010, CVPR 2022. Ken Burns over dense figure diagrams.]

The field is called content-based video copy detection — CBVCD. From 2008 to 2011, NIST ran a benchmark called TRECVID content-based copy detection, where research teams competed to find copied video segments hidden inside other videos, under a standardized list of hostile transformations.

[VISUAL: The TRECVID transformation list as a stylized chart. Highlight two rows.]

And that list of transformations is worth staring at. Transformation number two: picture-in-picture — the copy is shrunk and embedded in a corner of another video. Transformation number three: insertion of patterns — logos, text, and overlays stamped on top. Plus blur, plus re-encoding.

[beat]

A shrunken movie in the corner of another video, blurred, with overlays on top. That is not *similar* to a reaction video. That *is* a reaction video. The benchmark the copyright-enforcement world used to harden its detectors is a formal description of the exact artifact my favorite creators upload every week.

[VISUAL: Flow diagram — money icons flowing from "Content protection" into "CBVCD research," arrows all pointing toward "FIND & REMOVE."]

Now, why did all of this research exist? Follow the incentives. The funding, the benchmarks, the deployments — all of it comes from content protection. Every paper in this literature points the same direction: find the embedded copy so someone can act *against* it. Rights-holders pay for detection. Platforms pay for enforcement.

Nobody — nobody — in that ecosystem has an incentive to help a viewer sync *with* the embedded copy. Not because it's hard. Because the incentive structure never once pointed there. It's a structural blind spot: a decade of published, benchmarked, battle-tested techniques, and an entire class of consumer applications sitting in their shadow, unbuilt.

[VISUAL: The flow diagram's arrows rotate to point the other way, toward a viewer at a desk with two windows.]

We didn't invent new algorithms. I want to be completely upfront about that, and we'll come back to what's ours and what isn't. What we did was notice that a decade of algorithms had never been pointed at users — and then point them.

---

## ACT 3 — HOW IT ACTUALLY WORKS — 6:45–12:30

[VISUAL: Clean diagram of the pipeline, stages appearing as they're named: extract → signatures → match → re-weight → vote → fit → snap → decide.]

So let me show you the machine. It's called WatchAlong — a free, open-source desktop app — and the auto-sync engine inside it is a chain of published techniques with two of our own ideas welded on. Everything runs locally, on your machine, with ffmpeg doing the frame extraction. Hold that thought about "locally" — it matters more than it sounds.

### The load-bearing insight

[VISUAL: A movie frame. Gaussian blur applied progressively — 10px, 30px, 50px. Next to each, its coarse brightness grid. The grids are nearly identical.]

The whole engine rests on one observation: downsampling is a low-pass filter.

Take a frame and shrink it to a coarse grid of brightness averages — the engine's default representation is a 16-by-16 grid, and matching runs as coarse as 12 or even 6. In doing that, you've thrown away all the fine detail. And fine detail is exactly what Gaussian blur destroys. So a light blur and a brutal blur produce *nearly the same grid* — because the information that would have told them apart is already gone. The representation is blur-invariant for free.

That's not our discovery — it's a known property in this field. But it's load-bearing. Every other stage is engineering built on top of that one fact.

And it has an honest boundary, so let me name it now rather than bury it: this works because reactors blur. Gaussian blur defeats the *high-frequency* matching that content-ID systems rely on, which is exactly why creators use it — while leaving the low-frequency structure our grid lives on. If reactors ever switch en masse to heavy pixelation, which destroys the low frequencies too, this engine degrades honestly — more on what "honestly" means in a minute. We checked our corpus frame by frame: it's Gaussian blur out there. We got lucky, and I'd rather tell you that than pretend we didn't.

### Finding the movie

[VISUAL: Screen capture of the engine's geometry phase — scanning the intro of a reaction, locking a bounding box onto the inset.]

First, the engine finds *where* the movie lives inside the reaction frame. And here real-world structure helps us again: reactions are bimodal. The first thirty to ninety seconds — the intro, the title card — typically show the movie unblurred, before the creator's protective blur kicks in. The engine scans that window, locks the inset geometry once, and reuses it for the whole two-hour analysis. Discover once, reuse.

### The overlay problem — my favorite bug

[VISUAL: The X-Men: First Class case — a reaction inset with a countdown timer text box sitting on top of the movie.]

Then a reactor broke it, beautifully. One creator placed a timer — a text overlay — directly on top of the blurred movie inset. Every frame of the movie now had this static thing stamped on it, poisoning the match.

The fix is the piece of this system I find most elegant, because it's background subtraction turned inside out. Classic background subtraction finds the *moving* thing against a static background. Our problem is inverted: the movie changes every frame — it's the *background* that's churning — and the overlay is the thing that never moves. So: measure each grid cell's variance over time, using robust statistics so noise doesn't fool it. Cells where nothing ever changes, sitting inside a frame where everything changes? That's not movie. That's overlay. Mask it — the engine drops a masked cell's weight to 0.06, near zero — and match on what remains.

And crucially, the mask has to earn its keep: it's only applied if it measurably improves matching consistency. If there's no distinct static region, no mask. A quiet, low-motion film scene won't trigger it.

### Matching, the published way

[VISUAL: Two frame strips — reaction inset vs. movie — with grid cells ranked and rank-order lines connecting them.]

The matching itself is standing on shoulders, and I'll name the shoulders.

Temporal ordinal measurement — from Law-To and colleagues, 2007. Instead of comparing raw brightness, rank each grid cell over a window of time and compare the *rank orders*. Rankings survive brightness shifts, color grading, re-encoding. And hard cuts — the moments where everything changes at once — are the highest-signal events in the whole stream, so the engine weights them up.

[LOWER THIRD: "Law-To et al., CIVR 2007 · Douze et al., ECCV 2010"]

Then burstiness re-weighting — Douze and colleagues, 2010, equation 13, used almost verbatim. The problem it solves: some frames match *everything*. Dark scenes, fades, credits — they're promiscuous matchers, and they flood the results with false confidence. The fix is to normalize in both directions: a match is only interesting if this reaction moment is special *for this movie moment*, and vice versa.

### The vote

[VISUAL: Scatter plot animation — hundreds of candidate matches as dots on a (reaction time, movie time) plane. Most scatter randomly; a diagonal line of dots emerges. A 2D accumulator heatmap flashes; one cell glows.]

Now the geometry that makes the noise irrelevant. Every candidate match is a point: this reaction timestamp maps to this movie timestamp. If the sync is real, the true matches all lie on one straight line —

[LOWER THIRD: "movieTime = rate × reactionTime + offset"]

— where the intercept is your sync point and the slope is your drift. False matches scatter randomly; they never agree on a line. So the engine runs a two-dimensional Hough vote: every match votes for the (slope, offset) combinations consistent with it, and the bin where hundreds of votes pile up *is* the answer. Random noise can't conspire. The winning bin then seeds a robust weighted least-squares fit that iteratively throws out the outliers.

This is my three-point instinct, grown up: instead of three points and a prayer, hundreds of points, a vote, and a fit.

### The part that's actually ours

[VISUAL: A number line zoomed around 1.0, with seven tick marks. The fitted slope lands as a dot with an error bar; it snaps onto the nearest tick.]

Here's the piece I'll claim as a real contribution, because in all the literature we surveyed, nobody does it.

Academic copy detection treats drift as a continuous free parameter — measure the slope, report it, done. Because in a benchmark, the slope can be anything. But we're not in a benchmark. In the real world, film content runs at 23.976, 24, or 25 frames per second — and that means the *true* rate correction between two copies is almost always one of a handful of exact ratios. 24 over 25. 25 over 24. 23.976 over 25 — that's 0.959041, the PAL fingerprint.

So after the fit, the engine asks: is the measured slope statistically close enough to one of these known ratios to snap to it? And "close enough" isn't a magic constant — the tolerance is derived from the slope's own standard error: two and a half standard errors, clamped to sane bounds, and the snap is only accepted if it actually *reduces* the residuals. Clean fit, tight tolerance. Noisy fit, forgiving tolerance.

[VISUAL: The Aladdin case on screen — fitted slope with error bar landing on the 0.959041 tick. LOWER THIRD: "(24000/1001) / 25 = 0.959041…"]

Our Aladdin pairing is the poster child: a PAL-sourced reaction, and the engine's fit landed within a hair of 23.976-over-25 — close enough, statistically, to recognize it. That's the difference between a measurement and an explanation. "Slope: 0.9591" is a number. "This is the PAL speedup" is an understanding — and it's domain knowledge the pure-algorithm literature simply doesn't have, because their problem doesn't have discrete answers. Ours does.

### The three outcomes

[VISUAL: Three-door diagram: CONFIDENT (green) / PARTIAL (amber) / FALLBACK (grey), with what each does underneath.]

Last stage, and it's a product decision, not an algorithm: the engine is not allowed to be binary.

If the fit clears every gate — enough anchors, enough of the timeline spanned, median residual under 0.35 seconds, a decisive vote — the outcome is *confident*: offset and rate are applied, and you just press play.

If the sync point is solid but the drift measurement is marginal, the outcome is *partial*: the engine applies the offset, keeps your existing rate, and asks you to double-check. It will not even *pretend* otherwise — a partial result's confidence score is hard-capped at 0.69, so it can never masquerade as confident. This outcome exists because of that pain hierarchy from the top of the video: a reliable start point is worth applying even when the drift is uncertain, because the alternative is you doing it by hand. Benchmarks don't have users. Products do.

And if the engine isn't sure of anything? *Fallback.* It changes nothing, tells you so, and steps aside. Your existing timing is never touched.

One invariant above all of it: no guess is ever applied silently. When the engine recently hit a pairing it couldn't crack and fell back, that wasn't the feature failing. That was the confidence gate doing precisely its job.

---

## ACT 4 — RECEIPTS — 12:30–14:15

[VISUAL: Terminal capture — the corpus gate running: ffmpeg extraction logs, then a results table scrolling: pairing, outcome, offset error, end error, seconds.]

Claims are cheap, so here's the shipping gate.

There's a test in the repo that takes my actual library — real reactions, real movies, each pairing's timing verified by a human eyeball — and does something slightly cruel: it *zeroes out* every saved sync. Offset zero, rate one, as if the pairing had just been imported cold. Then it makes the engine re-derive everything from scratch and compares against the human-verified truth.

The bar to ship: at least 90% of supported pairings must auto-match. Start-point error at most half a second. End-of-movie error — after two hours of accumulated drift — at most three-quarters of a second. And every pairing must finish analysis in under two minutes on real media.

[VISUAL: Results table freeze-frame. Highlight two rows. LOWER THIRD: "worst start: 0.372s · worst end: 0.208s"]

Current results, worst cases: the hardest start point landed 0.372 seconds off — that's Aladdin, the PAL-drift case, the hardest thing in the corpus. The worst end-of-movie error, after roughly two hours of playback, is 0.208 seconds. Two tenths of a second of accumulated error across an entire film. That's the rate-snapping earning its keep — get the slope even slightly wrong and two hours compounds it into failure.

And the honest asterisk: that's thirteen tested pairings. It's my library, not the world. Reactors who never show the movie, weird crops, heavy pixelation — the real-world fallback rate on content we haven't seen is genuinely unknown. What I can promise is the shape of the failure: the engine's answer to content it can't handle is "I'm not sure, here's manual sync" — never a silent wrong guess.

---

## ACT 5 — PRIVACY AS ARCHITECTURE, AND THE BIGGER PATTERN — 14:15–16:45

[VISUAL: Two architecture diagrams side by side. Left: "Research CBVCD" — millions of videos flowing into a server-side signature database, queries hitting it. Right: "WatchAlong" — one laptop, two files, arrows that never leave the box.]

Two closing thoughts, and they're the reason I made this video.

First: your media never leaves your device, and I want you to notice *why* that claim is stronger than the usual privacy checkbox. Copy detection in the research world is server-side, almost by definition — you're scanning millions of uploads against a pre-indexed database of signatures. Our version inverts that too: there is no database. The engine matches your one movie file against your one reaction file, locally, and discards the intermediates. No server exists to send anything to.

Which means the privacy isn't a feature that could be toggled off in a settings menu. It's a constraint that shaped the algorithm — no pre-indexed corpus, no nearest-neighbor lookup, a fundamentally different design. The privacy and the architecture are the same decision, viewed from two angles. Pull one out and the other collapses.

[VISUAL: Three quick vignettes — a phone recording at a concert + a soundboard file; two broadcast feeds of the same match; a foreign-language dub + original audio.]

Second, the pattern this is one instance of. Think about what the engine really does: align two pieces of media that share content but have been transformed differently. Now look how many consumer problems have that exact shape. Your shaky concert video and the official soundboard recording. Two different broadcasts of the same game. A foreign-language dub and the original cut, for language learning.

In every one of those, the user has a legitimate relationship with both files. And in every one, the copy-detection literature already solved the hard part — then never built the tool, because the funding only ever flowed toward enforcement.

[beat]

That's the thesis of this whole project, stated plainly: a decade of copyright-enforcement research created an entire class of consumer applications — and then structurally couldn't see them. We didn't discover an algorithm. We discovered an audience the algorithms were never allowed to have.

---

## OUTRO — 16:45–17:30

[VISUAL: The app in action — a full session: import, auto-sync progress phases ("finding inset… scanning… refining…"), then both windows playing in lockstep. Understated.]

So, is this novel? Here's the honest ledger. The techniques are ten to twenty years old, published, cited on screen and in the description — the computer-vision field would rightly shrug at the algorithms. What's ours is the direction we pointed them, the discrete-rate insight the benchmarks never needed, and a promise no benchmark ever had to make: no guess applied silently.

WatchAlong is free and open source, MIT-licensed. You own your movies. You pay your creators. The link's below — and if you find the pairing that makes it fall back, honestly, I want to hear about it. That's the data that makes it better.

[VISUAL: End card — repo link, MIT license, paper citations: Law-To et al. 2007, Douze et al. 2010, TRECVID CCD 2008–2011.]

Watch who you pay. Own what you watch.

[END]

---

---

## FACT APPENDIX — claim → source (internal, not for screen)

Every on-screen claim, verified against the repo on 2026-07-15:

- **Sync equation** `movieTime = reactionTime × rate + offset` — `docs/specs/2026-07-12-autosync-design.md:19`
- **TRECVID CCD 2008–2011; problem = "T2 (picture-in-picture) + T3 (insertion)"** — `docs/specs/2026-07-13-autosync-algorithm-polish-dispatch.md:13`
- **"Downsampling is itself a low-pass filter"** — `2026-07-12-autosync-design.md:37`
- **Grid: default 16×16 (`createFrameSignature`, clamp [4,32]); matching runs at gridSize 12, geometry at 6** — `src/main/services/autosync/signatures.ts:52-54`, `AutoSyncService.ts:180,326`
- **Bimodal intro (first 30–90s unblurred)** — `2026-07-12-autosync-design.md:30-31`
- **Timer/overlay case: X-Men: First Class; temporal-variance mask; masked-cell weight 0.06; mask kept only if it improves consistency** — `docs/specs/2026-07-13-autosync-timer-overlay-followup.md`, `signatures.ts:237-261`, `insetGeometry.ts:227`
- **TOM (Law-To et al., CIVR 2007); Spearman footrule, C(W)=W²/2** — `signatures.ts:152,183-193`, polish dispatch `:28`
- **Burstiness (Douze et al., ECCV 2010, Eq. 13); two-pass normalization** — `matching.ts:121-143`, polish dispatch `:40-51`
- **2D Hough over (slope, offset); rate range [0.9, 1.1]; offset bin 0.25s; vote weight = burstSimilarity × rawSimilarity; winner seeds WLS** — `houghVoting.ts:53-95,182`
- **Robust WLS, MAD outlier rejection, ≤5 passes** — `fitting.ts:43-71,128`
- **COMMON_MOVIE_RATES incl. (24000/1001)/25 = 0.959041 and 25/24** — `fitting.ts:151`
- **Snap tolerance = min(0.0015, max(0.00003, slopeSE × 2.5)); snap only if residuals improve** — `fitting.ts:161-179`
- **"None of the surveyed literature does this. It's our novel contribution."** — polish dispatch `:20-22`
- **Confident gates: ≥3 anchors, span ≥0.5, median residual ≤0.35s, max ≤0.75s, rate ∈ [0.9,1.1], confidence ≥0.5, consensus checks** — `fitting.ts:111-120`
- **Partial: offset-only commit on initial; confidence hard-capped at 0.69; recheck never overwrites** — `AutoSyncService.ts:140-149`
- **Fallback preserves all timing; "The engine never applies a guess."** — `AutoSyncService.ts:423`, `FAQ.md:103-105`
- **Corpus gate: WATCHALONG_CORPUS=1; zeroes timing; ≥90% match; start ≤0.5s; end ≤0.75s; ≤120s/pair** — `corpusValidation.test.ts:9,29-35,66-75`
- **Worst start 0.372s (Aladdin, PAL 0.959); worst end 0.208s (Anchorman)** — `docs/specs/autosync-test-matrix.md:115,119`
- **"13 tested pairings"** — `docs/specs/2026-07-15-raid-autosync-diagnosis.md:11` (the "7 reactors / ~34 pairings" figure in `autosync-test-matrix.md:126-129` is the broader planned test surface — don't conflate)
- **Raid fallback = "confidence gate working correctly"** — `2026-07-15-raid-autosync-diagnosis.md:7`
- **Privacy: no server, no telemetry; "Never sends media off-device. All analysis is local."** — `PRIVACY.md:3,58-66`, `2026-07-12-autosync-design.md:104,182`
- **Free, open source, MIT** — `package.json` (`"license": "MIT"`), `README.md`
- **AUTO_SYNC_ALGORITHM_VERSION = 2; timingOrigin 'automatic'/'manual'** — `AutoSyncService.ts:30,339`, `src/shared/session.ts:251`

**Deliberately NOT claimed:** the "62.3s slowest run" figure — it exists only as an observed console value, not in the repo; the script says "under two minutes," which is the enforced gate. Reactor names are omitted from narration (movies named, creators not).
