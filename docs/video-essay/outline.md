# Video Essay — Outline

**Working title:** "The Copyright Algorithm We Repurposed"
**Target runtime:** ~12-15 minutes
**Voice:** first-person, present tense, short sentences. The README voice. No "here's the thing" energy.

---

## The spine

Thesis: copyright-enforcement researchers spent a decade solving our problem from the opposite direction. We pointed their answer the other way. The techniques aren't ours. The direction is.

Emotional arc: frustration (the sync problem) → discovery (the literature exists) → craft (how it works) → proof (the corpus) → conviction (the bigger pattern).

## Structure

### Cold open (0:00-0:45)

The hook in one image and three sentences. A blurred movie inside a reaction video. The copyright industry built algorithms to find and remove it. We used them to sync with it. Title card. Done.

No setup, no "in this video I'm going to tell you about." The image does the work.

### The problem (0:45-3:00)

Two pains, stated from experience. The sync point — annoying but tolerable. The drift — recurring ruin. Frame-rate mismatch explained in plain language. The "three points and a prayer" instinct that started the project.

End on: "an entire research field already solved this. For the opposite reason."

### The discovery (3:00-5:00)

CBVCD. TRECVID. The transformation list that describes a reaction video exactly. The incentive structure that pointed every technique toward enforcement and never toward users.

The structural blind spot: not a gap in capability, a gap in who the capability served.

One sentence that carries the whole section: "Nobody in that ecosystem had an incentive to help a viewer sync with the embedded copy."

### How it works (5:00-9:30)

The mechanism, told honestly. Four beats:

1. **Downsampling is a low-pass filter** — the load-bearing insight. The one fact everything else rests on. Stated plainly, with the honest boundary (works because reactors blur, not pixelate).

2. **The overlay fix** — the timer-mask story. Background subtraction inverted. Specific: X-Men First Class, the pairing that broke the engine, the fix that made it work.

3. **The vote** — the Hough accumulator. The "three points grown up" metaphor. Hundreds of matches vote on one line; false matches can't conspire.

4. **The part that's ours** — rate-snapping to discrete frame rates. The domain knowledge the benchmarks don't have. Aladdin: "This is the PAL speedup" vs "slope: 0.9591."

### The promise (9:30-11:00)

The three outcomes and the one invariant: no guess is ever applied silently. The Dos Cavazos Raid story — the pairing that fell back honestly, because the reactor blacked out the movie entirely. The fallback isn't failure; it's integrity.

### The proof (11:00-12:00)

Short. The corpus gate. Real numbers. The honest asterisk (13 pairings, not the world). "The shape of the failure is the promise: 'I'm not sure' — never a silent wrong guess."

### The bigger pattern (12:00-13:30)

Concert recordings. Multi-broadcast sync. Dub alignment. Each one the same shape: align two media that share content, transformed differently. Each one a consumer application the copyright literature solved and never served.

Thesis stated: "We didn't discover an algorithm. We discovered an audience the algorithms were never allowed to have."

### Outro (13:30-14:00)

The honest ledger. Techniques 10-20 years old, cited. What's ours: the direction, the rate-snapping, the promise. Free, open source, MIT. One line.

"Watch who you pay. Own what you watch."

## What this outline does differently from Fable's

- **Shorter.** Fable's script was ~2,700 words for 17 minutes. This targets ~2,000 for 14. The irony lands faster; the mechanism gets the time it needs; the padding is gone.
- **First-person throughout.** Not "this is the story of how we..." — "I built this because..." The voice belongs to the person who was there.
- **The Raid story earns a place.** Fable's script mentioned the fallback generically. The Raid is a specific, recent, real failure that proves the confidence gate works in production. It belongs in the essay.
- **No "receipts" framing.** The proof section is short and honest, not a defense. The numbers speak for themselves.
- **Fable's fact appendix is preserved.** That work is real and valuable. The narration changes; the facts don't.

## What to keep from Fable's draft

- The structural arc (problem → discovery → mechanism → proof → pattern)
- The visual directions (the cold-open push-in on the blurred inset, the scatter-plot Hough animation, the three-door outcomes diagram)
- The fact appendix (every claim sourced)
- The "audience the algorithms were never allowed to have" line
- The outro: "Watch who you pay. Own what you watch."
