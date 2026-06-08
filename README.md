# WatchAlong

**Full-length Patreon reactions, synced with your own movie files.**

You support the creator. You own the film. WatchAlong handles the sync - locking your movie to the reaction, fixing frame-rate drift, and remembering everything when you close the app. No accounts, no cloud, no streaming services.

## What it does

- **Sync once, then forget it.** A quick manual sync at the start (usually right when the reactor does their countdown), and WatchAlong keeps both videos locked together. Pause, seek, restart the app - no re-syncing.
- **Picture-in-Picture, or pop it out.** Watch the reactor in a draggable overlay over your movie, or pop the movie into its own window for dual-monitor setups.
- **Fixes the 24fps vs 23.976fps drift.** Most streaming services play at true 24fps. Blu-ray rips run at 23.976fps. Over a 2-hour movie that's about 7 seconds of drift. WatchAlong has a one-click correction for this.
- **Download reactions directly.** Paste a YouTube link or connect your Patreon account - WatchAlong grabs the reaction for you. No browser extensions.
- **Library that remembers.** All your watchalong pairings are saved. Pick up right where you left off.
- **Subtitles.** Load SRT or VTT subtitle files, displayed over the movie.
- **Keyboard shortcuts for everything.** Space, arrows, R/M for mute, Ctrl+Shift+P for the command panel.

## Philosophy

WatchAlong is built on a few simple ideas:

- **You should own your media.** It works with files you've ripped from discs you own, or DRM-free downloads you've purchased. No streaming service integration.
- **Creators deserve to be paid.** Full-length reactions are behind a Patreon subscription. WatchAlong doesn't bypass that - you need an active subscription to access that content.
- **Everything stays local.** No accounts, no cloud, no telemetry. Your library, sessions, and downloads live on your device.

## Getting started

1. Have a movie file you legally own (ripped from a disc, or a DRM-free download)
2. Download WatchAlong from the [releases page](https://github.com/nizzyG/WatchAlong/releases)
   - **Windows:** Run the `.exe` installer
   - **macOS:** Open the `.dmg` and drag to Applications
3. Launch and click **+ New WatchAlong**
4. Follow the wizard to load your movie and add a reaction

First time? There's a [step-by-step tutorial with screenshots](tutorial.md).

## Platform notes

**Windows:** Tested end-to-end. Should be smooth.

**macOS:** Built and verified, but tested in a VM rather than on real Apple hardware. If you're on a real Mac and run into issues, I want to hear about it.

This is a first public release, built by one person. Bug reports and feedback are welcome - [open an issue](https://github.com/nizzyG/WatchAlong/issues).

## FAQ

Questions about legality, file formats, Patreon setup, the 24fps thing - [FAQ page](FAQ.md).

## Support

WatchAlong is free and always will be. If it makes your watchalong nights better, [throw me a few bucks on Ko-fi](https://ko-fi.com/watchalong).

## Dev

Electron + React + TypeScript.

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev
```

MIT license. Bundled tools (yt-dlp, ffmpeg, patreon-dl, Node.js) have their own licenses - see `ATTRIBUTION.md`.
