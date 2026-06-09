# WatchAlong

**Full-length Patreon reactions, synced with your own movie files.**  
You support the creator. You own the film. WatchAlong handles the sync.

If you love watching reactors experience your favorite films for the first time, you know the drill: you support them on Patreon, they post the full-length watch-along, and you sync up your own copy of the movie with their reaction. WatchAlong makes that last part effortless — load both files, line up the start, and you're done. No juggling two media players. No re-syncing after pauses. No wondering why everything drifted apart by the credits.

## What it does

- **Sync once, then forget it.** Line up both videos at the reactor's countdown — that's it. WatchAlong keeps them locked together through pauses, seeks, and restarts. Come back tomorrow and pick up right where you left off.
- **Picture-in-Picture, or pop it out.** Watch the movie along with the reactor in a draggable overlay. Prefer a second screen? Pop the movie out into its own window.
- **Fixes frame-rate drift automatically.** WatchAlong detects your movie's frame rate and lets you tell it what the reactor is watching on (most streaming and Blu-ray is 23.976 fps, PAL DVDs are 25 fps, some streaming originals are 24 fps). One selection and the drift is gone — no math, no trial and error.
- **Download reactions directly.** Paste a link and connect your Patreon account. WatchAlong grabs the reaction for you; no browser extensions, no external tools.
- **Your library, remembered.** Every watch-along pairing you create is saved. Sessions, sync offsets, PiP positions — everything comes back when you reopen the app.
- **Subtitles.** Load SRT or VTT subtitle files. They display over the movie, just like you'd expect.
- **Keyboard shortcuts for everything.** Space to play/pause, arrows to skip, R and M for mute, Ctrl+Shift+P for the command panel. Full list in the [FAQ](FAQ.md).

## Our Philosophy

WatchAlong is free and open source. No telemetry, no analytics, no WatchAlong account, no WatchAlong server. Your library, sessions, and downloaded reactions live on your drive.

- **Creators get paid.** Full-length reactions live behind a Patreon subscription. WatchAlong doesn't bypass that — you need an active subscription to access that content.
- **You own your media.** The app works with DRM-free local movie files you're authorized to use — DRM-free purchases, legally created local backups, or any file you have the right to play.
- **Everything stays local.** Your library, your sessions, your downloads — yours. The only network requests are ones you trigger: signing into Patreon or downloading a reaction.

## Getting Started

1. Have a DRM-free local movie file you're authorized to use
2. Download WatchAlong from the [releases page](https://github.com/nizzyG/WatchAlong/releases)
   - **Windows:** Run the `.exe` installer
   - **macOS:** Open the `.dmg` and drag to Applications
3. Launch and click **+ New WatchAlong**
4. Follow the wizard to load your movie and add a reaction

First time? There's a [step-by-step tutorial with screenshots](tutorial.md).

## Platform notes

**Windows:** Tested end-to-end. Should be smooth.

**macOS:** Built and verified, but tested in a VM rather than on real Apple hardware. If you're on a real Mac and run into issues, I want to hear about it.

This is a first public release, built by one person. Bug reports and feedback are always welcome — [open an issue](https://github.com/nizzyG/WatchAlong/issues).

## FAQ

Questions about legality, file formats, Patreon setup, frame rate drift? See our [FAQ page](FAQ.md).

## Legal & Privacy

- [Disclaimer](DISCLAIMER.md)
- [Privacy](PRIVACY.md)
- [Security](SECURITY.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)

## Support

WatchAlong is free and always will be. If it makes your watch-along nights better, you can [buy me a coffee on Ko-fi](https://ko-fi.com/watchalong).

## Dev

Electron + React + TypeScript.

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev
```

MIT license. Bundled tools (yt-dlp, ffmpeg, patreon-dl, Node.js) have their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
