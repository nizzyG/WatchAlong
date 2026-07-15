# The Copyright Algorithm We Repurposed

**Format:** YouTube video essay
**Target runtime:** ~14 minutes (~2,000 narration words)
**Voice:** first-person, present tense. Short sentences. No performance.

---

## COLD OPEN

[VISUAL: Black. A single frame fades in — a reaction video. The creator's face fills most of the frame. In a corner, a small, heavily blurred rectangle. Slow push-in on the blur.]

There's a movie in there.

[VISUAL: A detection-style overlay animates over the blurred inset — bounding box, scan lines. The aesthetic deliberately evokes content-ID systems.]

The copyright-enforcement industry spent more than a decade building algorithms to find it. Shrunken, blurred, re-encoded, flipped — they built tools that could identify a copied video no matter what you did to hide it. Find it. Flag it. Remove it.

[beat]

[VISUAL: The overlay rotates 180°. The bounding box turns green. Cut to two windows side by side: the reaction and a crisp movie file, playing in perfect lockstep.]

We took those algorithms and pointed them the other way. Not to find the movie and kill it. To find the movie and sync with it.

[VISUAL: Title card: "The Copyright Algorithm We Repurposed"]

---

## THE PROBLEM

[VISUAL: Montage of reaction-channel content — thumbnails, Patreon tier cards. Nothing identifiable.]

If you know this world, you know the drill. Reactors watch movies on camera. On YouTube, they post the edited cut. The full-length reaction — the complete watch-along, start to finish — lives on Patreon. You pay the creator. You own the movie. And then you become the sync engine.

Two media players. Pause one. Buffer the other. Line up the start. Press play.

The start point is annoying. Two minutes of nudging, once. You live with it.

[VISUAL: Two timeline bars labeled REACTION and YOUR MOVIE. They start aligned. One slowly pulls ahead of the other. A counter shows the gap growing.]

The thing that ruins the experience is what happens forty minutes later. Drift. Your movie and the creator's copy run at slightly different speeds. Over two hours, a fraction of a percent becomes seconds. Your perfect sync decays. You nudge. Five minutes later, you nudge again. For a two-hour film, that's not a feature with a rough edge. That's a broken experience.

I know this pain precisely because it's mine. I don't mind spending two minutes on the start. But if I'm nudging every five minutes for the rest of the film, the night is over.

My first idea was simple. Jump ahead, check the alignment. Jump again, check. Three points, fit a line. The instinct was right — the whole solution really is "fit a line." Three points is just too few. A line through three noisy points is a guess.

What you want is hundreds of points. And it turns out an entire research field spent a decade learning how to get them. For the opposite reason.

---

## THE DISCOVERY

[VISUAL: Academic aesthetic. Paper titles, conference headers: CIVR 2007, ECCV 2010, CVPR 2022. The TRECVID logo.]

The field is called content-based video copy detection. From 2008 to 2011, NIST ran a benchmark called TRECVID where research teams competed to find copied video segments hidden inside other videos.

The benchmark defined a list of transformations — ways the copied video might be disguised. Two of them matter here. Transformation two: picture-in-picture — the copy is shrunk and embedded in a corner. Transformation three: insertion of patterns — text, logos, overlays stamped on top. Plus blur. Plus re-encoding.

[beat]

A shrunken movie in the corner of another video, blurred, with text overlays on top. That is a reaction video. The benchmark the copyright world used to test its detectors is a formal description of the exact artifact reactors upload every week.

Every paper in this literature points one direction. Find the copy so someone can act against it. The funding comes from content protection. The deployments are platform enforcement. Nobody — nobody — in that ecosystem has an incentive to help a viewer sync with the copy. Not because it's hard. Because the money never pointed there.

A decade of published, benchmarked, battle-tested techniques. And an entire class of consumer applications sitting in their shadow, unbuilt. That's not a gap in capability. That's a gap in who the capability was for.

---

## HOW IT WORKS

[VISUAL: Clean pipeline diagram. Stages appear as named: extract frames → build signatures → match sequences → vote → fit a line → snap to a known rate.]

The app is called WatchAlong. Free, open source. The auto-sync engine inside it is a chain of published techniques with two ideas of our own. Everything runs on your machine. That matters more than it sounds — I'll come back to it.

### The load-bearing insight

[VISUAL: A movie frame. Gaussian blur applied progressively — light, medium, heavy. Next to each: the same coarse brightness grid. The grids are nearly identical.]

The whole engine rests on one fact. Downsampling is a low-pass filter.

Shrink a frame to a coarse grid of brightness averages — 16 by 16 cells. You've thrown away the fine detail. Fine detail is exactly what blur destroys. So a light blur and a heavy blur produce nearly the same grid, because the information that would have distinguished them is already gone.

The representation is blur-invariant. For free.

This isn't our discovery — it's a known property in the field. But it's the foundation. Everything else is engineering on top.

And it has an honest boundary. This works because reactors blur, not pixelate. Gaussian blur defeats the high-frequency matching that content-ID relies on. That's why creators use it. But it preserves the low-frequency structure our grid lives on. If reactors ever switch to heavy pixelation, the engine falls back. I'd rather tell you that than pretend we solved it.

### The overlay fix

[VISUAL: The X-Men: First Class case — a timer text box sitting directly on top of the blurred movie inset.]

One reactor placed a timer — a text overlay — directly on the movie inset. Every frame had this static thing stamped on it, poisoning the match.

The fix inverts background subtraction. Classic security-camera logic finds the moving thing against a static background. Our problem is the reverse: the movie changes every frame, and the overlay is the thing that never moves. So measure each grid cell's variance over time. Cells where nothing changes, inside a frame where everything changes? That's not movie. That's overlay. Mask it and match on what remains.

Crucially, the mask has to earn its keep. It's only applied if it actually improves matching consistency. No overlay? No mask. The engine doesn't invent problems to solve.

### The vote

[VISUAL: Scatter plot — candidate matches as dots on a reaction-time vs. movie-time plane. Random scatter, then a diagonal line of dots emerges. A 2D accumulator heatmap; one cell glows.]

Every candidate match is a point: this reaction moment corresponds to this movie moment. If the sync is real, the true matches lie on one straight line. The intercept is your sync point. The slope is your drift.

False matches scatter randomly. They never agree on a line. So the engine runs a two-dimensional vote — every match votes for the slope-and-offset combinations it's consistent with, and the bin where the votes pile up is the answer. Random noise can't conspire.

That winning bin seeds a weighted fit that throws out the outliers. This is my three-point instinct, grown up. Instead of three points and a prayer: hundreds of points, a vote, and a fit.

### The part that's ours

[VISUAL: A number line near 1.0. Seven tick marks for common frame-rate ratios. The fitted slope lands as a dot with an error bar and snaps onto the nearest tick.]

Here's what I'll claim as ours. In all the literature we surveyed, nobody does this.

Academic copy detection treats drift as a continuous number. Measure the slope, report it, done. But real content doesn't run at any speed. It runs at 23.976, 24, or 25 frames per second. The true rate correction between two copies is one of a handful of exact ratios. Twenty-four over twenty-five — the PAL speedup. That's 0.959041.

So after the fit, the engine asks: is the measured slope statistically close enough to one of these known ratios to recognize it? The tolerance comes from the slope's own standard error. Clean fit, tight tolerance. Noisy fit, forgiving tolerance. And the snap only fires if it actually reduces the residuals.

Our Aladdin pairing is the proof. A PAL-sourced reaction. The engine's fit landed within a hair of 23.976-over-25. "Slope: 0.9591" is a number. "This is the PAL speedup" is an understanding. The pure-algorithm literature doesn't have that, because their problem doesn't have discrete answers. Ours does.

---

## THE PROMISE

[VISUAL: Three outcomes: CONFIDENT — both offset and rate applied, press play. PARTIAL — offset applied, rate kept, user confirms. FALLBACK — nothing changed, manual sync.]

Last stage. The engine is not allowed to be binary.

If the fit clears every gate — enough anchors, enough timeline span, residuals under half a second — the outcome is confident. Both the sync point and the drift are applied. You press play.

If the sync point is solid but the drift is marginal, the outcome is partial. The offset is applied. The rate stays. You confirm with a click. The engine will not pretend it's more certain than it is — a partial result's confidence is hard-capped below the confident threshold.

And if the engine isn't sure? Fallback. Nothing changes. You do it by hand.

[beat]

I want to tell you about the pairing that failed. One reactor — Dos Cavazos — doesn't blur her movie inset. She blacks it out entirely. A solid rectangle covers the movie, leaving thin slivers at the edges. The engine cannot see the film. Ninety percent of the inset is pure black. The geometry search, the matching, the fitting — none of it runs, because there's nothing to match against.

The engine fell back to manual sync. And that was correct. That was the confidence gate doing its job on content it was never designed to handle.

One invariant above everything else: no guess is ever applied silently. When the engine isn't sure, it says so, and steps aside.

---

## THE PROOF

[VISUAL: Terminal — the corpus gate running. A results table: pairing, outcome, offset error, end-of-movie error, time.]

The shipping gate is in the repo. It takes my actual library — real reactions, real movies, each pairing's timing verified by eye — and zeroes out every saved sync. Offset zero. Rate one. Cold import. Then it makes the engine re-derive everything from scratch.

The bar: ninety percent of pairings must auto-match. Start-point error under half a second. End-of-movie error — after two hours of accumulated drift — under three-quarters of a second.

Worst start: 0.372 seconds. That's Aladdin, the PAL case. Worst end: 0.208 seconds. Two-tenths of a second across an entire film.

The honest asterisk: thirteen pairings. My library, not the world. Reactors who black out the movie, heavy pixelation, weird crops — the real-world fallback rate is unknown. What I can promise is the shape of the failure. The answer to content the engine can't handle is "I'm not sure" — never a silent wrong guess.

---

## THE PATTERN

[VISUAL: Three quick vignettes. A concert phone recording and a soundboard file. Two broadcasts of the same match. A foreign dub and the original audio.]

One more thought, and it's the reason I made this.

Think about what the engine actually does. It aligns two pieces of media that share content but have been transformed differently. Now look at how many consumer problems have that exact shape. A shaky concert recording and the official soundboard. Two different broadcasts of the same game. A foreign-language dub and the original cut.

In every case, the user has a legitimate relationship with both files. In every case, the copy-detection literature already solved the hard part. And in every case, nobody built the tool, because the funding only flowed toward enforcement.

[beat]

We didn't discover an algorithm. We discovered an audience the algorithms were never allowed to have.

---

## OUTRO

[VISUAL: The app running — import, auto-sync progress, both windows in lockstep. Understated.]

The honest ledger. The techniques are ten to twenty years old. Cited on screen, linked in the description. The computer-vision field would shrug at the algorithms. What's ours is the direction we pointed them, the discrete-rate insight the benchmarks never needed, and a promise no benchmark ever had to make.

WatchAlong is free and open source. MIT licensed. You own your movies. You pay your creators.

[VISUAL: End card. Repo link. Citations: Law-To et al. 2007, Douze et al. 2010, TRECVID CCD 2008–2011.]

Watch who you pay. Own what you watch.

[END]
