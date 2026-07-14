# Local-First Movie Art — Dispatch

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol` (continue on this branch)
**Scope:** Surface local movie art in the library views. No network integration. No metadata fetching. Local files only.

---

## The principle

WatchAlong is not a library manager. It does not fetch metadata, download posters, or organize media. It **surfaces** what the user has already organized. If the user's movie library already contains poster art — from TMDB, Kodi, Jellyfin, Emby, or any other media management tool — WatchAlong reads it and displays it. If no art exists, the app shows a clean designed placeholder. The app never reaches out to the internet to fill the gap.

This respects the privacy promise exactly as written: "The only network requests are ones you trigger." No new network calls. No TMDB. No metadata API. Local files only.

## What to build

### 1. Read local art using standard conventions

When displaying a movie in the library (especially the "By Movie" view), check the movie's directory for poster art using the standard conventions the media-management ecosystem already uses. Check, in order:

- `poster.jpg`, `poster.png` (Kodi, Jellyfin, Emby standard)
- `folder.jpg`, `folder.png` (Windows folder art, widely used)
- `<movie-filename>.jpg`, `<movie-filename>.png` (same name as the video file with image extension — common in organized libraries)
- `<movie-filename>-poster.jpg` (Sonarr/Radarr convention)

First match wins. If none found, show the placeholder.

### 2. Manual art picker

In the session card's context menu (or the movie detail view), add a "Choose poster" option that lets the user select a local image file. Store the chosen path on the session (new optional field: `moviePosterPath: string | null`). When set, this overrides the convention-based lookup.

This gives the user full control without any network integration. They pick whatever image they want — a scan of a VHS sleeve, a Criterion Collection cover, a custom crop. It's their library.

### 3. Designed placeholder

When no art is found (no local file, no manual pick), show a clean designed placeholder — not an ugly broken-image icon. The placeholder should be a simple, warm, typographic treatment of the movie title that fits the library's visual language. Something that looks intentional, not like a missing-resource error.

### 4. "By Movie" view integration

The "By Movie" view is the primary surface for movie art. Each movie group shows the poster (or placeholder) prominently, with the reactor pairings listed underneath. This is where the art earns its weight — visual recognition is faster than reading titles, and a library with real posters feels curated.

## What not to build

- **No TMDB integration.** No API calls, no poster downloads, no metadata fetching.
- **No background scanning.** Art is looked up when the library renders, not via a background indexer.
- **No art editing or cropping tools.** The user picks a file; the app displays it.
- **No art for the reaction videos.** This is movie art only, for the "By Movie" view.

## Session model change

Add one optional field to `LibrarySession`:

```
moviePosterPath: string | null
```

Default `null`. When null, the convention-based lookup runs. When set, it overrides. This is a backward-compatible addition — existing sessions default to null and use the convention lookup.

Bump `SESSION_LIBRARY_VERSION` to 5 and migrate existing sessions with `moviePosterPath: null`.

## The design language

The placeholder and the art display should match the design directive's aesthetic (round 2, when ready). For now, the placeholder should use the current color tokens — warm, clean, typographic. It can be refined during the design iteration.

## Success condition

The Creative Director's movie library at `C:\Users\nizar\Videos\Library` contains movie files, many in their own folders. If any of those folders already contain `poster.jpg` or `folder.jpg`, the "By Movie" view should display them automatically with no configuration. Movies without local art should show a clean placeholder. The Creative Director can manually assign a poster to any movie via the context menu.
