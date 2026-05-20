# WatchAlong UI/UX Audit Report

Date: 2026-05-20

## Audit Scope

This audit reviewed the current WatchAlong codebase with a UI/UX focus across:

- Main Electron shell and IPC flows: `src/main/index.ts`, `src/preload/index.ts`
- Library, player, command panel, sync setup, and PiP UI: `src/renderer/src/App.tsx`
- Import/onboarding wizard: `src/renderer/src/WizardApp.tsx`
- Smart reaction input and Patreon storage offer: `src/renderer/src/components/SmartReactionInput.tsx`
- PiP behavior: `src/renderer/src/components/PipOverlay.tsx`
- Persistence and media/download services: `src/main/sessionStore.ts`, `src/main/preferencesStore.ts`, `src/main/mediaServices.ts`
- Styling and responsive behavior: `src/renderer/src/styles.css`
- Automated coverage for the above flows.

Verification performed:

- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed: 13 test files, 64 tests.
- Test run emitted React `act(...)` warnings in `WizardApp.test.tsx` around async `SmartReactionInput` updates. The suite still passes, but those warnings indicate some wizard-state assertions may not fully match browser timing.

No live external download, Patreon login, or real movie playback was performed because those require user media/account state. Native file dialogs and Electron child windows were audited through code paths and tests.

## Executive Summary

WatchAlong has a coherent desktop-first structure: library, modal import wizard, smart reaction picker, synchronized playback, PiP movie overlay, command panel, and local-first privacy messaging. The strongest UX work is in the focused playback interface, clear download progress, visible sync setup, and privacy copy around Patreon.

The highest-risk UX gaps are:

1. First-run onboarding is incomplete. `hasCompletedOnboarding` is stored but not used to automatically open onboarding, and the wizard skips the promised welcome and tool-check steps.
2. Missing or moved media files can strand users in a player view with disabled controls and no recovery prompt.
3. The wizard and download flows have several unhandled rejection paths. IPC/download failures can leave the UI stuck without a user-facing error.
4. File support is overpromised. The native picker allows MKV/AVI, but the player error later tells users to use browser-supported MP4/WebM codecs.
5. Keyboard accessibility is weakened by using `Tab` as a command-panel toggle and by not moving focus into the panel when it opens.
6. Patreon URL validation accepts any hostname ending in `patreon.com`, including lookalike domains such as `notpatreon.com`.

## Current End-to-End User Experience

### 1. App Launch

Expected user experience:

- The app opens a dark full-window shell.
- The renderer fetches the library and preferences.
- If `openLibraryOnLaunch` is true, the Library opens.
- If `openLibraryOnLaunch` is false and an active session exists, the player opens directly and media URLs are refreshed.

Observed behavior:

- The loading state is a simple centered WatchAlong mark and spinner.
- The default preference opens the Library.
- `hasCompletedOnboarding` exists in preferences and is set after wizard completion, but it does not currently trigger first-run onboarding.

Edge-case failures:

- Critical: if `getLibrary()` or `getPreferences()` rejects, the initial async effect has no catch path. The app can remain in the loading state indefinitely.
- High: first-run users with `hasCompletedOnboarding: false` still land on the empty Library instead of automatic onboarding.
- Medium: corrupted preference or library files silently normalize/reset. This avoids crashes, but users receive no explanation that saved state was repaired or lost.

### 2. Empty Library

Expected user experience:

- New users see an empty state: "Your watchalong collection is empty."
- Primary action is "New WatchAlong."

Observed behavior:

- The empty Library is clean and focused.
- Clicking "New WatchAlong" opens the import wizard.
- No first-run welcome, tool check, or ownership/privacy introduction appears before file selection.

Edge-case failures:

- High: onboarding can be skipped or cancelled with no alternate guidance. The user returns to the empty Library with no explanation of required tools or next steps.
- Low: the empty state says setup takes "a minute," but Patreon/download flows may require login, downloader checks, and manual session fallback.

### 3. Populated Library

Expected user experience:

- Saved sessions appear as cards, sorted by `updatedAt`.
- Cards show title, reaction source, relative update time, and progress.
- Grid/list display is controlled by preferences.
- Clicking a card opens that session.

Observed behavior:

- Library cards are visually concise and scannable.
- Long titles and filenames are ellipsized.
- The full Library is read-only except for opening sessions and starting a new one.

Edge-case failures:

- High: if a saved session points to moved/deleted files, opening it can load the player with disabled controls and no clear missing-file message or repair action.
- Medium: rename/delete functions exist in `App.tsx`, and an unused `LibraryPanel` renders those actions, but the current Library and Command Panel do not expose rename/delete for saved sessions.
- Medium: there is no search, filter, sort selector, or missing-media badge. This is acceptable for small libraries but weakens large-library UX.
- Low: relative time falls back to "Recently" for invalid timestamps, hiding data corruption.

### 4. New WatchAlong / Wizard Open

Expected user experience:

- The main player dims and pauses if playback is active.
- A modal 800 x 600 wizard opens.
- The wizard guides the user through movie, reaction, and ready-to-sync steps.

Observed behavior:

- Main window dimming and pause/resume on wizard lifecycle are covered by tests.
- The wizard is frame-less, centered over the parent, and uses a minimal title bar.
- `Esc` and the `X` close button cancel the wizard.

Edge-case failures:

- High: the wizard does not include the promised first-run Welcome step.
- High: the wizard does not call `checkTools()` or show dependency readiness before YouTube/Patreon flows.
- Medium: first-run users can cancel the wizard. If onboarding is meant to be mandatory until setup, this is not enforced.
- Medium: the title bar uses a text "X" instead of the existing icon system, which is less polished than the rest of the app.
- Low: native dialog cancellation produces no inline feedback. This is common, but a small "No file selected" status would reduce uncertainty.

### 5. Wizard Movie Step

Expected user experience:

- User selects a local movie file.
- Next is disabled until a movie is selected.
- Selected filename is shown in a success pill.

Observed behavior:

- The flow is simple and works in tests.
- Changing the movie after selecting a reaction resets the reaction and shows "Movie changed. Choose a reaction that matches it."

Edge-case failures:

- High: the file picker allows `mkv` and `avi`, but the playback layer later warns that only browser-supported codecs such as MP4/WebM may work. This creates a late failure after the user has already completed setup.
- Medium: no preflight metadata or codec compatibility check happens at selection time.
- Medium: a movie-only draft session can exist. The app handles this by showing the Smart Reaction overlay, but if the movie file later disappears the UI does not clearly distinguish "missing movie" from "still selecting reaction."

### 6. Wizard Reaction Step

Expected user experience:

- User chooses one of three reaction sources: local file, YouTube link, or Patreon post.
- Local file opens a file dialog.
- YouTube and Patreon expand inline forms.
- After reaction selection/download success, the wizard advances to Ready.

Observed behavior:

- Card selection and expansion are clear.
- Other cards remain visible and subdued.
- Local reaction selection is covered by tests.
- The Smart Reaction input fetches browser detection and saved Patreon status on mount.

Edge-case failures:

- Medium: the `movieReady` prop changes copy only. It does not disable reaction source actions by itself. Current parent flows avoid this in normal use, but the component is not self-protecting.
- Medium: browser detection failure is not caught. A rejected `detectBrowsers()` call can produce an unhandled rejection and prevent Patreon browser options from rendering cleanly.
- Low: all reaction cards are presented equally even though local file is the only offline, deterministic path.

### 7. Local Reaction Flow

Expected user experience:

- Click "Local file."
- Select a reaction video.
- The selected file is attached to the current draft/session.
- The user proceeds to sync setup.

Observed behavior:

- In the wizard, the selected reaction is shown and auto-advances to Ready after a short delay.
- In the main player overlay, selecting a local reaction persists it and opens sync setup when media is ready.

Edge-case failures:

- High: local reaction picker allows formats that may not be playable by Electron's HTML5 media engine.
- Medium: if `setSessionMedia()` rejects, there is no inline error handling. The card can appear selected while the session is not updated.
- Low: repeated clicks can reopen native dialogs without a visible busy state.

### 8. YouTube Reaction Flow

Expected user experience:

- User expands "YouTube link."
- User pastes a URL.
- "Download & Load" becomes enabled and pulses for valid-looking URLs.
- Progress displays with cancel support.
- On success, the downloaded file is attached automatically and sync setup begins.
- On failure, the user sees a human-readable error and can retry.

Observed behavior:

- YouTube URL validation accepts exact YouTube hostnames and `youtu.be`.
- Progress is visible with determinate or indeterminate state.
- The main player also shows a compact download indicator and the Command Panel shows recent downloads.

Edge-case failures:

- High: `startReactionDownload()` rejection is not caught. If IPC fails before a job ID is returned, the UI has no error state.
- Medium: URL validation accepts any page on a YouTube hostname, not just playable watch/short/link URLs. A non-video URL will pass the UI gate and fail later.
- Medium: "Retry" only clears the failed progress panel. It does not retry the same URL. Users must infer that they should press "Download & Load" again.
- Medium: `createDownloadDir()` can throw if the chosen directory is unavailable. That throw is not converted into a progress failure event.
- Low: there is no estimated file size, output location preview, or disk-space warning.

### 9. Patreon Reaction Flow

Expected user experience:

- User expands "Patreon post."
- User enters a Patreon post URL.
- The app offers secure sign-in, saved session reuse if available, Firefox instant session if available, and manual `session_id` fallback.
- Progress and errors are shown inline.
- After success, the app offers to save the Patreon session securely.

Observed behavior:

- Privacy copy is clear and local-first.
- Saved session prompt, sign-in window path, Firefox path, and manual fallback are covered by tests.
- Manual fallback is always visible once a valid-looking Patreon URL is entered.

Edge-case failures:

- Critical: `isValidPatreonPostUrl()` uses `hostname.endsWith('patreon.com')`. This accepts lookalike hostnames such as `notpatreon.com`. It should require `hostname === 'patreon.com' || hostname.endsWith('.patreon.com')`.
- High: `openPatreonLoginWindow()`, `extractPatreonSession()`, and `startReactionDownload()` calls are not wrapped in try/catch in the component. IPC failures can leave users without a visible error.
- High: if Electron `safeStorage` is unavailable, the save-session offer can leave the checkbox visually enabled even though storage did not happen.
- Medium: the design brief says manual fallback should appear after automatic extraction fails, but the current UX shows the manual `session_id` instructions immediately. This is transparent but visually heavy and may intimidate non-technical users.
- Medium: "No, re-authenticate" hides the saved-session prompt locally but does not explain that the saved session remains stored unless removed in Preferences.
- Medium: only Firefox gets native instant setup. Other detected browsers are not shown as selectable options, so users may not understand why Chrome/Edge/Brave are absent.
- Medium: the Patreon login window has no visible timeout or in-app instructions after it opens. If the login never yields a cookie, the main UI waits until the user closes that window.
- Low: error copy is humanized but does not include concrete next actions for subscription mismatch, paywall, deleted post, or age/restriction cases.

### 10. Ready Step

Expected user experience:

- User reviews selected movie and reaction.
- "Start Sync Setup" creates/switches the session, marks onboarding complete, and closes the wizard.

Observed behavior:

- Summary clearly shows both selected filenames.
- Finish button is disabled while finishing.
- Completion is covered by tests.

Edge-case failures:

- High: `completeWizard()` awaits session creation and onboarding completion without error handling. A persistence or IPC error can leave the button disabled and the wizard stuck.
- Medium: the Ready step says "Everything's loaded and safe" before media metadata/codec compatibility is validated.
- Low: there is no way to edit just one selected file from the summary except going Back.

### 11. Transition Into Player / Sync Setup

Expected user experience:

- After media is selected, the player opens.
- When both video elements load metadata, sync setup opens automatically.
- User aligns reaction and movie using independent scrubbers, then saves sync.

Observed behavior:

- `pendingSyncSetup` waits for `canPlay` before entering setup.
- Sync setup has separate reaction/movie preview controls, -5s/-0.25s/+0.25s/+5s nudges, timeline sliders, Cancel, and Save Sync.
- Save writes offset and last reaction time.

Edge-case failures:

- High: if either media URL is null or metadata never loads, pending sync setup does not open and there is no specific "waiting for media" or "file missing" explanation.
- Medium: setup offset preview displays `movie - reaction`, but save uses `TimelineMapping.calculateOffset()` with `movieRateCorrection`. The preview can be misleading when rate correction is not 1.0.
- Medium: `toggleSetupPreview()` awaits `video.play()` without a catch. A media play rejection can become an unhandled rejection.
- Medium: if metadata loading times out inside `SyncController`, the user sees a generic timeout error, not which file/codec caused it.
- Low: scrubber buttons are mouse/touch-friendly but there are no dedicated setup keyboard shortcuts.

### 12. Main Playback

Expected user experience:

- Reaction video fills the main window.
- Movie appears in a draggable/resizable PiP overlay.
- Transport controls support play/pause, seek, timeline, sync setup, subtitles, fullscreen, and command panel.
- Metadata row shows state, files, offset, speed, source rate, and volumes.
- Controls auto-hide while playing.

Observed behavior:

- The playback UI is dense but functional for a desktop media tool.
- Keyboard shortcuts exist for play/pause, seek, reaction mute, movie mute, PiP visibility, and offset nudges.
- Sync controller handles buffering, seeking, drift correction, and offset mapping.

Edge-case failures:

- Critical: if a saved complete session has paths but `getMediaUrl()` returns null because files are missing, `hasMedia` is false and `showSmartInput` is false. The user sees a player control bar with disabled playback and no repair prompt.
- High: media error copy says to use MP4/WebM, but the picker previously allowed additional formats. The failure occurs too late.
- Medium: while media is loading, controls are disabled but the UI does not clearly show "loading media" per file.
- Medium: repeated timeline dragging queues seeks on every change. This can feel laggy on large files.
- Medium: volume sliders persist every change through IPC, which may cause unnecessary disk writes during dragging.
- Medium: fullscreen failures are not caught.
- Low: auto-hide hides the cursor and control bar, but no on-screen hint explains how to reveal controls.

### 13. Picture-in-Picture Movie Overlay

Expected user experience:

- Movie PiP can be dragged, snapped, resized, hidden, and restored.
- Subtitles render inside the PiP overlay.

Observed behavior:

- PiP geometry is constrained to the viewport.
- Dragging can snap near corners.
- Snap, hide, resize, and restore controls have accessible labels.
- Subtitle text uses high-contrast overlay styling.

Edge-case failures:

- Medium: PiP drag/resize has no keyboard equivalent.
- Medium: the resize handle only resizes from the bottom-right and does not preserve aspect ratio.
- Medium: if the viewport becomes smaller than persisted PiP dimensions, the overlay is constrained but width/height remain large. On small windows it can dominate the player.
- Low: PiP controls only appear on hover, which is weak for touch and keyboard users.

### 14. Command Panel

Expected user experience:

- User opens Command Panel with the gear button or `Tab`.
- Panel includes Now Playing, Library, Downloads, Preferences, and Help/About.
- Escape closes the panel.
- Arrow Up/Down moves between focusable controls.

Observed behavior:

- The panel is useful and keeps advanced controls out of the main playback surface.
- Accordion summaries are compact and scannable.
- Downloads can be cancelled or attached from the panel.
- Preferences include download directory, Patreon saved-session clearing, launch behavior, library view, and wizard access.

Edge-case failures:

- High: hijacking `Tab` to open/close the panel breaks normal keyboard navigation expectations. When the panel opens, focus is not automatically moved into it.
- Medium: Arrow-key focus movement only includes buttons, inputs, and `[tabindex="0"]`; links and future controls could be skipped.
- Medium: "Swap Reaction" opens the full import wizard starting at movie selection. That label suggests a targeted reaction replacement flow but does not deliver one.
- Medium: "Show import wizard again" is under Preferences, but it opens the import flow rather than a reusable onboarding/help tour.
- Medium: "Close Session" really navigates back to Library and unloads media URLs. It does not close/delete a session.
- Medium: Help/About has no online help because `ONLINE_HELP_URL` is null.
- Low: recent Library list is capped at 10 without a "more" affordance except "View Full Library."

### 15. Preferences

Expected user experience:

- User can choose download directory.
- User can clear saved Patreon session.
- User can choose launch behavior and Library grid/list view.

Observed behavior:

- Preferences are colocated in Command Panel.
- Most changes persist immediately.

Edge-case failures:

- High: selecting a download directory does not verify write access or available disk space.
- Medium: Patreon saved-session control is a checkbox where unchecking deletes credentials, but checking is disabled unless a session already exists. This is functionally correct but semantically confusing.
- Medium: subtitle defaults appear as "Coming later," which exposes unfinished scope in a production UI.
- Low: changing Library view from the player has no immediate visible confirmation unless the user returns to Library.

### 16. Downloads and Background States

Expected user experience:

- Downloads run in the background.
- Current status appears as a floating indicator.
- Recent download events appear in Command Panel.
- Successful downloads can be attached.

Observed behavior:

- Download events are capped to 8 recent items.
- Success/failure indicators auto-clear after 5 seconds in the floating indicator.
- Cancelled downloads are removed from recent events.

Edge-case failures:

- High: app quit/restart during a download has no recovery or partial-download explanation.
- High: spawn/setup errors before progress event emission can fail silently from the user's perspective.
- Medium: the floating indicator and Patreon storage offer share the same bottom-right area, so simultaneous success/storage states can overlap or compete.
- Medium: failed downloads keep only recent in-memory context. There is no persistent failed-download history or direct "open download folder" action.
- Low: indeterminate progress uses a hard-coded 42 percent visual fallback in some places, which can look like real progress.

### 17. Subtitles

Expected user experience:

- User opens an SRT/VTT subtitle file.
- Subtitles appear over the movie PiP.
- User can clear the current subtitle.

Observed behavior:

- Subtitle parsing and active-cue lookup are tested.
- Clear action appears in the metadata row using the subtitle filename.

Edge-case failures:

- Medium: missing/unreadable subtitle files silently result in no subtitles.
- Medium: parsing failures do not produce an actionable message.
- Low: there are no subtitle styling, offset, font size, or encoding controls yet.

### 18. Session Persistence

Expected user experience:

- Sessions preserve paths, source, offset, resume position, PiP geometry, volume/mute, playback rate, source-rate correction, and subtitles.
- Existing reaction/movie pairs are reused rather than duplicated.

Observed behavior:

- Session normalization is robust.
- Movie-only drafts are supported and tested.
- Complete sessions are not overwritten when starting a new movie draft.

Edge-case failures:

- High: session writes are optimistic from the renderer. Most `persist()` calls do not display errors if saving fails.
- Medium: missing files are not marked in the Library before opening.
- Medium: persisted media paths are absolute. This is expected for a local app, but moving media folders creates a dead session with poor recovery.
- Low: position persistence throttles to 1.5 seconds while playing, so the last second or two can be lost on crash.

## Prioritized Recommendations

### P0 - Fix Before Broad User Testing

1. Add first-run routing. If `hasCompletedOnboarding` is false, automatically open the wizard or show a real onboarding overlay.
2. Add a missing-media recovery state. When `getMediaUrl()` returns null for a saved path, show which file is missing and provide "Locate file," "Replace reaction," "Replace movie," and "Back to Library."
3. Harden async UI calls with try/catch and inline error states, especially initial library load, wizard completion, media selection persistence, Patreon auth, and download start.
4. Fix Patreon URL validation to require exact `patreon.com` or a dot-prefixed subdomain.
5. Align file picker filters with actual HTML5 playback support, or add immediate codec/container validation after selection.

### P1 - Improve Core UX Quality

1. Implement the missing Welcome and Tool Check wizard steps, using the existing `checkTools()` IPC.
2. Replace `Tab` command-panel toggle with a non-navigation shortcut such as `Ctrl+K`, `/`, or a documented button-first path. Move focus into the panel on open and restore focus on close.
3. Make "Swap Reaction" a targeted reaction replacement flow instead of reopening the full movie-first wizard.
4. Add Library management actions for rename/delete in the full Library or Command Panel.
5. Add write-access checks for the chosen download directory and clearer download failure recovery.
6. Make Patreon saved-session controls explicit: "Forget saved Patreon session" as a button, not a disabled/enabled checkbox.

### P2 - Polish and Scale

1. Add search/filter/sort for larger libraries.
2. Add an "Open download folder" action after successful downloads.
3. Add subtitle parse errors, subtitle offset, and subtitle style controls.
4. Add keyboard support for PiP snap/hide/resize and sync setup nudges.
5. Reduce write frequency from sliders by committing on pointer release or debounce.
6. Add a short first-play hint for revealing controls and opening the command panel.

## Test Coverage Notes

Good existing coverage:

- Library default/resume launch behavior.
- Empty Library import action.
- Keyboard shortcuts for mute and offset.
- Playback attachment after metadata.
- Movie source-rate offset preservation.
- Wizard movie/reaction/ready flow.
- Wizard cancellation and movie-change reset.
- Smart Reaction YouTube, Patreon sign-in, Firefox, manual fallback, saved session prompt, and storage offer.
- Sync controller drift, seek, buffering, command queue, timeline, subtitles, and PiP geometry.

Coverage gaps to add:

- Initial `getLibrary()`/`getPreferences()` rejection.
- Saved session with missing reaction/movie file.
- `startReactionDownload()` rejection before job creation.
- Patreon login/extraction IPC rejection.
- `completeWizard()` persistence failure.
- `safeStorage` unavailable after user toggles save.
- Keyboard focus behavior when opening/closing Command Panel.
- File picker selecting unsupported-but-allowed containers.

## Overall Assessment

The current UI is a strong prototype for a local-first watchalong tool, especially in the playback surface and source selection concept. The main UX risk is not visual polish; it is incomplete recovery for real-world failure states: missing files, rejected IPC calls, unsupported media, downloader setup failures, and account/session edge cases. Addressing those states will make the app feel reliable and self-explanatory instead of requiring users to infer what went wrong.
