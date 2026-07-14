# WatchAlong Auto-Sync Test Matrix

**Generated:** 2026-07-13
**Purpose:** Exhaustive testing of the auto-sync engine against every available pairing.
**Method:** YouTube channels scanned with yt-dlp (`--flat-playlist`), titles cross-referenced against the local movie library at `C:\Users\nizar\Videos\Library`.

## How to use this list

Each entry below is a movie in your library that a creator you support on Patreon has reacted to on YouTube. The YouTube video confirms they've seen the movie; the full-length watch-along lives on their Patreon.

For each entry:
1. Go to the creator's Patreon page.
2. Find the full-length watch-along post for that movie.
3. Copy the link (Patreon post URL, unlisted YouTube link, or Google Drive link — depending on how they host it).
4. Download it through WatchAlong and test auto-sync.

## Priority test cases

These are the most valuable tests because they stress the engine across different reactors on the same movie:

- **Tombstone** — 3 reactors (Hold Down A, LiteWeight, Shanelle). Same movie, three different layouts.
- **V for Vendetta** — 3 reactors (Camilla, LiteWeight, VKunia).
- **The Godfather** — 3 reactors (Hold Down A, LiteWeight, VKunia). Long film, drift matters.
- **Stargate** — 3 reactors (Addie Counts, Hold Down A, LiteWeight).
- **The Godfather Part 2** — 2 reactors (Hold Down A, VKunia). ~3.5 hours, maximum drift.
- **Aladdin** — 2 reactors (April Reacts To, Camilla). The PAL drift case — already in corpus with Camilla.

---

## Full test matrix

### Addie Counts
- [ ] Taxi Driver (1976)
- [ ] Stargate (1994)
- [ ] Napoleon Dynamite (2004)
- [ ] A Goofy Movie (1995)

### April Reacts To
- [ ] Aladdin (1992)

### Camilla's Corner
- [ ] Eyes Wide Shut (1999)
- [ ] The Departed (2006)
- [ ] Aladdin (1992) — already in corpus, PAL drift case
- [ ] V for Vendetta (2005)

### Hold Down A
- [ ] Robin Hood: Men in Tights (1993)
- [ ] Robin Hood (animated)
- [ ] Napoleon Dynamite (2004)
- [ ] Stargate (1994)
- [ ] Life of Brian (1979)
- [ ] Taxi Driver (1976)
- [ ] Monty Python and the Holy Grail (1975)
- [ ] Tombstone (1993)
- [ ] The Godfather (1972)
- [ ] The Godfather Part 2 (1974)
- [ ] Goodfellas (1990)

### LiteWeight Reacting
- [ ] Stargate (1994) — already in corpus (as "V for Vendetta" session, mislabeled)
- [ ] V for Vendetta (2005) — already in corpus
- [ ] The Godfather (1972)
- [ ] Blazing Saddles (1974) — already in corpus
- [ ] Tombstone (1993)

### Shanelle Riccio
- [ ] Logan (2017)
- [ ] X-Men: First Class (2011) — already in corpus, timer-overlay case
- [ ] Teenage Mutant Ninja Turtles (1990)
- [ ] Team America: World Police (2004) — already in corpus
- [ ] Teenage Mutant Ninja Turtles (1990) — second reaction video, same movie
- [ ] Tombstone (1993)

### VKunia
- [ ] Hamilton (2020)
- [ ] Monty Python and the Holy Grail (1975)
- [ ] The Raid (2011)
- [ ] Goodfellas (1990)
- [ ] The Godfather (1972)
- [ ] The Godfather Part 2 (1974)
- [ ] V for Vendetta (2005)

---

## No matches found

These reactors had no YouTube reactions matching your current movie library:

- **Dos Cavazos** — primarily trailer reactions and different content
- **Pretty Little Dash** — appears to focus on TV/anime rather than the films in your library

---

## Summary

- **7 reactors** with potential pairings
- **39 total candidates** (some movies appear for multiple reactors)
- **19 distinct movies** in your library with at least one available reaction
- **~7 already tested** in the current corpus
- **~32 new pairings** to test

## New content types not yet in corpus

These are the most valuable for stress-testing the engine on content it hasn't seen:

- **Hamilton** (stage recording — unusual visual structure, proscenium framing)
- **Eyes Wide Shut** (deliberate dark/slow cinematography — low-motion scenes)
- **The Departed** (fast-cut crime drama)
- **Logan** (dark, desaturated superhero film)
- **Life of Brian** (1979 comedy — grainy film stock, different era)
- **Robin Hood: Men in Tights** (Mel Brooks comedy — bright, colorful)
- **Goodfellas** (long takes, voiceover, period footage)
- **The Raid** (Indonesian action — fast motion, subtitles)
- **Taxi Driver** (1970s urban noir — dark, grainy)
- **Napoleon Dynamite** (indie comedy — flat, muted cinematography)
