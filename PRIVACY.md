# Privacy

WatchAlong doesn't collect your data, sell your data, run telemetry, or talk to any WatchAlong-operated server. There isn't one. Everything stays on your machine unless you trigger a network request yourself.

Here's exactly what's stored, where, and when.

## What's stored on your device

### Session library (`%APPDATA%/WatchAlong/library.json` on Windows, `~/Library/Application Support/WatchAlong/library.json` on macOS)

Every watchalong you create. Each session contains:
- Movie file path, reaction file path, subtitle file path
- Session title
- Playback position (where you left off)
- Sync offset (in seconds)
- PiP overlay position and size
- Volume and mute state for both tracks
- Playback rate
- Detected movie frame rate (from ffprobe)
- Reactor source selection
- Created and last-played timestamps

This JSON file lives in Electron's standard `userData` directory. It's not encrypted — it's just a local JSON file. It can reveal your viewing history, local file names, and directory structure to anyone with access to your machine.

### Preferences (`%APPDATA%/WatchAlong/preferences.json` on Windows, `~/Library/Application Support/WatchAlong/preferences.json` on macOS)

Your app settings: download directory, launch behavior, UI preferences. (Reactor source and sync settings are stored per-session, not globally.)

### Downloaded reactions

Saved to your system's Videos folder in a `WatchAlong/Reactions` subfolder by default. You can change the download location from the Command Panel.

### Saved Patreon session (optional — only if you choose to save it)

Stored as `patreon-session.bin` in the same `userData` directory. Encrypted with Electron's `safeStorage` API, which uses your operating system's secure storage where available (macOS Keychain, Windows DPAPI, Linux secret service). You can delete it at any time from the Preferences panel.

## Temporary files during download

When you connect to Patreon or download a reaction, WatchAlong uses short-lived temporary files. It scrubs and removes them during normal cleanup; if the OS prevents removal or the app crashes, WatchAlong retries matching leftovers the next time it starts.

- **Firefox cookie extraction:** If you use Firefox one-click connection, `yt-dlp` writes a temporary browser cookie jar in a private OS temp directory. That jar can contain cookies beyond Patreon; WatchAlong reads only Patreon's `session_id`, then removes the directory. Crash leftovers are removed at the next launch.
- **patreon-dl config:** During download, a temporary config file containing your session cookie is written to an OS temp directory with `0600` permissions where supported (owner read/write only). WatchAlong clears the credential contents before removal and retries any locked leftovers at startup.
- **In-memory holding:** After a successful Patreon download, the session cookie is held briefly in memory so the app can offer to save it. If you decline or dismiss, it's discarded.

## Network requests

WatchAlong makes network requests only when you trigger them:

| Trigger | Destination | What's sent |
|---|---|---|
| Patreon login | `patreon.com` (and identity providers: Google, Facebook, Apple) | Your Patreon credentials (handled by Patreon's login page in an isolated browser window) |
| Patreon download | `patreon.com` | Your session cookie, the post URL |
| YouTube download and creator picture | YouTube and Google-owned media/CDN hosts (via yt-dlp) | The video URL, followed by the public channel and creator-picture requests |
| External links | Various | When you click a help link, donation link, or open the GitHub issues page |

No data is ever sent to a WatchAlong-operated server — there isn't one.

## What's NOT collected

- No telemetry or usage statistics
- No crash reports (if the app crashes, I never find out unless you tell me)
- No analytics or tracking
- No unique device identifiers
- No IP address logging
- No cloud library or account sync
- No advertising identifiers

## If you uninstall

Sessions, preferences, downloaded reactions, and saved Patreon sessions stay on your drive. The app doesn't clean these up on uninstall — your library outlasts the app, like documents outlast a word processor. Delete the WatchAlong folders manually if you want to remove everything:

- Windows: `%APPDATA%/WatchAlong/` and your download directory
- macOS: `~/Library/Application Support/WatchAlong/` and your download directory

## Changes

If I change how WatchAlong handles data, I'll update this document and note it in the release. There's no server to push updates from — you'll see changes when you download a new version.
