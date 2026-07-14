# Auto-Sync Test Matrix — Expanded

**Generated:** 2026-07-13
**Purpose:** Exhaustive testing of the auto-sync engine. Priority pairings first, then expanded pairings for temporal/layout variety.
**Method:** YouTube channels scanned with yt-dlp, titles cross-referenced against local movie library, Patreon URLs found via web search.

## How to test each one

1. Copy the Patreon URL.
2. Open WatchAlong, create a new WatchAlong with the matching movie file.
3. Paste the URL, connect your Patreon if needed, let it download + auto-sync.
4. Watch the first 5 minutes. Does it sync? Does it drift?
5. If it fails, note the outcome (fallback/partial/confident) and what you see.

---

## Part 1 — Priority pairings (4 movies × 3 reactors = 12 tests)

Same movie across different reactors — tests layout-agnostic matching.

### Tombstone (1993) — 3 reactors

| Reactor | Patreon URL | Status |
|---|---|---|
| Hold Down A | https://www.patreon.com/HoldDownA/posts/tombstone-watch-88502955 | ☐ |
| LiteWeight Reacting | https://www.patreon.com/liteweightgames/posts/tombstone-full-133141809 | ☐ |
| Shanelle Riccio | https://www.patreon.com/shanellericcio/posts/tombstone-watch-89904579 | ☐ |

### V for Vendetta (2005) — 3 reactors

| Reactor | Patreon URL | Status |
|---|---|---|
| Camilla's Corner | https://www.patreon.com/posts/v-for-vendetta-115228430 | ☐ |
| LiteWeight Reacting | https://www.patreon.com/liteweightgames/posts/v-for-vendetta-139304164 | ☐ |
| VKunia | https://www.patreon.com/posts/v-for-vendetta-43557288 | ☐ |

### The Godfather (1972) — 3 reactors

| Reactor | Patreon URL | Status |
|---|---|---|
| Hold Down A | https://www.patreon.com/posts/134946214 | ☐ |
| LiteWeight Reacting | https://www.patreon.com/liteweightgames/posts/godfather-full-138870411 | ☐ |
| VKunia | https://www.patreon.com/posts/godfather-full-110242839 | ☐ |

### Stargate (1994) — 3 reactors

| Reactor | Patreon URL | Status |
|---|---|---|
| Addie Counts | https://www.patreon.com/addiecounts/posts/stargate-full-135622265 | ☐ |
| Hold Down A | https://www.patreon.com/HoldDownA/posts/stargate-1994-yt-134050480 | ☐ |
| LiteWeight Reacting | https://www.patreon.com/posts/stargate-full-151552142 | ☐ |

---

## Part 2 — Expanded pairings (variety testing)

These add a second (or third) movie per reactor to test how layout/blur/timer habits vary across a reactor's content and over time.

### Hold Down A — additional movies

| Movie | Patreon URL | Status |
|---|---|---|
| The Godfather Part 2 (1974) | https://www.patreon.com/HoldDownA/posts/godfather-part-2-88404556 | ☐ |
| Goodfellas (1990) | *(not found via search — browse patreon.com/HoldDownA)* | ☐ |
| Life of Brian (1979) | *(not found via search — browse patreon.com/HoldDownA)* | ☐ |
| Taxi Driver (1976) | *(not found via search — browse patreon.com/HoldDownA)* | ☐ |
| Robin Hood: Men in Tights (1993) | *(not found via search — browse patreon.com/HoldDownA)* | ☐ |

### VKunia — additional movies

| Movie | Patreon URL | Status |
|---|---|---|
| The Godfather Part 2 (1974) | https://www.patreon.com/vkunia/posts/godfather-part-2-125005471 | ☐ |
| Hamilton (2020) | https://www.patreon.com/posts/hamilton-full-136315210 | ☐ |
| Goodfellas (1990) | https://www.patreon.com/vkunia/posts/goodfellas-full-132621595 | ☐ |
| The Raid (2011) | https://www.patreon.com/posts/raid-redemption-134693065 | ☐ |

### Shanelle Riccio — additional movies

| Movie | Patreon URL | Status |
|---|---|---|
| Logan (2017) | *(not found via search — browse patreon.com/shanellericcio)* | ☐ |
| Teenage Mutant Ninja Turtles (1990) | *(not found via search — browse patreon.com/shanellericcio)* | ☐ |

### Camilla's Corner — additional movies

| Movie | Patreon URL | Status |
|---|---|---|
| Eyes Wide Shut (1999) | https://www.patreon.com/posts/eyes-wide-shut-157877847 | ☐ |
| The Departed (2006) | https://www.patreon.com/posts/147802525 | ☐ |

### Addie Counts — additional movies

| Movie | Patreon URL | Status |
|---|---|---|
| Napoleon Dynamite (2004) | https://www.patreon.com/addiecounts/posts/napoleon-full-134856722 | ☐ |
| Taxi Driver (1976) | *(not found via search — browse patreon.com/addiecounts)* | ☐ |

### LiteWeight Reacting — additional movies

| Movie | Patreon URL | Status |
|---|---|---|
| Blazing Saddles (1974) — already in corpus | https://www.patreon.com/liteweightgames/posts/blazing-saddles-133224181 | ☐ (re-test) |

---

## Part 3 — Already in corpus (for reference)

These pairings are already saved in your library with verified sync. The corpus gate tests them automatically.

| Movie | Reactor | Notes |
|---|---|---|
| Across the Universe (2007) | Shanelle Riccio | Musical, drift-critical. Synced perfectly. |
| X-Men: First Class (2011) | Shanelle Riccio | Timer overlay case. Fixed in algo v2. |
| Aladdin (1992) | Camilla's Corner | PAL drift (0.959 rate). Worst start error: 0.372s. |
| Team America (2004) | Shanelle Riccio | Standard case. |
| V for Vendetta (2005) | LiteWeight Reacting | Standard case. |
| Blazing Saddles (1974) | LiteWeight Reacting | Standard case. |
| Anchorman (2004) | Shanelle Riccio | Worst end error: 0.208s. |
| Game of Thrones S3E6 | VKunia | Episode, not movie. |

---

## Summary

- **Priority pairings:** 12 tests (4 movies × 3 reactors)
- **Expanded pairings:** ~14 additional tests (variety per reactor)
- **Already in corpus:** 8 pairings (tested by corpus gate)
- **Total test surface:** ~34 pairings across 7 reactors and 19+ distinct movies

## What the expanded pairings test

- **Temporal variety:** Hold Down A's Godfather vs their Robin Hood — different eras of their editing, potentially different layouts/timers
- **Content variety:** Hamilton (stage recording), The Raid (Indonesian action with subtitles), Eyes Wide Shut (dark/slow Kubrick), Napoleon Dynamite (flat indie comedy), Goodfellas (long takes + voiceover)
- **Same reactor, different movies:** VKunia has 6 pairings (Godfather, Godfather 2, V for Vendetta, Hamilton, Goodfellas, The Raid) — if the engine handles all 6, it's robust to VKunia's specific layout across diverse content
- **Same movie, different reactors:** Tombstone × 3, V for Vendetta × 3, Godfather × 3, Stargate × 3 — tests layout-agnostic matching on identical content

## Links not found via search

Some Patreon posts didn't surface in web search (they're behind paywalls and not well-indexed). For those, browse the creator's Patreon page directly:
- Hold Down A: https://www.patreon.com/HoldDownA
- Shanelle Riccio: https://www.patreon.com/shanellericcio
- Addie Counts: https://www.patreon.com/addiecounts
