# WatchAlong Design Directive — Round 2

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol) — for the next design iteration, not the current bugfix round
**Status:** Design direction agreed with Creative Director, 2026-07-14. Implementation TBD.

---

## The aesthetic: 90s home theater

WatchAlong's visual identity is the golden era of media ownership. The living room with the CRT TV and the VCR stacked underneath. The shelf of VHS tapes you labeled by hand. The Blockbuster Friday night. The physical media you held, owned, and shelved.

This is not nostalgia for its own sake. It's the strongest visual expression of the ownership position. That era was the peak of media as a *tangible possession* — you held the tape, it was yours, nobody could revoke your access when a license expired. The streaming era erased that tangibility. WatchAlong says ownership matters. The 90s living room is what ownership looked like when it was beautiful.

## Reference points

- **Kodi/XBMC themes** — the enthusiast community's design language. Deeply opinionated, artistic, unafraid to look different. Built by people who cared, not by design committees.
- **90s consumer electronics** — CRT TVs, VCRs, cassette decks, amplifier faceplates. Warm materials: beige plastic, brushed aluminum, amber displays, wood-grain.
- **Physical media** — VHS sleeves, Criterion Collection cases, Blockbuster rental cases, hand-labeled tapes.

## The palette constraint: deuteranopia-safe

The Creative Director has severe red-green deuteranopia. The design must not rely on red-green distinctions. The 90s consumer electronics palette is naturally compatible:

- Warm amber (CRT phosphor, LED displays)
- Beige/cream (plastic housings, VHS labels)
- Brushed aluminum / brass (faceplates, knobs)
- Warm dark brown/black (cabinet finishes, VHS tape shells)
- The existing green accent (`#8ee2b1`) — which the Creative Director can see clearly

Avoid: red-green status indicators, color-coded categories that rely on hue alone, brass/copper accents that read as muddy to deuteranopic vision (the round 1 design had this problem).

## What round 1 got wrong (corrected for round 2)

- The warm palette was right; the brass/copper accents were not — they fall on the red-green axis the Creative Director cannot see. Replace with amber/aluminum-axis accents.
- The PiP border was too bright and jarring — it should feel like part of the environment, not a spotlight.
- The corner wording was pretentious editorial flourish — the design should speak through layout and material, not decorative text. Drop it entirely.
- The bright bar at the top of the window was unnecessary visual weight.

## The guiding principles (from the Creative Director)

> "The app standardizes its local conventions to be compatible with the ecosystem. If you use TMDB to organize your library, WatchAlong reads TMDB's naming conventions. If you use Kodi, WatchAlong reads Kodi's. The app is a good citizen of the local-media ecosystem, not a competitor to the tools that manage it."

> "WatchAlong doesn't just say 'own your media' — it says 'we trust that you've already built something worth owning, and we make it look good.' That's a stronger stance than 'we'll help you organize.' It respects the user's existing investment in their library rather than trying to replace it."

The design should feel like a well-made physical object in a 90s living room — warm, tactile, trustworthy, yours. Not a SaaS dashboard. Not a streaming service. A media cabinet.
