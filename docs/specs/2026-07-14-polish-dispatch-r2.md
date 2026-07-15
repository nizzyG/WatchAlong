# WatchAlong — Polish Round 2 + Command Panel Redesign

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The first polish pass landed well. This dispatch combines four quick fixes with one structural redesign. The throughline across all five: the app's UI surfaces were designed for v1.0's manual-sync world, and they haven't caught up to what the app actually is now that auto-sync is the primary flow.

---

## Remove Continue Watching

The Continue Watching shelf renders as an empty bar with nothing visible. The Creative Director's observation is the right one: "Date Added" sort already surfaces recently-watched sessions at the top of the list. The shelf is redundant when it works, and broken right now. Remove it entirely rather than fix it — the sort control does the same job without a dedicated surface.

## Pop-out button inconsistency

There are two pop-out paths — the button on the PiP overlay and a new button in the control bar. They don't do the same thing. The Creative Director popped out from the control bar and couldn't find the window afterward. Both paths should be identical: same behavior, same window placement, same discoverability. One action, one result, regardless of which button the user clicks. Even the floating placeholder once the PiP has been popped out feels wrong now — it's a v1.0 artifact that reads as unfinished in the redesigned app. Rethink the whole pop-out/popped-in visual cycle, not just the button parity.

## "Find Sync Again" is buried

Auto-sync is the headline feature of v1.2. The re-run action — "Detect again" / "Find Sync Again" — is the thing a user reaches for when a sync feels off or they've replaced a file. Right now it's two layers deep in the UI. It should be one click from the primary playback surface. The user paid for this feature; don't make them hunt for it. Rethink the layout and ordering of that panel.

## Alt+Enter for fullscreen

The current fullscreen shortcut is "F." No application the Creative Director has ever used maps fullscreen to a single unmodified letter — Alt+Enter is the universal standard for Windows fullscreen toggling, and it's what muscle memory expects. Replace the binding and update the keyboard shortcut catalog to match. While you're in there, audit any other shortcuts that use non-standard modifiers — the Creative Director specifically called out wanting "standard" shortcuts, meaning the ones that match every other media app most people use.

## Command Panel redesign

The Command Panel (settings) was designed for v1.0. In v1.0, the user manually synced every session, manually selected a frame rate, and manually managed timing. The panel's structure reflects that world: timing controls are prominent, the frame-rate selector is a primary surface, and there's no acknowledgment that auto-sync exists.

The app doesn't work that way anymore. Auto-sync is the primary flow. Most sessions are timed automatically. The frame-rate selector is a fallback for when auto-sync can't find the drift. The panel's information hierarchy needs to reflect what the app actually does — not what it used to do.

When a user opens the Command Panel during playback, the first thing they should understand is the state of their session: is it auto-synced or manually synced? How confident is the sync? When was it last analyzed? That information exists in the session model (`timingOrigin`, `autoSyncConfidence`, `autoSyncAnalyzedAt`, `autoSyncAlgorithmVersion`) — surface it clearly.

The "Find Sync Again" action should be accessible from here or from the timing surface. It's the thing a user reaches for when something feels off. Don't bury it.

The manual timing controls (frame-rate selector, manual offset nudge) are the fallback path. They should still be there and still work, but they're not the primary surface anymore. They belong below the auto-sync status, clearly labeled as manual/fallback options — not presented as the default way to manage timing.

The other panel sections — Now Playing info, compact Library list, Downloads, Preferences — are fine functionally. They need the visual polish to match the library redesign (depth, warmth, the new palette), but the structure doesn't need to change. The timing section is the one that's structurally wrong for v1.2.

**Deuteranopia constraint:** Any status indicators (auto-synced vs. manual, confident vs. fallback) must not rely on color alone — use text labels and icons that carry the meaning, with color as reinforcement only.
