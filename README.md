# WatchAlong

**You own the movie. You support the creator. WatchAlong handles the rest.**

If you love watching reactors experience your favorite films for the first time, you know the routine. You support them on Patreon. They post the full-length watch-along. And then you juggle two media players, pause one while the other buffers, and wonder why everything drifted apart by the credits.

WatchAlong replaces that routine with one app. Load your movie. Download the reaction. The app finds the sync point, measures the drift, and keeps both videos locked together through pauses, seeks, and restarts. Come back tomorrow and pick up right where you left off.

## Why WatchAlong exists

There are two ways to watch a movie today. You can rent access to it on a streaming service — access that disappears when the license expires, when the service raises its price, or when the catalog rotates. Or you can own a copy: a DRM-free purchase, a personal backup of a disc you bought. The first option is convenient until it isn't. The second option is yours.

WatchAlong is built for people who chose the second option, and who also support the creators who make reaction content. The app works with local movie files you're authorized to use, paired with full-length reactions from creators you pay on Patreon. No streaming service in the middle. No license that can expire. Your movie stays your movie. The creator stays paid.

## What it does

- **Finds the sync for you.** WatchAlong looks at the reaction video, finds the movie inside it, and lines everything up automatically. No countdown. No nudging. No guessing.
- **Fixes frame-rate drift automatically.** Your movie and the reactor's copy might run at slightly different speeds — 23.976, 24, or 25 frames per second. Over two hours, that gap becomes seconds. WatchAlong measures the difference and corrects it.
- **Keeps both videos locked.** Pause, seek, close the app, come back next week. The sync holds. Drift correction runs continuously and invisibly.
- **Picture-in-picture or pop-out.** Watch the movie with the reactor in a draggable overlay. Prefer a second screen? Pop the movie out into its own window.
- **Download reactions directly.** Paste a link and connect your Patreon account. WatchAlong grabs the reaction for you. No browser extensions, no external tools.
- **Your library, remembered.** Every pairing you create is saved. Sessions, sync offsets, PiP positions, playback position — everything comes back.
- **Subtitles.** Load SRT or VTT subtitle files. They display over the movie.
- **Keyboard shortcuts for everything.** Space to play or pause. Arrows to skip. R and M for mute. Ctrl+Shift+P for the command panel. Full list in the [FAQ](FAQ.md).

## Our principles

- **Creators get paid.** Full-length reactions live behind a Patreon subscription. WatchAlong doesn't bypass that. You need an active subscription to download. The only people who use the download feature are people already supporting the creator.
- **You own your media.** The app works with DRM-free local files you're authorized to use — DRM-free purchases, or any file you have the right to play. No streaming service in the middle.
- **Everything stays local.** Your library, your sessions, your downloads, your settings — all on your drive. No telemetry. No analytics. No WatchAlong account. No WatchAlong server. The only network requests are ones you trigger: signing into Patreon or downloading a reaction.
- **Free and open source.** Now and always. MIT license. No paid features, no ads, no data sale.

## Getting started

1. Have a DRM-free local movie file you're authorized to use.
2. Download WatchAlong from the [releases page](https://github.com/nizzyG/WatchAlong/releases).
   - **Windows:** Run the `.exe` installer.
   - **macOS:** Open the `.dmg` and drag to Applications.
3. Launch and click **+ New WatchAlong**.
4. Follow the wizard to load your movie and add a reaction.

First time? There's a [step-by-step tutorial with screenshots](tutorial.md).

## How auto-sync works (and when it asks for help)

WatchAlong looks at the reaction video, finds the movie showing inside it, and matches several moments across the runtime. From those matches, it calculates both the sync point and the frame-rate drift in one step.

The engine is confident on most pairings — the reactor's movie is visible, even blurred, and the app finds it. When it isn't confident, it says so and steps aside. You fall back to the manual sync screen, line up the countdown yourself, and pick up the frame-rate selector. No guess is ever applied silently. A sync tool that confidently lines you up wrong is worse than one that asks you to do it yourself.

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

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev
```

MIT license.
