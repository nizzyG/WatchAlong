# Audio Track Selection — Build

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

Your diagnosis proved the mechanism. Build it.

## Confirmed

- `AudioVideoTracks` Blink feature unlocks `video.audioTracks` on our Electron 42
- The Raid's six AAC tracks appear with correct labels and languages
- Switching is real — verified by fingerprint, not just a flag change
- Chromium filters out tracks it can't decode (EAC3 hidden, AAC visible)

## Build it

Enable `AudioVideoTracks` narrowly on the main and movie renderer windows via `webPreferences.enableBlinkFeatures`. Never on Patreon/login windows.

Feature-detect at runtime: show the audio track selector only when the video element exposes more than one track. If `audioTracks` is absent or has one track, no selector. The selector is a capability — it appears when it's useful and stays out of the way when it isn't.

Track labels: container label first, language second, "Track N" fallback. The Raid's tracks carry proper language tags — use them.

Persist the selection as a semantic descriptor (label + language + ordinal), not Chromium's generated track ID. Reapply on session reopen and when popping the movie out to its own window. The movie window has its own video element — the selection must carry across.

Place the selector near the volume controls in the player. One click to open, one click to switch, immediate application. If the selected track isn't available on reopen (file changed, codec removed), fall back to the default gracefully.

Confirm the `change` event before treating selection as successful — your recommendation was right.

## The limitation

Some tracks won't appear (EAC3, other unsupported codecs). This is Chromium's filtering, not a bug. Don't try to surface hidden tracks or warn about them. The selector shows what's playable. For files where all tracks are AAC (like The Raid), everything appears. For files with mixed codecs, the user sees a subset. That's honest.

Document the Blink feature dependency — if a future Electron upgrade removes or changes `AudioVideoTracks`, the selector needs to degrade gracefully (hide itself, not crash).
