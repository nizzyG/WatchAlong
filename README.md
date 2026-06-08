# WatchAlong

A desktop app for watching full-length Patreon reaction videos alongside your own movie files. Keeps them in sync. Handles the 24fps drift thing. Free and open source.

## What it does

You load a movie file and a reaction video. WatchAlong plays them together — reaction full screen, movie in a draggable overlay. Press play once, both play. Pause, both pause. Close the app, reopen it — everything's where you left it.

- Picture-in-picture overlay you can drag, resize, and snap to corners
- One-click pop-out — movie gets its own window, perfect for dual monitors
- Fixes the 24fps vs 23.976fps drift (streams run at true 24fps, Blu-rays at 23.976fps — over 2 hours that's 7 seconds of drift)
- Downloads reactions from YouTube links or Patreon posts (needs your Patreon login — only works if you're subscribed)
- Saves all your watchalong pairings so you can pick up where you left off
- SRT/VTT subtitles over the movie
- Keyboard shortcuts for everything

## What it doesn't do

Doesn't work with Netflix, Disney+, HBO, or any streaming service. Doesn't bypass Patreon paywalls — you need an active subscription. Doesn't phone home, collect data, or require an account. Everything lives on your machine.

## Why I built it

I was watching a Patreon reaction to Across the Universe (favorite musical) and the audio kept drifting out of sync. By the end of the movie, the reactor was a few seconds ahead of the film. Drove me nuts. I couldn't find a tool that handled this well, so I built one.

## Getting started

1. Have a movie file you legally own (ripped from a disc, DRM-free download)
2. Subscribe to a reactor on Patreon who posts full-length reactions
3. [Download WatchAlong](https://github.com/nizzyG/WatchAlong/releases)
4. Click "+ New WatchAlong" and follow the wizard

[Step-by-step tutorial with screenshots](tutorial.md) if you want the full walkthrough.

## Platform support

**Windows:** Tested thoroughly. Should be smooth.

**macOS:** Built and tested in a VM. If you're on a real Mac and something's off, I want to hear about it.

First public release. Built by one person. If you find a bug, [open an issue](https://github.com/nizzyG/WatchAlong/issues) and I'll fix it.

## FAQ

Questions about legality, file formats, Patreon setup, the 24fps thing — [FAQ page](FAQ.md).

## Support

WatchAlong is free. If it makes your watchalong nights better, [throw me a few bucks on Ko-fi](https://ko-fi.com/watchalong).

## Dev

Electron + React + TypeScript.

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev
```

MIT license. Bundled tools (yt-dlp, ffmpeg, patreon-dl, Node.js) have their own licenses — see ATTRIBUTION.md.
