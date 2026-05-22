# 🎬 WatchAlong

**Full‑length Patreon reactions, beautifully synced with your own movies.**

You support the creator. You own the film. WatchAlong handles the rest.

If you're already a paying patron, you've done the part that actually matters. WatchAlong simply makes the watching effortless. It locks your movie to the reaction, fixes that weird frame‑rate drift, and lets you pause or walk away without ever re‑syncing. No accounts, no cloud, no streaming services. Just a perfect watchalong, every time.

## ✨ Why You'll Love It

- **Sync once, then forget it.** A quick manual sync at the start of the movie—usually right when the reactor does their “3… 2… 1… play” countdown—is all it takes. After that, WatchAlong keeps both videos frame‑perfect for the rest of the film.
- **Picture‑in‑Picture, or pop it out.** Watch the reactor in a small draggable window over your movie, or pop the movie into its own window—perfect for multiple screens.
- **Never drift apart again.** We automatically correct for that weird 24 fps vs 23.976 fps speed difference so everything stays smooth.
- **Download straight from the source.** Paste a YouTube link or connect your Patreon account—WatchAlong grabs the reaction for you. No browser extensions needed.
- **Your library, your way.** All your watchalong pairings are saved in a beautiful dark‑themed library. Pick up right where you left off, every time.
- **Subtitles included.** Load your own SRT or VTT subtitles and they'll display right over the movie.

## 🧭 Our Philosophy

We believe in **owning your media** and **supporting the creators you love**.

- **You own your movies.** WatchAlong works with files you've ripped from discs you own, or DRM‑free downloads you've purchased. No streaming services, no monthly rentals.
- **Reactors deserve to be paid.** Full‑length reactions are almost always behind a Patreon subscription. WatchAlong can't bypass that—you need an active subscription to access that content. We just make the experience better once you're a supporter.
- **Everything stays local.** No accounts, no cloud, no telemetry. Your library, your sessions, your downloads—all of it lives on your own device.

## 🚀 Getting Started in 4 Steps

1. **Grab a movie file** you legally own (ripped from a disc, or a DRM‑free download).
2. **Download the app** from our [Releases page](https://github.com/nizzyG/WatchAlong/releases).  
   - **Windows:** Run the `.exe` installer.  
   - **macOS:** Open the `.dmg` and drag WatchAlong to Applications.
3. **Launch WatchAlong** and click the big **+ New WatchAlong** button.
4. **Follow the friendly wizard** to load your movie and add a reaction from a local file, a YouTube link, or directly from Patreon.

That's it. No command lines, no complicated setup.

## 🚧 A Note on v1.0.0

WatchAlong has been built with care, tested on Windows from end to end, and verified on macOS through automated builds and a virtual machine. But this is a first public release—made by one person, in their spare time, for a community they love.

If you're an early adopter, thank you. You're helping shape what WatchAlong becomes.

**What you can expect:**
- **Windows:** Thoroughly tested. Should be smooth sailing.
- **macOS:** Built and verified, but tested in a virtual machine rather than on real Apple hardware. If you're on a real Mac and run into anything odd, I want to hear about it.
- **Feedback is welcome—and fast.** Found a bug? Have an idea? Open an issue on [GitHub](https://github.com/nizzyG/WatchAlong/issues). I'll be actively listening and shipping fixes quickly.

This isn't a beta test in disguise—the tool works. But the first people who use it will help make it better for everyone who comes after. If that's you, I'm grateful.

---

## ❓ FAQ

### 🏛️ Philosophy, Legality & Creator Support

**1. Is WatchAlong legal?**

Yes. WatchAlong is a synchronization tool—like a video player with two screens. It doesn't distribute, copy, or stream any copyrighted content, and it doesn't circumvent any DRM. It simply plays two files you already legally own in time with each other, which is well‑established as lawful personal use. Reaction videos are original commentary works protected by fair use; the reactor provides their voice, personality, and analysis. You must hold an active Patreon subscription to access that content—WatchAlong just plays it alongside the movie you already purchased on disc or as a DRM‑free download.

**2. I already subscribe to the reactor on Patreon. Does using WatchAlong change that?**

Not at all. You must maintain an active Patreon subscription to download the full‑length reaction—WatchAlong can't bypass this. You support the reactor exactly as you always have; WatchAlong simply removes the technical headache so you can enjoy the content you already paid for.

**3. Why doesn't WatchAlong support Netflix, Disney+, HBO, or other streaming services?**

Two reasons. First, WatchAlong was built for **actual media ownership**. Streaming services grant temporary, revocable access to content. A title you "own" on a streaming platform can disappear overnight when licensing agreements change. Discs you've ripped and DRM‑free files you've purchased are yours forever. Second, streaming services constantly update their players and DRM schemes, making reliable synchronization nearly impossible for third‑party tools. Local files Just Work™.

**4. What kind of movie files do I need?**

Any DRM‑free local file. Most people rip their own Blu‑rays or DVDs using tools like MakeMKV. Others purchase DRM‑free digital editions from storefronts like GOG, or from independent distributors. The key is that the file lives on your own storage, under your control, and plays in a standard media player without phoning home to a licensing server. MP4 and WebM files with H.264 video and AAC audio work best. MKV and AVI files may play depending on their internal codecs, but they're best‑effort.

**5. What if the reactor includes a timer or leaves a few seconds of the movie in their video for sync purposes? Do I still need WatchAlong?**

Reactors commonly leave a 15‑second clip at the start of their videos or display an on‑screen timer precisely because syncing is so painful without tools. If you're comfortable syncing manually each time and don't mind re‑syncing after pausing, that approach works. WatchAlong automates everything *after* that initial manual sync—you do it once, then pause, seek, and restart without ever re‑syncing again—and adds a proper PiP overlay so you're not juggling two windows.

---

### 📦 Getting Started

**6. What do I need before I can use WatchAlong?**

Three things: a local copy of a movie or TV episode you legally own, an active Patreon subscription to a reactor who offers full‑length watchalongs (or a private YouTube link), and WatchAlong itself. The app bundles `yt‑dlp`, `ffmpeg`, `node`, and `patreon‑dl`—no extra downloads needed.

**7. How do I get my movie into a local file?**

For physical discs: use **MakeMKV** (free for DVD/Blu‑ray) to create a DRM‑free MKV file, then optionally re‑encode it to MP4 with **HandBrake** (free) for maximum compatibility. For digital purchases: download the DRM‑free file if available, or use a tool appropriate to the platform.

**8. WatchAlong says MP4 and WebM work best. Why can't I play my MKV files?**

The underlying Chromium media engine has limited codec support. MKV is a container format—the video and audio streams inside it may use codecs Chromium can't decode. If your file plays in Chrome or Edge, it will play in WatchAlong. If not, re‑encoding through HandBrake to MP4 (H.264 video + AAC audio) will almost always resolve the issue.

**9. What are the keyboard shortcuts?**

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

### 🔗 Patreon & YouTube Downloading

**10. Why do I need to provide my Patreon session? Is that safe?**

Patreon doesn't offer a standard download button for videos, so WatchAlong needs to prove to Patreon's servers that you have an active subscription to the reactor in question. Your browser login session contains that proof. Your Patreon session is used only to authenticate downloads directly with Patreon. It's never sent to WatchAlong or any third party, and it's stored on your device only if you choose to save it (encrypted with your operating system's own keychain).

**11. Why the browser cookie approach instead of a normal login screen?**

Patreon's public API doesn't provide access to video streams, even for authorized subscribers. WatchAlong uses the same access method your browser uses to play the video on Patreon's site. We designed the browser‑selection flow—no extensions, no sketchy websites, just picking your browser from a row of icons—to be as transparent as possible.

**12. What happens if the automatic Patreon extraction fails?**

You'll be guided through a simple manual fallback: open your browser's Developer Tools (F12), find the `session_id` cookie for `patreon.com`, and paste it. The instructions appear right in the app. On macOS, Safari users get alternative guidance since Safari's Web Inspector works slightly differently. Most people who go this route never need to do it a second time, because WatchAlong offers to save the session securely.

**13. Which browsers can WatchAlong extract Patreon sessions from?**

Firefox is the most reliable on both Windows and macOS. Chromium‑based browsers (Chrome, Edge, Brave, Opera) work on a best‑effort basis—recent browser security changes can prevent extraction. Safari on macOS is manual‑only due to macOS security restrictions. The browser selection screen shows what to expect from each browser before you click.

**14. I have a private/unlisted YouTube link instead of a Patreon link. Can I use that?**

Yes. Paste the YouTube URL into WatchAlong, and it downloads the video automatically. No login or cookie needed. It selects the best available MP4 stream by default.

**15. Some reactors upload to Google Drive or Vimeo. Are those supported?**

Not in v1.0. WatchAlong supports local files, Patreon posts, and YouTube links. Downloading from other services and adding the file as a local reaction is the workaround for now.

---

### ⏱️ Sync, Drift & Frame Rate

**16. I set the sync point perfectly at the start, but by the end of the movie they're a few seconds apart. Why?**

This is almost certainly the **24.000 vs 23.976 fps** mismatch. Most streaming services deliver movies at a true 24.000 frames per second. Blu‑ray discs, however, use the legacy 23.976 fps (24000/1001) standard inherited from NTSC broadcast timing. Over a two‑hour movie, that tiny 0.1% difference accumulates to about **7.2 seconds of drift**. Your local rip is typically 23.976 fps; the reactor's source was 24.000 fps. As the movie progresses, your local file falls further and further behind the reaction.

**17. How do I fix the 24 fps vs 23.976 fps drift?**

WatchAlong includes a **Source Rate Correction** setting with three presets:

| Preset | Multiplier | When to Use |
| :--- | :--- | :--- |
| **Matched** | 1.000× | Both sources run at the same speed (rare, but possible) |
| **Stream 24 → Blu‑ray 23.976** | 1.001× | The reactor watched on a streaming service (true 24.000 fps) and your local file is a Blu‑ray rip (23.976 fps) |
| **Reverse** | 0.999001× | Your local file is from a streaming source (24.000 fps) and the reactor used a Blu‑ray (23.976 fps) |

**How to know which one to use:** Listen to the reactor at the start of the video—they'll often mention whether they're watching on a streaming service or a disc. If you're unsure, leave it on **Matched** and watch for drift over 10–15 minutes. If the reaction starts creeping ahead, switch to **Stream 24 → Blu‑ray 23.976**. The correction is imperceptible to eyes and ears, but it prevents about 7.2 seconds of drift over a two‑hour movie.

This is the same technique used by professional post‑production houses when conforming between frame rates.

**18. I've heard reactors mention NTSC vs PAL—is this the same issue?**

Related, yes. NTSC regions (North America, Japan) historically used ~24 fps or ~30 fps, while PAL regions (Europe, Australia, much of Asia) used 25 fps. A PAL DVD plays about 4% faster than the original film. If your local copy is a PAL DVD rip and the reactor watched the NTSC/Blu‑ray version, you'll have a more significant sync challenge. WatchAlong's rate correction handles this as well: any constant linear speed difference between the two sources can be compensated for.

**19. How do I initially sync the two videos?**

The initial sync is a quick manual process—you only do it once per pairing. After loading your movie and downloading the reaction, both videos open paused side‑by‑side with the **Sync Setup** panel visible. Here's the flow:

1. Press **Play** on the **reaction video** and watch the opening minutes where the reactor introduces the movie. Reactors almost always do a "3… 2… 1… play" countdown when they start the film.
2. At the exact moment the countdown ends (when they press play on their end), click **Save Sync**. WatchAlong calculates the time offset between the two videos.
3. In the first minute or so, use the **`[` and `]` keys** to nudge the sync forward or backward by 0.1 seconds until it feels perfect.
4. That's it. From that point on, WatchAlong keeps everything locked—pausing, seeking, and restarting the app all maintain your sync point. You never need to re‑sync that pairing again.

The Sync Setup panel also gives you independent play buttons for the movie and reaction if you need to scrub to a specific matching frame.

**20. Does WatchAlong keep sync if I pause and come back later?**

Yes—once you've set the initial sync point (see above). After that, everything is automatic. When you press pause, both videos stop simultaneously. When you resume, they pick up from exactly the same point. Behind the scenes, WatchAlong maintains a continuous drift‑correction loop that nudges playback rates by tiny amounts to correct for any accumulated timing differences—completely invisible to the viewer. If drift exceeds a threshold, it performs an instant, seamless seek.

**21. What if I accidentally seek on one video but not the other?**

No problem. Any seek action—whether on the reaction or the movie—automatically maps both videos to the correct positions. The timeline mapping formula ensures consistency no matter which video you interact with.

---

### 🪟 Picture‑in‑Picture, Pop‑Out & Interface

**22. How do I position the PiP where I want it?**

Drag the PiP overlay by its title bar. Resize it from the lower‑right corner. When you release a drag near any corner of the screen, it snaps to that corner for a tidy, out‑of‑the‑way placement. The size and position are saved with your session.

**23. Can I watch fullscreen with the PiP still visible?**

Yes—when the reaction video enters fullscreen, the movie PiP overlay remains visible on top, exactly where you positioned it.

**24. How does the pop‑out movie window work?**

Click the pop‑out icon in the PiP toolbar. The movie lifts out into its own independent window, which you can drag to a second monitor, resize, or fullscreen independently. The reaction video fills the main window. Pop it back in just as easily with the pop‑in button, or by closing the movie window. Sync remains frame‑accurate across both windows.

**25. What's the Command Panel?**

Press `Ctrl+Shift+P` (or click the gear icon) during playback, and a translucent overlay slides in from the right. It gives you quick access to: Now Playing (session summary, sync setup, swap reaction), a compact Library for switching sessions, active Downloads with progress, Preferences (download location, Patreon saved session, launch behavior), and Help & About. Only one section is open at a time. Navigate with arrow keys and Enter, or click.

**26. I opened a session and got a message that a file can't be found. What do I do?**

This means the movie or reaction file has been moved, renamed, or deleted since the session was created. WatchAlong shows you exactly which file is missing and offers a "Locate" button to point it to the new location. Once you select the file, the session updates and playback resumes—you won't lose your sync offset or any other settings.

---

### 🔒 Privacy & Data

**27. What data does WatchAlong collect or send anywhere?**

**None.** WatchAlong has no telemetry, no analytics, no crash reporter, and no server to phone home to. Everything—your library, your sessions, your downloaded files, your sync offsets—lives on your local filesystem. The only network requests WatchAlong ever makes are the ones you explicitly trigger: downloading a reaction from YouTube or Patreon. Those downloads go directly to the relevant services, the same way your browser would handle them.

**28. Where are my sessions, settings, and downloads stored?**

Sessions and preferences are stored as JSON files inside Electron's standard `userData` directory. Downloaded reactions go to your system's Videos folder by default, in a `WatchAlong/Reactions` subfolder. You can change the download location from the Command Panel at any time.

**29. If I uninstall WatchAlong, is anything left behind?**

Standard uninstallation removes the application, but your session data and downloaded reaction files remain in the locations described above. This is intentional—your library outlasts the app, just like your documents outlast your word processor. You can delete the WatchAlong folders manually if you wish to remove everything.

---

### 🆘 Troubleshooting

**30. The app is stuck on a loading spinner and won't go away.**

A rare startup error can occur if your session or preference files have become corrupted. WatchAlong is designed to catch this and display a recovery screen with "Retry" and "Open Library" options, rather than hanging indefinitely. If you ever see a stuck spinner, restarting the app should trigger this recovery flow.

**31. The YouTube download failed. What could be wrong?**

Common causes include the video being age‑restricted, region‑blocked, or genuinely private (not unlisted). The bundled `yt‑dlp` tool handles most cases, but some geographic restrictions require additional configuration. The error message displayed in WatchAlong will indicate the specific reason.

**32. I downloaded a Patreon reaction but the file won't play or is corrupted.**

Some Patreon content uses DRM protection, particularly for high‑value media. If the downloaded file is unplayable, the content was likely DRM‑protected. The bundled `patreon‑dl` tool skips DRM‑protected files by default. If you encounter this, check whether the reactor offers an alternative download method (such as a private YouTube link or Google Drive).

**33. Why won't my movie file play?**

WatchAlong relies on Chromium's media pipeline, which natively supports H.264, VP8, VP9, and AV1 video codecs, plus AAC, MP3, Opus, and Vorbis audio codecs. Files using H.265 (HEVC) or certain MKV‑only codecs may not play. If a file doesn't work, re‑encoding through HandBrake to "Fast 1080p30" (which produces H.264 + AAC in an MP4 container) will fix the issue.

**34. The movie window stopped responding. What happened?**

If the popped‑out movie window becomes unresponsive, WatchAlong will detect this within a few seconds, close the window, and return the movie to the main window's PiP overlay. You'll see a brief message, and you can pop it back out whenever you're ready.

**35. On macOS, I get a warning that WatchAlong can't be opened because Apple cannot check it for malicious software.**

This is normal for open‑source apps that aren't notarized by Apple (notarization requires an annual Apple Developer Program membership). Right‑click the app and select **Open**—this bypasses Gatekeeper. You only need to do this once.

---

### 🤝 Community & Contributing

**36. How can I support WatchAlong?**

WatchAlong is free and open source, and it will stay that way. The best way to support it is to **support the reactors you love on Patreon**—they're the reason this tool exists. If you'd like to support development directly, there's a coffee cup button in the app's Help section, or visit [ko‑fi.com/watchalong](https://ko‑fi.com/watchalong).

**37. I found a bug or have an idea. Where do I report it?**

Open an issue on the [WatchAlong GitHub repository](https://github.com/nizzyG/WatchAlong/issues). Please describe what you were doing, what you expected to happen, and what happened instead. Screenshots are always helpful. If you're a developer, pull requests are welcome—just open an issue first to discuss what you'd like to change.

**38. Will WatchAlong add support for other services or features?**

WatchAlong is a side project built by a fellow reactor fan. Bug fixes and quality‑of‑life improvements are the priority. Major feature additions depend on community interest and available time. The roadmap lives on GitHub, and community input shapes it.

---

## 🖤 Support WatchAlong

WatchAlong is and always will be free. If it makes your watchalong nights better, consider [buying the developer a coffee](https://ko-fi.com/watchalong) ☕.

---

## 🧑‍💻 For Developers

WatchAlong is built with **Electron**, **React**, and **TypeScript**.  
To run it from source:

```bash
git clone https://github.com/nizzyG/WatchAlong.git
cd WatchAlong
npm install
npm run dev