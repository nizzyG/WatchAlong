# v1.2 Bug Fixes — Dispatch

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol` (continue on this branch)
**Predecessor:** [QoL dispatch](./2026-07-13-v1.1-qol-dispatch.md)
**Scope:** Three bugs and one simplification. Design iteration is on hold — fix functionality first.

---

## Bug 1 — Session resume position does not restore (critical)

**The symptom:** The user closes a session, reopens it later, and playback starts from zero. The sync is saved correctly, but the playback position (`lastReactionTimeSeconds`) does not restore.

**The root cause (already diagnosed):** The save works — `flushCurrentSessionPosition` writes `lastReactionTimeSeconds` to the store via IPC. But the load reads from a stale React state object. At `useWatchAlongController.tsx:404`, `loadSession(session.lastReactionTimeSeconds)` uses `session`, which is `activeSession` — a React state variable derived from the library state. When the session reopens, that state hasn't been refreshed from disk; it still holds the old `lastReactionTimeSeconds`.

**The fix:** The position is on disk. The player reads a stale React state instead of the freshly-saved value. Either refresh the library from the store after flushing, or pass the flushed position directly to the restore instead of reading it back from the session object. The Creative Director confirmed the bug reproduces on every session close/reopen — verify the fix by closing a session mid-playback, reopening it, and confirming playback resumes from the saved position.

**Important:** This is not a regression from your QoL work. The previous version had the same bug. But you added the `loadSession` call at line 404, so the fix is yours to land.

## Bug 2 — Patreon login window does not complete Google OAuth (critical)

**The symptom:** The user clicks the in-app Patreon sign-in window. The window opens. The user signs in via Google OAuth. The OAuth flow does not complete — the session cookie is not captured, and the login fails.

**The root cause (diagnosed by comparison):** The old code (which worked) was simpler. It allowed OAuth popups to navigate freely within the allowed hosts and only blocked external URLs. Your new `PatreonLoginWindowManager` adds security hardening — `denyPatreonLoginPermissions`, aggressive session isolation, `destroy()` instead of `close()`. One of these is breaking Google's OAuth redirect chain. The popup probably opens but cannot complete the redirect back to Patreon, or the cookie isn't captured because the session is being cleared too aggressively.

**The fix:** The security hardening is good work, but it's too aggressive for the OAuth flow. The login window must allow the full redirect chain: Patreon → Google sign-in → Google redirect → back to Patreon → cookie set. Compare your `hardenWindow` / `installPatreonNavigationGuards` behavior against the old inline code (available at commit `ad3564d:src/main/ipc/patreonIpc.ts`). The old code's approach was: allow navigation to any `isAllowedPatreonLoginUrl` host, block everything else, install the same guard on popups via `did-create-window`. Your code does this too, but something in the session isolation or permission denial is breaking the chain.

**Diagnostic step:** The Creative Director cannot tell us where the flow breaks. You need to test it yourself — run the app, open the Patreon login window, sign in with Google, and observe where it fails. Does the Google popup open? Does it let you sign in? Does it redirect back to Patreon? Does the cookie get set? The observation will tell you which hardening step is the culprit.

**Also:** Remove all browser extraction options except Firefox. The Creative Director has confirmed that Chromium browsers' cookie storage is in-kernel and inaccessible — only Firefox supports one-click extraction. The UI should offer two paths only: **Firefox** (one-click cookie extraction) and **Sign in with browser** (the in-app login window). Remove Chrome, Edge, Brave, Safari, and Opera from the browser detection and the UI. This simplifies the code and removes options that never worked reliably.

## Bug 3 — Misleading error message on MKV movie files

**The symptom:** When playing a session with an MKV movie file, an error message appears at the bottom of the control panel: "The reaction video could not be played by Electron's HTML5 video engine. Use an MP4/WebM file with browser-supported codecs." But both videos play flawlessly. The error is misleading.

**The likely cause:** The error handler fires on a codec event from the *movie* file (MKV containers can have streams that Chromium partially supports but flags with warnings), but the message incorrectly names the reaction video. The fix: check which video element actually fired the error and name the correct file in the message. If the movie plays fine, the error should either not fire at all, or the message should be suppressed when playback is actually working.

**Lower priority than Bugs 1 and 2.** Playback works — this is a misleading message, not a broken feature.

## Bug 4 — "Reactor not identified" for manually loaded reactions

**The symptom:** When a reaction is loaded as a local file (e.g., from Google Drive), there's no metadata to scrape. The session title falls back to the filename, and the "By Reactor" library view shows "Reactor not identified."

**The fix:** Add a UI affordance to let the user name the reactor for a session. The rename-session dialog already exists — extend it to optionally accept a reactor name. Or add an editable reactor field on the session card in the library. The session model already has the title field; the reactor name can be derived from the title or stored as a new optional field on the session. The Creative Director's instinct is that this should be easy in the UI — a click-to-edit on the reactor name in the library card, or a field in the rename dialog.

**Lower priority than Bugs 1 and 2.** This is a UX gap, not a broken feature.

---

## Priority order

1. **Bug 1** (session resume) — critical, blocks the core experience
2. **Bug 2** (Patreon login + browser simplification) — critical, blocks Patreon downloads
3. **Bug 3** (MKV error message) — annoying but playback works
4. **Bug 4** (reactor naming) — UX gap for manually loaded files

Fix 1 and 2 first. The Creative Director is testing auto-sync against new pairings and needs Patreon downloads working. Verify each fix by running the app and reproducing the user's scenario before reporting done.

## What stays on hold

- Design iteration (colors, corner wording, PiP border) — hold until bugs are fixed
- Movie poster art for "By Movie" view — future feature, needs scoping
- Everything else from the QoL dispatch — shipped, working, don't touch
