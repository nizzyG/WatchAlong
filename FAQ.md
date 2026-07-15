# Frequently Asked Questions

Looking for setup help? Start with the [README](README.md).

## Philosophy, Legality & Creator Support

### 1. Is WatchAlong legal?

WatchAlong is designed for a use-case that respects everyone involved: you already own the movie, you already pay the creator on Patreon, and the app syncs them locally. It doesn't provide, host, or redistribute movie files or reaction files. It doesn't intentionally bypass DRM.

Some features download reaction files from Patreon or YouTube using links and access you provide. You're responsible for making sure your use complies with copyright law, creator permissions, and platform terms.

The use case — syncing a movie you own with a reaction from a creator you support — is lawful, and it directly benefits the community: creators get paid, movies stay owned, and nobody's data gets harvested.

### 2. I already subscribe to the reactor on Patreon. Does WatchAlong change that?

No. You still need your subscription to download the reaction. WatchAlong just removes the technical hassle of keeping everything in sync. If anything, it makes the subscription more valuable — the content you're paying for becomes effortless to enjoy, which is one more reason to keep supporting the creators you watch.

### 3. Why no Netflix, Disney+, HBO, or other streaming services?

Two reasons. First, WatchAlong is built for media you actually own — files on your drive, not temporary access that can disappear when licenses change. Second, streaming services constantly update their players and DRM, making reliable sync nearly impossible for third-party tools. Local files just work.

### 4. What kind of movie files work?

Any DRM-free local file you're authorized to use. MP4 and WebM with H.264 video and AAC audio work best. MKV and AVI may play depending on their internal codecs.

WatchAlong doesn't rip discs or remove DRM. You're responsible for creating or obtaining files you have the right to play.

### 5. Reactors include timers and countdowns to help viewers sync manually. Does WatchAlong make those unnecessary?

Yes — in the best way. WatchAlong finds the sync automatically, so the countdown becomes a convenience for people who don't have the app rather than a requirement for people who do. The reactor can keep including it; WatchAlong just doesn't need it. And unlike manual sync, the app keeps both videos locked through pauses, seeks, and restarts — no re-syncing, no drift, no juggling two windows.

## Getting Started

### 6. What do I need before using WatchAlong?

Three things: a DRM-free local movie file you're authorized to use, an active Patreon subscription to a reactor with full-length watch-alongs, and the WatchAlong app itself. The app bundles everything it needs — yt-dlp, ffmpeg, node, and patreon-dl. Nothing extra to install.

### 7. How do I get my movie into a local file?

Digital purchases: download the DRM-free file where available (stores like GOG offer these). For more options, HandBrake (free) can re-encode to MP4. WatchAlong doesn't provide guidance on creating copies from physical media — you're responsible for ensuring any local file you use was created lawfully.

### 8. Why don't some of my MKV files play?

MKV is a container — the video and audio streams inside might use codecs Chromium can't decode. If the file plays in Chrome or Edge, it'll play in WatchAlong. If not, re-encoding through HandBrake to MP4 (H.264 + AAC) almost always fixes it.

### 9. What are the keyboard shortcuts?

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / Pause both videos |
| Earbud tap or system Play/Pause | Play / Pause both videos, even when WatchAlong is not focused |
| `←` / `→` | Seek backward / forward 5 seconds |
| `R` | Toggle reaction mute |
| `M` | Toggle movie mute |
| `P` | Toggle PiP visibility |
| `Alt+Enter` | Enter / exit fullscreen (including the popped-out movie window) |
| `[` / `]` | Nudge sync offset by −0.1s / +0.1s |
| `Ctrl+Shift+P` | Open / close the Command Panel from the library or player |
| `↑` / `↓` / `Tab` / `Shift+Tab` / `Enter` / `Esc` | Navigate inside the Command Panel without leaving it |

Playback shortcuts work in the player and are ignored while you're typing or using a control. WatchAlong claims the system Play/Pause key only while a ready pairing is open, then releases it when you return to the library or enter Sync Setup. Fullscreen works in both the library and player, and exits automatically when you leave those primary surfaces.

## Patreon & YouTube Downloading

### 10. Why do I need to provide my Patreon session? Is that safe?

Patreon doesn't provide a public video-download API for subscriber-only watch-along videos. WatchAlong needs to prove you have an active subscription — your browser login cookie contains that proof.

Your session is never sent to WatchAlong-operated servers. It's used locally by WatchAlong and bundled tools to authenticate directly with Patreon. During extraction and download, it may be written temporarily to OS temp files; WatchAlong performs best-effort clearing, removes them during cleanup, and retries crash leftovers during shutdown and startup. This is not forensic erasure on SSDs or backed-up/indexed volumes. If you choose to save it, WatchAlong stores it encrypted with Electron safeStorage, using your operating system's secure storage where available. You can delete the saved session or follow the revocation guidance in [SECURITY.md](SECURITY.md) at any time.

### 11. How do I sign in to Patreon?

Choose **Sign in with browser** to open Patreon securely inside WatchAlong. The window supports Patreon's Google, Facebook, Apple, and email sign-in flows. If you are already signed in to Patreon in Firefox, choose **Use Firefox** for one-click connection instead. No extension or third-party site is involved.

### 12. What if automatic Patreon extraction fails?

Choose **Sign in with browser** instead. Firefox cookie extraction and the in-app Patreon sign-in are the two supported connection paths. After a successful download, WatchAlong can securely save the session so you can skip this step next time.

### 13. Which browsers work for Patreon extraction?

Firefox is the only browser supported for one-click cookie extraction. Everyone else can use **Sign in with browser**, which opens Patreon directly inside WatchAlong.

### 14. I have an unlisted YouTube link. Can I use that?

Yes — paste the unlisted URL and WatchAlong downloads it without a login. Private videos require YouTube authentication, which WatchAlong does not request.

Only download YouTube videos when you have permission from the content owner and when YouTube's terms allow it. WatchAlong doesn't grant rights to download or retain YouTube content.

### 15. What about Google Drive or Vimeo links?

WatchAlong supports local files, Patreon posts, and YouTube links. For Google Drive, Vimeo, or other services, download the file separately and add it as a local reaction.

## Sync, Drift & Frame Rate

### 16. How does automatic sync detection work?

After you load your movie and add a reaction, WatchAlong looks at the reaction video, finds the movie showing inside it, and matches several moments across the runtime. From those matches, it calculates two things at once: the sync point (where the reaction's clock starts relative to your movie) and the frame-rate drift (how fast the two clocks run away from each other). No countdown. No nudging. The app does the work and enters the player already synchronized.

This runs automatically after every new import. You can also re-run it any time from the Timing panel with the **Detect again** button.

### 17. What happens when the app can't find the sync?

Some pairings are harder than others. If the reactor's movie inset is too small, too obscured, or too heavily pixelated for the engine to match confidently, WatchAlong says so and steps aside. You fall back to the manual sync screen and line up the countdown yourself.

The engine never applies a guess. When it isn't confident, it tells you, and you do it by hand. A sync tool that confidently lines you up wrong is worse than one that asks.

### 18. How do I do a manual sync if auto-sync falls back?

Both videos open paused in the Sync Setup screen. Play the reaction, listen for the reactor's countdown ("3... 2... 1... play!"), and click **Save Sync** at the exact moment the countdown ends. Use the `[` and `]` keys to nudge the offset by 0.1 seconds during the first minute. That's it — you never have to sync this pairing again.

### 19. I set the sync perfectly at the start, but by the end they're a few seconds apart. Why?

This is frame-rate drift, and it's the most common sync problem for full-length reactions. Your movie file runs at one speed, the reactor's copy runs at another. Most streaming services and Blu-rays use 23.976 fps (a holdover from NTSC broadcast timing). PAL DVDs from Europe or Australia run at 25 fps — about 4% faster. Some newer streaming originals run at true 24.000 fps. Over a 2-hour movie, a 0.1% difference adds up to about 7 seconds of drift. A 4% difference is far more noticeable.

### 20. How does WatchAlong handle frame-rate drift?

When auto-sync runs, it measures the drift directly from the two videos — no dropdown, no guessing what the reactor's source is. The measured correction is applied automatically.

If you're doing a manual sync instead, you tell WatchAlong what kind of source the reactor is watching from. Locate the **Timing** button near the bottom of the screen. Clicking that will bring up a dialog with three options:

| Option | When to use |
| :--- | :--- |
| **23.976 fps** *(most movies, Blu-ray, streaming)* | The reactor is watching on a standard streaming service or Blu-ray. This covers the vast majority of content. It's the default. |
| **24.000 fps** *(select streaming originals)* | The reactor is watching specific newer originals — some Disney+ series, some Netflix originals. The exception, not the rule. |
| **25.000 fps** *(PAL DVD, European broadcast)* | The reactor is watching a PAL DVD or broadcast from Europe, the UK, or Australia. |

Not sure which one? Leave it on the default and watch for 10-15 minutes. If the reaction creeps ahead or falls behind, try another option.

### 21. I've heard reactors mention NTSC vs PAL. Same issue?

Related. NTSC regions (North America, Japan) used ~24fps or ~30fps. PAL regions (Europe, Australia, much of Asia) used 25fps — about 4% faster. WatchAlong's rate correction handles any constant speed difference between sources.

### 22. Does sync hold if I pause and come back later?

Yes. After the initial sync, pausing stops both videos simultaneously. Resuming picks up from exactly the same point. Behind the scenes, WatchAlong continuously corrects for any accumulated timing differences — invisible to the viewer.

## Library & Appearance

### 23. How do I browse my library?

WatchAlong has three library views: **Pairings** (every movie-and-reactor combination), **By Reactor** (grouped by creator), and **By Movie** (grouped by film). Switch between them from the library header. You can sort each view alphabetically or by date added.

### 24. Does WatchAlong show movie poster art?

Yes — if your movie folders contain standard image files, WatchAlong displays them automatically. The app looks for `poster.jpg`, `poster.png`, `folder.jpg`, `folder.png`, or the movie filename with a `.jpg` or `.png` extension — the same conventions used by Kodi, Jellyfin, Emby, and other media tools. You can also choose a custom poster from any session's context menu.

WatchAlong reads what's already in your library. It never fetches images from the internet.

### 25. Can I change how the app looks?

WatchAlong has two cabinet modes: **Mahogany** (dark) and **Oak** (light). Both use real wood-grain textures and warm tones inspired by home entertainment furniture. The app follows your system preference by default, and you can switch manually from the Command Panel.

### 26. How do I position the PiP?

Drag the overlay by its title bar. Resize from the lower-right corner. Release near a corner and it snaps there. Size and position are saved with your session.

### 27. Can the PiP stay visible in fullscreen?

Yes. When the reaction video enters fullscreen, the movie PiP overlay stays on top where you positioned it.

### 28. How does the pop-out movie window work?

Click the pop-out icon in the PiP toolbar. The movie lifts out into its own window — drag it to a second monitor, resize independently, or fullscreen it. Pop it back in with the pop-in button or by closing the movie window. Sync stays frame-accurate across both windows.

### 29. What's the Command Panel?

Press `Ctrl+Shift+P` (or click the gear icon) from the library or during playback. A solid, focused panel slides in with: Now Playing when applicable, compact Library, active Downloads, Preferences, and Help. Navigate with arrow keys, Tab, or a click.

### 30. I opened a session and got "file can't be found."

The movie or reaction file was moved, renamed, or deleted since the session was created. WatchAlong shows which file is missing and offers a Locate button. Point it to the new location — you won't lose your sync offset.

### 31. My movie has multiple audio tracks. Can I choose which one plays?

Yes. When a movie file contains multiple audio tracks (for example, an original language track and a dub), an audio selector appears near the volume controls in the player. Choose the track you want and it switches instantly. Your selection is saved with the session and carries across to the pop-out movie window.

Not all tracks may appear — the app can only show tracks that Chromium's media engine can decode. Tracks using unsupported codecs won't be listed.

## Privacy & Data

### 32. What data does WatchAlong collect or send anywhere?

None. No telemetry, no analytics, no crash reporter, no server. Your library, playback state, settings, and downloaded files stay on your device. The only network requests are ones you trigger: authenticating with Patreon, or downloading a reaction from YouTube or Patreon.

For a full breakdown of what's stored and where, see [PRIVACY.md](PRIVACY.md).

### 33. Where are sessions, settings, and downloads stored?

Sessions and preferences: JSON files in Electron's standard `userData` directory. Downloaded reactions: your system's Videos folder, in a `WatchAlong/Reactions` subfolder. You can change the download location from the Command Panel.

### 34. If I uninstall, is anything left behind?

Yes, intentionally. Sessions and downloaded reactions stay in the locations above — your library outlasts the app, like documents outlast a word processor. Delete the WatchAlong folders manually if you want to remove everything.

## Troubleshooting

### 35. The app shows a library recovery screen.

A damaged library file can trigger this. WatchAlong moves the damaged file to a recovery location and offers **Show Recovery File**, **Retry**, or **Start New Library** without deleting the preserved copy. Restart the app if this persists.

### 36. YouTube download failed.

Common causes include age restrictions, regional restrictions, a private video (not unlisted), a network interruption, or a downloader problem. WatchAlong reports that the video may be private or restricted; if it is accessible in your browser, try the download again.

### 37. Downloaded Patreon reaction won't play or is corrupted.

Some Patreon content uses DRM. The bundled patreon-dl tool skips DRM-protected files. Check if the reactor offers an unlisted YouTube link or a file you can download separately and add locally.

### 38. Why won't my movie file play?

WatchAlong uses Chromium's media engine, which supports H.264, VP8, VP9, AV1 video and AAC, MP3, Opus, Vorbis audio. Files using H.265 (HEVC) or obscure MKV codecs may not play. Re-encoding through HandBrake to MP4 (H.264 + AAC) fixes it.

### 39. The popped-out movie window stopped responding.

WatchAlong detects unresponsive windows within a few seconds, closes the window, and returns the movie to the main window's PiP overlay. You can pop it back out whenever.

### 40. macOS says WatchAlong can't be opened because it's from an unidentified developer.

This is normal for open-source apps that aren't notarized by Apple (notarization requires a paid Apple Developer account). Right-click the app and select Open. You only need to do this once. WatchAlong's GitHub releases also include checksums you can verify before opening any installer — see the README for instructions.

## Community & Contributing

### 41. How can I support WatchAlong?

Keep supporting the creators whose reactions you watch. That's what the app is for — making their content easier to enjoy, so there's more reason to keep subscribing.

If you'd like to support the developer directly, you can [buy me a coffee on Ko-fi](https://ko-fi.com/watchalong).

### 42. I found a bug or have an idea.

[Open an issue on GitHub](https://github.com/nizzyG/WatchAlong/issues). Describe what you were doing, what you expected, and what happened. Screenshots help.

### 43. Will WatchAlong add support for other services or features?

Bug fixes and quality-of-life improvements are the priority. Major features depend on community interest and available time. The roadmap lives on GitHub.

## Legal & Privacy

- [Disclaimer](DISCLAIMER.md) — the official word on legality, liability, and what you're responsible for
- [Privacy](PRIVACY.md) — exactly what data is stored where, and what isn't
- [Security](SECURITY.md) — how your Patreon session is handled, how to revoke it
- [Third-Party Notices](THIRD_PARTY_NOTICES.md) — licenses for FFmpeg, yt-dlp, Node.js, patreon-dl
