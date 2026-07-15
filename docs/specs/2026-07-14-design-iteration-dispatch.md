# WatchAlong — Design Iteration

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

---

## The feedback

The Creative Director's three words: **too small, tabular, and boring.**

The warm palette was right. The direction is right. The execution is too cautious — it reads like a dark-mode admin panel, not a media library built by someone who loves film. The Creative Director spent years in the Kodi/XBMC theming community and expects that level of craft.

## The vision

A 90s home theater. Warm, tactile, lived-in — the room where you watched rented tapes on a CRT with the lights dimmed. But rendered with modern depth, transparency, and polish. Not a retro pastiche. A media cabinet you'd actually want in your living room today.

The Creative Director is not opposed to the transparency and blur effects from v1 — those were good. They got stripped when the palette changed. Bring depth back, in the warm register.

## Two constraints

1. **Deuteranopia-safe.** The Creative Director has severe red-green deuteranopia. The round-1 brass/copper accents land on the axis he can't see. The green accent (`#8ee2b1`) works — keep it for active states. Everything else: amber, cream, aluminum, warm dark.

2. **No decorative text.** Round 1 had pretentious wording in the corners. Remove it. The design speaks through layout and material.

## Before you start

Research Kodi skins. The Creative Director specifically asked you to look at what that community has built. The best skins — Aeon Nox, Titan, Embuary, AuraMod — have been solving "make a local media library look beautiful" for 20 years. Understand how they handle poster-forward layouts, depth, and visual hierarchy. That's the register.

## What you have

- 38 movies with real poster art in the library
- Three views (pairings, by reactor, by movie) that work functionally
- A warm color token system (`--wa-ink`, `--wa-paper`, `--wa-green`, etc.)
- All QoL features shipped and working

The functional surface is done. This is pure visual craft. Make the library look like a shelf worth browsing.
