# Frequently Asked Questions

Looking for setup help? Start with the [README](README.md) or the [step-by-step tutorial](tutorial.md).

---

## Philosophy, Legality & Creator Support

### 1. Is WatchAlong legal?

Yes. It plays two files you already own in time with each other. It doesn't distribute, copy, or stream anything, and doesn't circumvent DRM. Reaction videos are original commentary — the reactor is paid through Patreon for their work. You need an active subscription to access that content.

### 2. I already subscribe to the reactor on Patreon. Does WatchAlong change that?

No. You still need your subscription to download the reaction. WatchAlong just removes the technical hassle of keeping everything in sync.

### 3. Why no Netflix, Disney+, HBO, or other streaming services?

Two reasons. First, WatchAlong is built for media you actually own — files on your drive, not temporary access that can disappear when licenses change. Second, streaming services constantly update their players and DRM, making reliable sync nearly impossible for third-party tools. Local files just work.

### 4. What kind of movie files work?

Any DRM-free local file. Most people rip their own Blu-rays or DVDs with MakeMKV, or buy DRM-free downloads from stores like GOG. MP4 and WebM with H.264 video and AAC audio work best. MKV and AVI may play depending on their internal codecs.

### 5. Some reactors include a timer or leave a few seconds of the movie in their video for sync. Do I still need WatchAlong?

Those workarounds exist because syncing manually is painful. WatchAlong automates everything after the initial sync — pause, seek, restart, no re-syncing. Plus you get a proper PiP overlay instead of juggling two windows.

---

## Getting Started

### 6. What do I need before using WatchAlong?

Three things: a local copy of a movie you legally own, an active Patreon subscription to a reactor with full-length watchalongs (or a private YouTube link), and WatchAlong itself. The app bundles yt-dlp, ffmpeg, node, and patreon-dl — nothing extra to install.

### 7. How do I get my movie into a local file?

Physical discs: use MakeMKV (free) to create a DRM-free MKV, then optionally re-encode to MP4 with HandBrake (free). Digital purchases: download the DRM-free file if available.

### 8. Why don't some of my MKV files play?

MKV is a container — the video and audio streams inside might use codecs Chromium can't decode. If the file plays in Chrome or Edge, it'll play in WatchAlong. If not, re-encoding through HandBrake to MP4 (H.264 + AAC) almost always fixes it.

### 9. What are the keyboard shortcuts?

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause both videos |
| `←` / `→` | Seek backward / forward 5 seconds |
| `R` | Toggle reaction mute |
| `M` | Toggle movie mute |
| `P` | Toggle PiP visibility |
| `[` / `]` | Nudge sync offset by −0.1s / +0.1s |
| `Ctrl+Shift+P` | Open / close the Command Panel |
| `↑` / `↓` / `Enter` / `Esc` | Navigate inside the Command Panel |

Shortcuts are ignored when you're typing in a text field.

---

## Patreon & YouTube Downloading

### 10. Why do I need to provide my Patreon session? Is that safe?

Patreon doesn't offer a download button for videos. WatchAlong needs to prove you have an active subscription — your browser login cookie contains that proof. The cookie is used only for that download, never sent anywhere else. If you choose to save it, it's encrypted with your OS keychain (same technology that protects saved passwords).

### 11. Why browser cookies instead of a normal login screen?

Patreon's public API doesn't expose video streams, even for subscribers. WatchAlong uses the same access path your browser uses. The browser-selection flow — no extensions, no third-party sites — is designed to be as transparent as possible.

### 12. What if automatic Patreon extraction fails?

You'll get simple manual instructions: open your browser's Developer Tools (F12), find the `session_id` cookie for `patreon.com`, and paste it. Most people only need to do this once, since WatchAlong offers to save the session. See the [tutorial](tutorial.md#step-5-connect-to-patreon) for a visual walkthrough.

### 13. Which browsers work for Patreon extraction?

Firefox is the most reliable on both Windows and macOS. Chromium-based browsers (Chrome, Edge, Brave, Opera) work on a best-effort basis — recent browser security changes can block extraction. Safari on macOS is manual-only due to macOS restrictions.

### 14. I have a private/unlisted YouTube link. Can I use that?

Yes. Paste the URL into WatchAlong and it downloads the video. No login needed.

### 15. What about Google Drive or Vimeo links?

Not in v1.0. WatchAlong supports local files, Patreon posts, and YouTube links. For other services, download the file separately and add it as a local reaction.

---

## Sync, Drift & Frame Rate

### 16. I set the sync perfectly at the start, but by the end they're a few seconds apart. Why?

Almost certainly the 24.000 vs 23.976 fps mismatch. Streaming services deliver at true 24fps. Blu-ray rips run at 23.976fps (a legacy of NTSC broadcast timing). Over 2 hours, that 0.1% difference adds up to about 7 seconds of drift.

### 17. How do I fix the 24 vs 23.976 drift?

WatchAlong has a Source Rate Correction setting with three presets:

| Preset | Multiplier | When to use |
| :--- | :--- | :--- |
| **Matched** | 1.000× | Both sources run at the same speed |
| **Stream 24 → Blu-ray 23.976** | 1.001× | Reactor watched on a streaming service (24fps), your file is a Blu-ray rip (23.976fps) |
| **Reverse** | 0.999001× | Your file is from a streaming source (24fps), reactor used a Blu-ray (23.976fps) |

Not sure which to use? Listen to the reactor at the start — they'll often mention whether they're watching on streaming or disc. Or leave it on Matched and watch for 10-15 minutes. If the reaction creeps ahead, switch to Stream 24 → Blu-ray 23.976.

### 18. I've heard reactors mention NTSC vs PAL. Same issue?

Related. NTSC regions (North America, Japan) used ~24fps or ~30fps. PAL regions (Europe, Australia, much of Asia) used 25fps — about 4% faster. WatchAlong's rate correction handles any constant speed difference between sources.

### 19. How do I do the initial sync?

After loading your movie and downloading the reaction, both videos open paused in the Sync Setup screen. Play the reaction, listen for the reactor's countdown ("3... 2... 1... play!"), and click Save Sync at the exact moment the countdown ends. Use the `[` and `]` keys to nudge the offset by 0.1 seconds during the first minute. That's it — you never have to sync this pairing again.

The [tutorial](tutorial.md#step-8-the-sync-setup-screen) has screenshots of the full process.

### 20. Does sync hold if I pause and come back later?

Yes. After the initial sync, pausing stops both videos simultaneously. Resuming picks up from exactly the same point. Behind the scenes, WatchAlong continuously corrects for any accumulated timing differences — invisible to the viewer.

### 21. What if I accidentally seek on one video but not the other?

Any seek — on either video — automatically maps both to the correct positions. The timeline mapping keeps everything consistent no matter which video you interact with.

---

## Picture-in-Picture, Pop-Out & Interface

### 22. How do I position the PiP?

Drag the overlay by its title bar. Resize from the lower-right corner. Release near a corner and it snaps there. Size and position are saved with your session.

### 23. Can the PiP stay visible in fullscreen?

Yes. When the reaction video enters fullscreen, the movie PiP overlay stays on top where you positioned it.

### 24. How does the pop-out movie window work?

Click the pop-out icon in the PiP toolbar. The movie lifts out into its own window — drag it to a second monitor, resize independently, or fullscreen it. Pop it back in with the pop-in button or by closing the movie window. Sync stays frame-accurate across both windows.

### 25. What's the Command Panel?

Press `Ctrl+Shift+P` (or click the gear icon) during playback. A translucent overlay slides in with: Now Playing, compact Library, active Downloads, Preferences, and Help. Navigate with arrow keys or click.

### 26. I opened a session and got "file can't be found."

The movie or reaction file was moved, renamed, or deleted since the session was created. WatchAlong shows which file is missing and offers a Locate button. Point it to the new location — you won't lose your sync offset.

---

## Privacy & Data

### 27. What data does WatchAlong collect or send anywhere?

None. No telemetry, no analytics, no crash reporter, no server. Everything lives on your filesystem. The only network requests are ones you trigger: downloading a reaction from YouTube or Patreon.

### 28. Where are sessions, settings, and downloads stored?

Sessions and preferences: JSON files in Electron's standard `userData` directory. Downloaded reactions: your system's Videos folder, in a `WatchAlong/Reactions` subfolder. You can change the download location from the Command Panel.

### 29. If I uninstall, is anything left behind?

Yes, intentionally. Sessions and downloaded reactions stay in the locations above — your library outlasts the app, like documents outlast a word processor. Delete the WatchAlong folders manually if you want to remove everything.

---

## Troubleshooting

### 30. The app is stuck on a loading spinner.

A rare startup issue from corrupted session or preference files. Restart the app — it should show a recovery screen with Retry and Open Library options.

### 31. YouTube download failed.

Common causes: age-restricted, region-blocked, or genuinely private (not unlisted). The error message in WatchAlong will say why.

### 32. Downloaded Patreon reaction won't play or is corrupted.

Some Patreon content uses DRM. The bundled patreon-dl tool skips DRM-protected files. Check if the reactor offers an alternative (private YouTube link, Google Drive).

### 33. Why won't my movie file play?

WatchAlong uses Chromium's media engine, which supports H.264, VP8, VP9, AV1 video and AAC, MP3, Opus, Vorbis audio. Files using H.265 (HEVC) or obscure MKV codecs may not play. Re-encoding through HandBrake to MP4 (H.264 + AAC) fixes it.

### 34. The popped-out movie window stopped responding.

WatchAlong detects unresponsive windows within a few seconds, closes the window, and returns the movie to the main window's PiP overlay. You can pop it back out whenever.

### 35. macOS says WatchAlong can't be opened because it's from an unidentified developer.

This is normal for open-source apps that aren't notarized by Apple (notarization requires a paid Apple Developer account). Right-click the app and select Open. You only need to do this once.

---

## Community & Contributing

### 36. How can I support WatchAlong?

It's free and open source. The best way to support it: support the reactors you love on Patreon. If you want to support development directly, there's a Ko-fi link in the app's Help section.

### 37. I found a bug or have an idea.

[Open an issue on GitHub](https://github.com/nizzyG/WatchAlong/issues). Describe what you were doing, what you expected, and what happened. Screenshots help.

### 38. Will WatchAlong add support for other services or features?

Bug fixes and quality-of-life improvements are the priority. Major features depend on community interest and available time. The roadmap lives on GitHub.
