# WatchAlong — Polish Pass

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The app is feature-complete and looks good. This dispatch is about making every interaction feel intentional — the small details that separate a working app from a polished product.

---

## 1. Library sorting

Each library view should have a sort toggle: **Alphabetical** or **Date Added**. Default to Date Added (most recent first) — that's what a returning user wants to see. The toggle lives in the library header next to the view switcher. Each view sorts independently.

## 2. Fullscreen state management

Several rough edges around fullscreen:

- Closing a session from the settings panel while fullscreen leaves the library stuck in fullscreen. The fullscreen state should reset when leaving the player.
- After the library ends up in fullscreen, double-clicking windows it, but it can't be re-fullscreened — only maximized. The fullscreen toggle should work from the library too, or fullscreen should be a player-only state that never leaks into the library.
- Decide the clean model: is fullscreen a player-only state that exits when you leave the player? Or is it a window-level state the user controls independently? Pick one and make it consistent.

## 3. Keyboard shortcuts — clean and universal

Audit all keyboard shortcuts for consistency. The fullscreen behavior above is one symptom; there may be others. Every shortcut should work predictably regardless of what view the user is in. Publish the full list in the Command Panel's Help section so users can discover them without reading the FAQ.

## 4. Player control bar redesign

The current control bar has accumulated weight — transport controls, timeline, volumes, timing, sync setup, playback rate, subtitles, library panel, all in one row. With auto-sync as the primary flow, the manual sync setup button doesn't need prime real estate. Redesign the control bar to prioritize the things a user touches during playback (play/pause, seek, volume, PiP) and tuck the configuration (timing, sync setup, rate) into a cleaner secondary surface.

The control bar should feel like a remote control — the essential controls under your thumb, the settings behind a panel.

## 5. Continue Watching

The library now saves playback positions reliably. Use that data. A returning user who was 45 minutes into a session should see that session surfaced — a "Continue Watching" row or badge on the library home, showing progress and letting them jump back in with one click. This is the highest-value polish item on the list because it's the thing a daily user hits every time they open the app.

## 6. Empty states

Each library view needs a proper empty state when there are no sessions — not just a blank grid. The "By Reactor" view with one session should also look intentional, not half-empty. Design empty and low-count states that feel welcoming, not broken.

## 7. Session card polish

The context menu (rename, delete, choose poster, clear poster) should feel consistent across all three views. Verify the menu works identically whether you're in pairings, by reactor, or by movie. The reactor name edit should be accessible from the card, not buried in a dialog.

When naming or editing a reactor on a session, the user should see a dropdown of reactors already in their library — creators they've previously named or who were auto-identified from download metadata. Selecting from the list should be one click. Free-text entry is still available for new reactors. This turns a typing task into a selection task and reinforces that the library tracks relationships with creators, not just isolated sessions.

## Priority

Items 1-3 are the rough edges a user hits immediately. Items 4-5 are the polish that makes the app feel finished. Items 6-7 are the details that make it feel crafted. Do them in whatever order serves the work — but don't ship without all of them.
