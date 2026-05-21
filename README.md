# 🎬 WatchAlong

**Watch reactions alongside your own movies, perfectly in sync.**

WatchAlong is a free, open‑source desktop app that lets you pair a locally‑owned movie file with a full‑length reaction video and watch them in a beautiful, synchronized Picture‑in‑Picture experience. It’s built for fans who **buy physical media, rip it themselves, and support reactors on Patreon**—without ever touching a streaming service.

---

## ✨ Why WatchAlong?

- **You own your movies.** WatchAlong works with your own media files—ripped from discs you own, or DRM‑free downloads you’ve purchased.
- **You support your favourite reactors.** Full‑length reactions are almost always behind a Patreon subscription. You’re already paying to access that content—WatchAlong just lets you enjoy it alongside your own copy of the film.
- **Everything is local.** No accounts, no cloud, no telemetry. Your library, your sessions, your downloads—all of it stays on your device, encrypted where needed.
- **No streaming services.** WatchAlong doesn’t integrate with Netflix, Disney+, HBO, or any other platform. We believe in actual ownership, not monthly rentals.

---

## 🎯 What It Does

| Feature | Detail |
| :--- | :--- |
| **Library‑first experience** | A calm, dark home screen where you can browse, rename, and delete your saved watchalong pairings. |
| **Smart import wizard** | Load your movie, then choose your reaction from a local file, a YouTube link, or a Patreon post—right inside a focused 800×600 modal window. |
| **YouTube download** | Paste a private/unlisted YouTube link; WatchAlong downloads it for you (requires bundled `yt‑dlp`). |
| **Patreon download** | Connect your Patreon session right from your browser—no browser extensions, just a friendly guided flow. Your Patreon session is used only to authenticate downloads directly with Patreon. It's never sent to WatchAlong or any third party, and it's stored on your device only if you choose to save it. |
| **Sync‑perfect playback** | Reaction video in full‑screen, movie in a draggable/resizable PiP overlay. Both videos stay locked together, even after pausing, seeking, or restarting the app. |
| **Pop‑out movie window** | One click moves the movie to its own independent window—perfect for multi‑monitor setups. Pop it back into PiP just as easily. |
| **Source‑rate correction** | Fixes the tiny speed difference between true 24 fps streams and 23.976 fps Blu‑ray rips—so you never drift out of sync. |
| **Subtitle support** | Load SRT/VTT subtitle files for the movie, shown right inside the PiP overlay or popped‑out window. |
| **Command Panel** | `Ctrl+Shift+P` brings up a translucent overlay with session controls, library, downloads, preferences, and help—all without leaving playback. |

---

## 🧭 The Philosophy

WatchAlong exists at the intersection of **consumer rights** and **creator support**.  
We believe:

- You should be able to **own the media you love**, not rent it indefinitely.
- You should be able to **enjoy that media however you want**, including alongside a creator’s commentary.
- **Independent creators deserve to be paid.** That’s why WatchAlong is useless without a Patreon subscription (or equivalent) to access full‑length reaction videos. The reactor’s work is the reason this app exists—we just help you experience it more immersively.
- No tool should force you into a streaming ecosystem you didn’t choose.

If you agree with that, WatchAlong is for you.

---

## 🚀 Getting Started

### Prerequisites

- **A legally owned movie file** (ripped from a disc you own, or a DRM‑free download you’ve purchased).
- **A Patreon subscription** to a reactor who provides full‑length watchalong videos (or access to a private YouTube link).

WatchAlong bundles `yt‑dlp`, `ffmpeg`, `node`, and `patreon‑dl` so you don’t need to install anything extra—on **Windows** or **macOS**.

### Installation

1. Download the latest release for your platform from the [Releases](https://github.com/nizzyG/WatchAlong/releases) page.
2. **Windows:** Run the `.exe` installer. **macOS:** Open the `.dmg` and drag WatchAlong into Applications.
3. Launch WatchAlong. You’ll be greeted by a friendly welcome and an empty library.
4. Click **+ New WatchAlong**—the import wizard will walk you through the rest.

---

## 🖤 Supporting the Project

WatchAlong is free and open source, and it always will be.  
If it makes your watchalong experience better, consider [buying the developer a coffee](https://ko-fi.com/your-link-here) ☕.  
(Donation link coming soon—the button is already in the app, waiting for you.)

---

## 🧑‍💻 For Developers

WatchAlong is built with **Electron**, **React**, and **TypeScript**.  
To run it from source:

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev
```

For packaged builds, see [BUILDING.md](BUILDING.md). On Windows, `npm run dist` may require an Administrator terminal or a CI runner because `electron-builder` needs symlink privileges while extracting its signing helper. Code signing is currently skipped, and WatchAlong currently uses Electron's default app icon.

PRs are welcome! Please open an issue first to discuss what you’d like to change.

---

## 📜 License

WatchAlong is released under the MIT License.
The bundled tools (yt-dlp, patreon-dl, ffmpeg) are subject to their own licenses—see ATTRIBUTION.md for details.

Happy watching—and remember to support the creators you love. 🎥❤️
