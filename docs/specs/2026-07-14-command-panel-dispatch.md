# WatchAlong — Command Panel Redesign

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

This is a separate dispatch from the round-2 polish items. Do those first — they're quick. This one is bigger.

---

## The problem

The Command Panel (settings) was designed for v1.0. In v1.0, the user manually synced every session, manually selected a frame rate, and manually managed timing. The panel's structure reflects that world: timing controls are prominent, the frame-rate selector is a primary surface, and there's no acknowledgment that auto-sync exists.

The app doesn't work that way anymore. Auto-sync is the primary flow. Most sessions are timed automatically. The frame-rate selector is a fallback for when auto-sync can't find the drift. The panel's information hierarchy needs to reflect what the app actually does — not what it used to do.

## What the panel should communicate

When a user opens the Command Panel during playback, the first thing they should understand is the state of their session: is it auto-synced or manually synced? How confident is the sync? When was it last analyzed? That information exists in the session model (`timingOrigin`, `autoSyncConfidence`, `autoSyncAnalyzedAt`, `autoSyncAlgorithmVersion`) — surface it clearly.

The "Find Sync Again" action — re-running auto-sync — should be accessible from here or from the timing surface (per the round-2 dispatch). It's the thing a user reaches for when something feels off. Don't bury it.

The manual timing controls (frame-rate selector, manual offset nudge) are the fallback path. They should still be there and still work, but they're not the primary surface anymore. They belong below the auto-sync status, clearly labeled as manual/fallback options — not presented as the default way to manage timing.

## The other sections

The panel also has: Now Playing info, a compact Library list, Downloads, and Preferences. Those are fine functionally — they need the visual polish to match the library redesign (depth, warmth, the new palette), but the structure doesn't need to change. The timing section is the one that's structurally wrong for v1.2.

## The constraint

The Creative Director has severe red-green deuteranopia. Any status indicators (auto-synced vs. manual, confident vs. fallback) must not rely on color alone — use text labels and icons that carry the meaning, with color as reinforcement only.
