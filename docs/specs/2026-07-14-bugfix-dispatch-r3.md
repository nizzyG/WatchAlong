# v1.2 Bug Fixes — Patreon OAuth (Round 3)

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol`
**Predecessor:** [Round 2 dispatch](./2026-07-14-bugfix-dispatch-r2.md)
**Scope:** One bug. The Google OAuth flow in the Patreon login window is still broken after two fix attempts. Everything else is confirmed working.

---

## What's confirmed working (do not touch)

- Session resume: fixed (1594.7s confirmed on disk)
- Firefox one-click extraction: working
- MKV error suppression: fixed
- Reactor naming: working
- Download progress + autosync roll-in: working
- Sync engine and auto-sync pure modules: untouched

## The bug

The Creative Director tested the Google OAuth flow a third time. Same failure point:

1. In-app Patreon sign-in window opens
2. Google sign-in proceeds
3. Google 2FA triggers
4. Creative Director approves on their Android phone
5. **The flow stalls — "it just doesn't go anywhere"**
6. Trying again closes the browser window
7. WatchAlong shows "Patreon downloader is not ready"

The first fix attempt got a 400 error from Google (redirect actively blocked). The second fix attempt (narrowing the permission denial to allow `storage-access`) changed the symptom — no more 400, but the flow stalls instead. The redirect from Google back to Patreon isn't being blocked now; it's just not completing.

## The likely cause

After 2FA approval, Google's OAuth popup needs to communicate the auth result back to the parent Patreon page. This typically happens via `window.opener.postMessage()`. The security-hardened popup (`contextIsolation: true`, `sandbox: true`) may be breaking that `window.opener` reference. The popup authenticates, Google approves, but the message back to Patreon never arrives — so Patreon never creates the session, never sets the `session_id` cookie, and the cookie monitor never fires.

This is a well-known class of issue with Electron OAuth flows. The popup-to-parent communication is fragile under security hardening.

## What I need from you

**You must test this with the running app.** Open DevTools on the login window, attempt the Google OAuth flow, and watch:
- Does the Google popup open?
- After 2FA approval, does any navigation happen in the popup?
- Is there a `postMessage` error in the console?
- Does the `session_id` cookie ever get set in the login session?

The observation tells you the fix. You have been told twice to test this manually and have not done so. Do not report done without having completed a full Google OAuth sign-in in the running app.

## The fallback

The old Patreon login window code (at commit `ad3564d:src/main/ipc/patreonIpc.ts`) **worked.** It was simpler — no permission denial, no aggressive session isolation, no `destroy()` on close. It allowed popups to navigate freely within `isAllowedPatreonLoginUrl` hosts and installed the same guard on popups via `did-create-window`.

If you cannot make the security-hardened OAuth flow work after testing it yourself, **fall back to the old code.** Restore the old `openPatreonLoginWindow` function as it existed before the v1.2 security hardening. The security improvements you added (IPC validation, renderer security policy, media path grants) are valuable and stay — but the Patreon login window's security hardening is breaking the primary login flow, and a working login is more important than a hardened one.

You can re-harden the login window incrementally in a future release, testing the OAuth flow after each change. For now: **it must work.**

## Success condition

The Creative Director can sign in to Patreon via Google OAuth in the in-app window, the `session_id` cookie is captured, and the full-length reaction download completes. No 400 errors, no stalls, no "Patreon downloader is not ready."
