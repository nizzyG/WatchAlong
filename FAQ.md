# Frequently Asked Questions

New here? Start with the [README](README.md).

## Legality & Creator Support

### 1. Is WatchAlong legal?

You own the movie. You pay for the reaction. The app syncs them on your computer. It doesn't host, distribute, or redistribute either file, and it doesn't strip DRM.

Some features download reaction files from Patreon or YouTube using links and access you provide. You're responsible for making sure your use complies with copyright law, creator permissions, and platform terms.

### 2. Does WatchAlong change my Patreon subscription?

No. You still need your subscription to download the reaction. WatchAlong just removes the technical hassle of keeping everything in sync. If anything, it makes the subscription worth keeping, because the content you're paying for becomes effortless to actually watch.

### 3. Why no Netflix, Disney+, HBO, or other streaming services?

Two reasons. First, WatchAlong is built for media you actually own, files on your drive, not temporary access that can disappear when licenses change. Second, streaming services constantly update their players and DRM, making reliable sync nearly impossible for third-party tools. Local files just work.

## Getting Started

### 4. What do I need before using WatchAlong?

Three things: a DRM-free local movie file you're authorized to use, an active Patreon subscription to a YouTube reactor with full-length watch-alongs, and the WatchAlong app itself. The app bundles everything it needs (yt-dlp, ffmpeg, node, patreon-dl). Nothing extra to install.

### 5. What kind of movie files work?

Any DRM-free local file you're authorized to use. MP4 and WebM with H.264 video and AAC audio work best. MKV and AVI may play depending on their internal codecs.

WatchAlong doesn't rip discs or remove DRM. You're responsible for creating or obtaining files you have the right to play.

### 6. How do I get my movie into a local file?

Digital purchases: download the DRM-free file where available (stores like GOG offer these). For more options, HandBrake (free) can re-encode to MP4. WatchAlong doesn't provide guidance on creating copies from physical media. You're responsible for ensuring any local file you use was created lawfully.

### 7. Why won't my movie file play?

WatchAlong uses Chromium's media engine, which supports H.264, VP8, VP9, AV1 video and AAC, MP3, Opus, Vorbis audio. MKV is just a container. The video and audio inside it might use codecs Chromium can't decode. If the file plays in Chrome or Edge, it'll play in WatchAlong. Files using H.265 (HEVC) or obscure MKV codecs may not play. Re-encoding through HandBrake to MP4 (H.264 + AAC) almost always fixes it.

### 8. What are the keyboard shortcuts?

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
| `Ctrl+,` (`⌘+,` on macOS) | Open / close the Control Panel from the library or player |
| `↑` / `↓` / `Tab` / `Shift+Tab` / `Enter` / `Esc` | Navigate inside the Control Panel without leaving it |

Playback shortcuts work in the player and are ignored while you're typing or using a control. WatchAlong claims the system Play/Pause key only while a ready pairing is open, then releases it when you return to the library or enter Sync Setup. Fullscreen works in both the library and player, and exits automatically when you leave those surfaces.

## Patreon & YouTube Downloading

### 9. Why do I need to provide my Patreon session? Is that safe?

Patreon doesn't offer a download API for subscriber-only videos. WatchAlong uses your login cookie to prove you're subscribed, then downloads directly from Patreon. The cookie stays on your machine. It's never sent to a WatchAlong server (there isn't one).

If you choose to save it, WatchAlong stores it encrypted using your operating system's secure storage. Temporary files created during download are cleaned up after use. This isn't forensic erasure on SSDs or backed-up volumes. You can delete the saved session or revoke it anytime. See [SECURITY.md](SECURITY.md) for revocation steps.

### 10. How do I sign in to Patreon?

Two paths. Choose **Sign in with browser** to open Patreon securely inside WatchAlong. The window supports Patreon's Google, Facebook, Apple, and email sign-in flows. Or, if you're already signed in to Patreon in Firefox, choose **Use Firefox** for one-click connection. Firefox is the only browser supported for one-click extraction. No extension or third-party site is involved.

### 11. What if Patreon extraction fails?

Choose **Sign in with browser** instead. That's the other supported path, and it works independently of your browser cookies. After a successful download, WatchAlong can securely save the session so you can skip this step next time.

### 12. Can I use an unlisted YouTube link?

Yes. Paste the unlisted URL and WatchAlong downloads it without a login. Private videos require YouTube authentication, which WatchAlong does not request.

Only download YouTube videos when you have permission from the content owner and when YouTube's terms allow it.

### 13. What about Google Drive or Vimeo links?

WatchAlong supports local files, Patreon posts, and YouTube links. For Google Drive, Vimeo, or other services, download the file separately and add it as a local reaction.

## Sync, Drift & Frame Rate

### 14. How does automatic sync detection work?

After you load your movie and add a reaction, WatchAlong looks at the reaction video, finds the movie showing inside it, and matches several moments across the runtime. From those matches, it calculates two things at once: the sync point (where the reaction's clock starts relative to your movie) and the frame-rate drift (how fast the two clocks run away from each other). No countdown. No nudging.

This runs automatically after every new import. You can also re-run it any time from the Timing panel with **Detect again**.

### 15. Reactors include timers and countdowns to help viewers sync manually. Does WatchAlong make those unnecessary?

Yes. WatchAlong finds the sync on its own, so the countdown becomes a convenience for people who don't have the app, not a requirement for people who do. The reactor can keep including it. WatchAlong just doesn't need it.

### 16. What happens when the app can't find the sync?

Some pairings are harder than others. If the reactor's movie inset is too small, too obscured, or too heavily pixelated for the engine to match confidently, WatchAlong says so and steps aside. You get the manual sync screen and line up the countdown yourself. No guess is ever applied silently. A sync tool that confidently lines you up wrong is worse than one that asks.

### 17. How do I do a manual sync?

Both videos open paused in the Sync Setup screen. Play the reaction, listen for the reactor's countdown ("3... 2... 1... play!"), and click **Save Sync** at the exact moment the countdown ends. Use the `[` and `]` keys to nudge the offset by 0.1 seconds during the first minute. That's it. You never have to sync this pairing again.

### 18. I set the sync perfectly at the start, but by the end they're a few seconds apart. Why?

This is frame-rate drift, and it's the most common sync problem for full-length reactions. Your movie file runs at one speed, the reactor's copy runs at another. Most streaming services and Blu-rays use 23.976 fps (a holdover from NTSC broadcast timing). PAL DVDs from Europe or Australia run at 25 fps, about 4% faster. Some newer streaming originals run at true 24.000 fps. Over a 2-hour movie, a 0.1% difference adds up to about 7 seconds of drift. A PAL vs NTSC difference is far more noticeable, and it's invisible until you're deep into the movie.

### 19. How does WatchAlong handle frame-rate drift?

When auto-sync runs, it measures the drift directly from the two videos. No dropdown, no guessing what the reactor's source is. The correction is applied automatically.

If you're doing a manual sync instead, you tell WatchAlong what kind of source the reactor is watching from. Click the **Timing** button near the bottom of the screen to bring up the frame-rate selector:

| Option | When to use |
| :--- | :--- |
| **23.976 fps** *(most movies, Blu-ray, streaming)* | The reactor is watching on a standard streaming service or Blu-ray. This is the default and covers the vast majority of content. |
| **24.000 fps** *(select streaming originals)* | The reactor is watching specific newer originals. Some Disney+ series, some Netflix originals. The exception, not the rule. |
| **25.000 fps** *(PAL DVD, European broadcast)* | The reactor is watching a PAL DVD or broadcast from Europe, the UK, or Australia. |

Not sure which one? Leave it on the default and watch for 10-15 minutes. If the reaction creeps ahead or falls behind, try another option.

### 20. Does sync hold if I pause and come back later?

Yes. Pausing stops both videos at the same instant. Resuming picks up from exactly the same point. WatchAlong continuously corrects for accumulated timing differences while you watch, so the sync holds whether you pause for thirty seconds or close the app and come back next week.

## Library & Appearance

### 21. How do I browse my library?

Three views: **Pairings** (every movie-and-reactor combination), **By Reactor** (grouped by creator), and **By Movie** (grouped by film). Switch from the library header. Sort alphabetically or by date added. Each view remembers whether you prefer the poster grid or the compact list, so you can set it once and forget it.

Click any pairing to see its detail page: the movie poster, the reactor, whether the timing is ready, and a button to continue or start watching. If you've paused mid-reaction, the button says **Continue Reaction** and shows where you left off.

### 22. Does WatchAlong show movie poster art?

Yes. If your movie folders contain standard image files, WatchAlong displays them automatically. The app looks for `poster.jpg`, `poster.png`, `folder.jpg`, `folder.png`, or the movie filename with a `.jpg` or `.png` extension. Same conventions used by Kodi, Jellyfin, Emby, and other media tools. You can also choose a custom poster from any session's context menu.

WatchAlong reads what's already in your library. It never fetches images from the internet.

### 23. Can I change how the app looks?

Two cabinet modes: **Mahogany** (dark) and **Oak** (light). Both use real wood-grain textures and warm tones inspired by home entertainment furniture. The app follows your system preference by default. Switch manually from the Control Panel.

### 24. How do I position the PiP overlay?

Drag it by the title bar. Resize from the lower-right corner. Release near a corner and it snaps there. Size and position are saved with your session. When the reaction video enters fullscreen, the PiP stays on top where you put it.

### 25. How does the pop-out movie window work?

Click the pop-out icon in the PiP toolbar. The movie lifts into its own window. Drag it to a second monitor, resize independently, or fullscreen it. Pop it back in with the pop-in button or by closing the window. Sync stays frame-accurate across both windows.

### 26. What's the Control Panel?

Press `Ctrl+,` (`⌘+,` on macOS), or click the gear icon from the library or during playback. A focused panel slides in with Now Playing, compact Library, active Downloads, Preferences, and Help. Navigate with arrow keys, Tab, or a click.

### 27. My movie has multiple audio tracks. Can I choose which one plays?

Yes. When a movie file contains multiple audio tracks (an original language track and a dub, for example), a selector appears near the volume controls. Choose the track you want and it switches instantly. Your selection is saved with the session and carries across to the pop-out movie window.

Not all tracks may appear. The app can only show tracks that Chromium's media engine can decode.

## Privacy & Data

### 28. What data does WatchAlong collect?

None. No telemetry, no analytics, no crash reporter, no server. Your library, playback state, settings, and downloaded files stay on your device. The only network requests are the ones you trigger: authenticating with Patreon, or downloading a reaction.

See [PRIVACY.md](PRIVACY.md) for a full breakdown of what's stored and where.

### 29. Where are sessions, settings, and downloads stored?

Sessions and preferences: JSON files in Electron's standard `userData` directory. Downloaded reactions: your system's Videos folder, in a `WatchAlong/Reactions` subfolder. You can change the download location from the Control Panel.

### 30. If I uninstall, is anything left behind?

Yes, intentionally. Sessions and downloaded reactions stay where they are. Your library outlasts the app, like documents outlast a word processor. Delete the WatchAlong folders manually if you want to remove everything.

## Troubleshooting

### 31. The app shows a library recovery screen.

A damaged library file triggered this. WatchAlong moves the damaged file aside and offers **Show Recovery File**, **Retry**, or **Start New Library** without deleting the preserved copy. Restart the app if this persists.

### 32. I opened a session and got "file can't be found."

The movie or reaction file was moved, renamed, or deleted since the session was created. WatchAlong shows which file is missing and offers a Locate button. Point it to the new location. You won't lose your sync.

### 33. YouTube download failed.

Common causes: age restrictions, regional restrictions, a private video (not unlisted), or a network interruption. WatchAlong will tell you if the video may be private or restricted. If it's accessible in your browser, try the download again.

### 34. Downloaded Patreon reaction won't play or is corrupted.

Some Patreon content uses DRM. The bundled patreon-dl tool skips DRM-protected files. Check if the reactor offers an unlisted YouTube link or a direct download, and add it locally instead.

### 35. The popped-out movie window stopped responding.

WatchAlong detects unresponsive windows within a few seconds, closes the window, and returns the movie to the PiP overlay. Pop it back out whenever you're ready.

### 36. macOS says WatchAlong can't be opened because it's from an unidentified developer.

Normal for open-source apps that aren't notarized by Apple. Right-click the app and select Open. You only need to do this once.

## Community & Contributing

### 37. How can I support WatchAlong?

Keep supporting the creators whose reactions you watch. That's what the app is for.

If you'd like to support the developer directly, you can [buy me a coffee on Ko-fi](https://ko-fi.com/watchalong).

### 38. I found a bug or have an idea.

[Open an issue on GitHub](https://github.com/nizzyG/WatchAlong/issues). Describe what you were doing, what you expected, and what happened. Screenshots help.

## Legal & Privacy

- [Disclaimer](DISCLAIMER.md)
- [Privacy](PRIVACY.md)
- [Security](SECURITY.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)
