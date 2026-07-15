# Audio Track Selection

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`

The Creative Director's copy of The Raid has both the original Indonesian audio and an English dub. The app defaults to the dub because Chromium picks the first track. The user needs to choose.

## The problem

MKV and other containers carry multiple audio tracks — original language, dub, commentary. Chromium's `<video>` element picks the first one and the app has no UI to change it. For foreign films this is a real wound: the user owns the file with the correct audio, but can't select it.

## The constraint

This isn't a simple UI addition. Chromium's `HTMLMediaElement.audioTracks` API is incomplete — it exists in the spec but support is inconsistent, especially for MKV containers (which is the exact use case: The Raid is MKV). We can't ship a selector that silently doesn't work on the format where it's needed most.

## What I need from you first

Before building, verify what's actually possible in our Electron/Chromium version for MKV playback:

- Does `videoElement.audioTracks` enumerate tracks for MKV files served through our `watchalong://` protocol?
- Does toggling the `enabled` property actually switch the audio in real-time, or is it a no-op?
- If the native API doesn't work for MKV, what alternatives are viable? (ffprobe enumeration + media protocol serving a specific track? ffmpeg remux? Something else?)

Report what's possible and what isn't. The UI design follows from the mechanism — if native audioTracks works, the selector is simple. If it requires a deeper pipeline change, scope it honestly.

## The UX (once the mechanism is proven)

An audio track selector accessible from the player. Shows available tracks with their language label (if available from the container metadata). Selection persists with the session. Default to the track that matches the user's locale, or the first track if no locale match.

The selector belongs near the volume controls in the player UI — it's a playback setting, not a library setting. One click to open, one click to switch, immediate application.

## What to save for later

If the mechanism proves too complex for v1.2 (e.g., requires remuxing infrastructure), document the findings and defer to v1.3. The Creative Director wants this feature, but not at the cost of shipping a fragile pipeline. An honest "deferred — here's why" is better than a half-working implementation.
