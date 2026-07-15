# WatchAlong

**You own the movie. You support the creator. WatchAlong handles the rest.**

You know the routine. You support a creator on Patreon, they post the full-length watch-along, and you sync it with your own copy of the movie. Two media players, one paused while the other buffers, and somehow everything drifts apart by the credits.

WatchAlong replaces that with one app. Load your movie. Add the reaction. The app finds the sync point, measures the drift, and keeps both videos locked together through pauses, seeks, and restarts. Come back tomorrow and pick up right where you left off.

## What it does

- **Finds the sync for you.** WatchAlong looks at the reaction, finds the movie inside it, and lines everything up automatically. No countdown. No nudging.
- **Fixes frame-rate drift automatically.** Your movie and the creator's copy might run at slightly different speeds. Over two hours, that gap becomes seconds. WatchAlong measures the difference and corrects it.
- **Keeps both videos locked.** Pause, seek, close the app, come back next week. The sync holds.
- **Picture-in-picture or pop-out.** Watch the movie with the reactor in a draggable overlay, or pop the movie out to a second screen.
- **Download reactions directly.** Paste a Patreon post URL or a YouTube link and WatchAlong grabs the full-length reaction for you.
- **Your library, remembered.** Every pairing is saved. Sync, position, PiP layout — everything comes back.
- **Subtitles.** Load SRT or VTT files. They display over the movie.
- **Keyboard shortcuts for everything.** Space to play or pause. Arrows to skip. R and M for mute. Full list in the [FAQ](FAQ.md).

## Our principles

- **Creators get paid.** WatchAlong doesn't bypass Patreon. You need an active subscription to download a creator's full-length reactions. The only people who use this app are people already supporting the creator.
- **You own your media.** The app works with DRM-free local files you're authorized to use. No streaming service in the middle. No license that can expire.
- **Everything stays local.** Your library, your sessions, your downloads, your settings — all on your drive. No telemetry. No analytics. No account. No server. The only network requests are the ones you trigger.
- **Free and open source.** MIT license. No paid features, no ads, no data sale. Now and always.

## Getting started

1. Have a DRM-free local movie file you're authorized to use.
2. Download WatchAlong from the [releases page](https://github.com/nizzyG/WatchAlong/releases).
   - **Windows:** Run the `.exe` installer.
   - **macOS:** Open the `.dmg` and drag to Applications.
3. Launch and click **+ New WatchAlong**.
4. Follow the wizard to load your movie and add a reaction.

First time? There's a [step-by-step tutorial with screenshots](tutorial.md).

## How auto-sync works (and when it asks for help)

WatchAlong looks at the reaction, finds the movie showing inside it, and matches several moments across the runtime. From those matches, it calculates both the sync point and the frame-rate drift in one step.

The engine is confident on most pairings. When it isn't, it says so and steps aside. You fall back to the manual sync screen, line up the countdown yourself, and pick up the frame-rate selector. No guess is ever applied silently. A sync tool that confidently lines you up wrong is worse than one that asks you to do it yourself.

## Platform notes

**Windows:** Tested end to end.

**macOS:** Built and verified, but tested in a virtual machine rather than on real Apple hardware. If you run into trouble on a real Mac, [open an issue](https://github.com/nizzyG/WatchAlong/issues) and let me know.

This is a first public release, built by one person. Bug reports and feedback are always welcome.

## FAQ

Questions about legality, file formats, Patreon setup, frame-rate drift, or how auto-sync decides what it can handle? See the [FAQ page](FAQ.md).

## Legal and privacy

- [Disclaimer](DISCLAIMER.md)
- [Privacy](PRIVACY.md)
- [Security](SECURITY.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)

## Support

WatchAlong is free and always will be. If it makes your watch-along nights better, you can [buy me a coffee on Ko-fi](https://ko-fi.com/watchalong).

## For developers

Electron, React, and TypeScript. The sync engine and auto-sync detection are pure, tested TypeScript modules. The bundled tools (yt-dlp, ffmpeg, patreon-dl, Node.js) have their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Audio-track selection depends on Electron's non-default Blink `AudioVideoTracks` capability. `WindowManager` enables it only for the main playback renderer and detached movie window; onboarding/import and Patreon login windows retain their baseline sandboxed capabilities. Renderer code must still feature-detect `video.audioTracks`: if an Electron upgrade removes or changes the capability, the selector should hide while ordinary playback continues with Chromium's default track.

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev
```

MIT license.
