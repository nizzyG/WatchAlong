# WatchSync Phase 2 Design Brief — Smart Media Input & Onboarding

## 1. Project Overview

WatchSync is a local Electron desktop application for perfectly synced watchalong playback.  
The user loads a **local movie file** (ripped from their own physical media) and a **full‑length reaction video** (from a reactor’s Patreon, YouTube, or local file).  
The app plays the reaction video in the main window with the movie in a draggable/resizable Picture‑in‑Picture overlay, keeping both streams frame‑accurate even after pause, seek, or restart.

The current codebase already handles:

- Dual HTML5 video element sync with offset and source‑rate correction.
- Session persistence (paths, volumes, mute, overlay geometry, resume position).
- Manual sync setup via independent scrubbers.
- Drift correction loop, command queue, subtitles, dark‑themed UI.
- Cross‑platform Electron shell with a `watchsync://` custom protocol to serve local files.
- Keyboard shortcuts (`Space`, arrows, `[`, `]`, `R`, `M`, `P`).

**Core philosophy**: WatchSync champions **actual media ownership**. It never touches streaming services for the movie. Users must own the film they’re watching, ideally via ripped physical discs.

## 2. Goal for This Phase

Transform the “add reaction” step from a plain file dialog into a **smart media input** that supports three sources:

1. **Local file** – as before.
2. **YouTube URL** – paste a link, download automatically with bundled `yt-dlp`.
3. **Patreon post URL** – paste a link + automatically extract the user’s Patreon session from their browser, with a gentle manual fallback.

Add a **first‑run onboarding wizard** (800×600 default window) that introduces the tool, checks bundled dependencies, and guides the user through loading their first movie and reaction.

## 3. Design Principles

- **Trust and transparency** – users must always understand what’s happening. No hidden actions.
- **Zero external tools** – no browser extensions, no command lines. Bundled binaries are acceptable.
- **Graceful fallbacks** – the automatic path is the primary flow; manual steps only appear when absolutely needed.
- **Minimal friction** – the user should spend seconds, not minutes, configuring a session.
- **Consistent visual language** – dark theme, subtle animations, clear iconography, friendly copy.

## 4. UI/UX Specifications — Smart Reaction Input Panel

This panel replaces the current “Open reaction video” file dialog.  
It should appear after the user selects/loads the local movie file (or as part of the first‑run wizard).

### 4.1 Layout & Cards

- **Layout**: A centered card layout inside the main app window (or a wizard window at 800×600). Title: “Add Reaction Video”.
- **Three cards**, each with a large icon, title, and one‑line description:

1. **🎬 Local file**  
   *“I already downloaded the reaction video.”*  
   → Opens native file dialog; appends the selected file as the reaction source (existing behaviour).

2. **▶️ YouTube link**  
   *“The reactor shared a private/unlisted YouTube link.”*  
   → Expands an inline form: a text field (placeholder: `https://www.youtube.com/watch?v=…`) and a “Download & Load” button.  
     Below: a subtle note “*Requires yt‑dlp (bundled). No account needed.*”  
     Paste detection: the button gently pulses when a valid‑looking URL is present.

3. **❤️ Patreon post**  
   *“The full‑length watchalong is on their Patreon page.”*  
   → Expands an inline form with:
   - A text field for the Patreon post URL (placeholder: `https://www.patreon.com/posts/…`).
   - A guided credential flow (see section 5).

- **Visual transition**: Selecting a card expands it smoothly; the other cards remain visible but are visually subdued.

### 4.2 Download & Progress Integration

- When a download is triggered (YouTube or Patreon), the panel shows:
  - A progress bar (determinate if possible, otherwise indeterminate spinner).
  - A message like “Downloading… 45%”.
  - A cancel button.
- The download runs in the background **without blocking the UI**. The user can already load the movie (if not done) or adjust sync settings.
- On success, the reaction source path is automatically set in the current session, and the user is brought to the sync‑setup screen.
- On failure, a human‑readable error message is displayed inside the panel, with a retry button.

### 4.3 Error Handling

- YouTube: if download fails (private, age‑restricted, region blocked), show: *“This video couldn’t be downloaded. It may be private or restricted.”* Include a link to common YouTube error explanations.
- Patreon: if download fails even after manual cookie entry, suggest re‑exporting the cookie or checking the subscription.

## 5. Patreon Credential Flow

This is the most delicate UX. The goal is to be as transparent and effortless as possible.

### 5.1 Browser Selection (Automatic Attempt)

After the user pastes the Patreon post URL, the panel transitions to a “Connect to Patreon” screen.

- **Heading**: “Connect to Patreon”
- **Subtext**: *WatchSync can safely read your existing Patreon login from your browser. Just pick the browser you’re logged into.*
- **Browser icons**: A row of large clickable icons (Chrome, Firefox, Edge, Brave, Opera) with names underneath.
  - If a browser is not installed (detected via standard install paths), the icon appears faded with a “Not found” label but **remains selectable** (for portable installations).
- **Reassurance badge**: a lock icon with text *“Your cookies never leave your device. We only access the Patreon session, and we don’t store it unless you ask us to.”*
- On click: a subtle spinner appears, message: *“Reading Patreon session from Chrome…”*

**Backend behaviour** (for reference, not UI code):

- The app should attempt to extract Patreon cookies using a method analogous to `--cookies-from-browser <browser>` (e.g., via `patreon-dl`’s `--cookies-from-browser` option if available, or a small bundled utility that reads encrypted browser cookie stores).
- The extracted cookie is used **only in memory** for the download; it is not persisted unless the user explicitly opts in (see 5.3).

### 5.2 Manual Fallback (if automatic extraction fails)

If the automatic route fails (no `session_id` found, database locked, etc.), the panel transitions to a fallback screen.

- **Message**: *“We couldn’t automatically read your Patreon session. Don’t worry—you can grab it manually in a few clicks.”*
- **Illustrated 3‑step guide** (inline, no popup):
  1. **Open Patreon in your browser** and log in if needed.
  2. **Press `F12`** to open Developer Tools, then click the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox).
  3. **In the left sidebar**, find “Cookies” → `https://www.patreon.com`. **Double‑click the `session_id` row**, copy the long text in the “Value” column.
- **Large paste field**: placeholder *“Paste your session_id here”*.
- **Button**: *“Use this session & download”*.
- The `session_id` is used directly (passed to `patreon-dl --session-id`).

### 5.3 Post‑Download Offer (Safe Storage)

After a successful Patreon download (via either method), display a non‑intrusive offer:

- **Text**: *“Want to skip this step next time? We can securely save your Patreon session on this device, encrypted with your OS keychain.”*
- **Toggle** (default **off**) with a lock icon.
- Optional: a small “Learn more” link that explains the encryption (Electron’s `safeStorage` API) and that the session can be deleted at any time from settings.
- If the user turns it on, the app stores the encrypted `session_id` (or the entire cookie jar) in Electron’s `safeStorage`. On subsequent Patreon downloads, it can be reused without re‑prompting.

## 6. First‑Run Onboarding Wizard

The very first time WatchSync launches (detected via absence of any library data or a dedicated “hasRunBefore” flag), show a dedicated **800×600 modal wizard window** (or full‑screen overlay in the main window) to guide the user.

**Steps**:

1. **Welcome**  
   - *“Watch reactions alongside your own movies, perfectly in sync.”*  
   - Brief tagline about ownership and privacy.  
   - “Next” button.

2. **Tool Check**  
   - The wizard verifies that the bundled `yt-dlp` and `patreon-dl` executables are present and functional.  
   - Show green checkmarks: “yt‑dlp ready ✓”, “Patreon downloader ready ✓”.  
   - If a tool is missing, provide a “Reinstall” button that triggers the app’s repair logic (or simply instructs the user to re‑download from the official site).  
   - “Next”.

3. **Your First Watchalong**  
   - Guide the user to load a local movie file (file dialog button) and then choose a reaction source (the smart media input panel described in section 4).  
   - The wizard embeds this whole flow. After both files are ready, proceed to the sync‑setup step (the existing manual sync UI).  
   - “Finish” button that closes the wizard and opens the main app window with the newly created session.

After the wizard completes, set a flag so it never appears again (unless manually triggered from Help/About).

## 7. Bundling & Dependency Management

For a seamless experience, **all required tools must be bundled** inside the Electron app.

- **yt‑dlp**: include the appropriate platform binary (Windows, macOS) in `extraResources`. On launch, the app should detect its path and ensure it’s executable.
- **patreon‑dl**: same as above, with any required dependencies (like Python) bundled if necessary. The design does not mandate a specific bundling strategy, but Codex must ensure no external install steps are required for the user.
- **Browser cookie extraction**: if using a separate utility to read encrypted browser cookies, that utility must be bundled and called via IPC.

The app’s first‑run “Tool Check” step (section 6) should confirm that these binaries are functional.

## 8. Integration with Existing Architecture

Codex must extend the existing codebase without breaking existing functionality.

- **New IPC channels**: for downloading and cookie extraction.  
  - `download:youtube(url)` → returns local file path.  
  - `download:patreon(url, sessionSource)` → returns local file path.  
  - `check:tools()` → returns status of bundled binaries.  
  - `cookies:extract(browserName)` → returns an in‑memory cookie data (or `session_id`).  
  - `safeStorage:encrypt/setCookie` / `safeStorage:getCookie` for encrypted persistence.
- **UI components**: the smart reaction input panel should be integrated into the existing `App.tsx` as a replacement for the reaction file dialog; it can be a new React component (e.g., `SmartReactionInput`).  
- **The wizard**: create a separate component or window (`OnboardingWizard`) that is shown on first run.  
- **Download progress**: the main process should emit progress events to the renderer via `webContents.send`; the UI should consume them via IPC.

All persistence (downloaded file paths) must be stored in the existing session store and should follow the same normalization rules.

## 9. Visual & Interaction Guidelines

- **Color palette**: maintain the existing dark theme (`#05070a` background, subtle translucent controls, etc.).
- **Icons**: use Lucide React icons already in the project.
- **Animations**: smooth card expansion, spinner fades, progress bar fills. Keep them subtle and under 300ms.
- **Typography**: friendly, readable. Avoid technical jargon. Use “we” sparingly; keep copy human and direct.
- **Wizard window**: 800×600 default, centered, modal, with a clean “X” to close (but no closing during the first run unless completed). Should remember if the user wants to be re‑shown from Help menu.
- **Reassurance elements**: lock icons, “Your data never leaves your device” badges, clear privacy cues near cookie inputs.

## 10. Implementation Order (Suggested)

1. Add tool bundling (`yt-dlp`, `patreon-dl`, cookie extractor) to the build pipeline and test the tool‑check IPC.
2. Build the smart reaction input panel (UI only) with local/YouTube/Patreon cards and form expansion.
3. Implement the YouTube download IPC and hook it to the panel.
4. Implement the Patreon cookie extraction (automatic attempt with browser selection) and manual `session_id` fallback flows.
5. Add the download progress UI and error handling.
6. Integrate the post‑download encrypted storage offer.
7. Build the first‑run onboarding wizard and hook it into app startup.
8. Wire everything into the existing session creation flow, ensuring backward compatibility.
9. Test all flows on Windows and macOS.
10. Update the test suite with UI and IPC mocks.

## 11. Final Note

This design is the blueprint for a polished, user‑centric feature set that turns WatchSync into the definitive watchalong tool. Every decision prioritises the user’s privacy, ownership, and ease of use. Codex should implement the designs faithfully, but may make pragmatic adjustments for technical feasibility—while always preserving the spirit of transparency and simplicity described here.