# v1.2 Bug Fixes — Follow-Up Dispatch (Round 2)

**From:** Executive Studio Coordinator
**To:** Senior Codesmith (Sol)
**Branch:** `codex/v1.2-qol` (continue on this branch)
**Predecessor:** [Bugfix dispatch](./2026-07-14-bugfix-dispatch.md)
**Scope:** Two critical bugs remain. Both were reported as fixed but are still broken. Bugs 3 and 4 are confirmed working — do not touch them.

---

## What's confirmed working

- **Bug 3 (MKV error message):** Fixed. The Creative Director confirmed it no longer fires on Tombstone MKV.
- **Bug 4 (reactor naming):** Working. Reactor names are editable and integrated into the By Reactor view.

Do not modify these.

## What's still broken

### Bug 1 — Session resume: position saves as 0 to disk (critical, still broken)

Your fix addressed the right layer — switching from the stale `session` React state to `sessionRef.current`. That was a real fix for the original diagnosis. But the position is still `0.0` on disk. The problem is one layer deeper.

**The evidence:** I read `library.json` directly. The two Tombstone sessions tested after your fix show:
- `lastReactionTimeSeconds: 0.0` — the position value is zero
- `updatedAt: 2026-07-14T05:57:39` — the session WAS written to (the IPC call succeeded)

So the IPC call goes through. The session gets touched. But the position value being passed to `saveSessionPosition` is `0`. Meanwhile, older sessions (Anchorman at 5667s, X-Men at 7459s) have real positions — but those were saved before the v1.2 refactor changed the controller lifecycle.

**The diagnosis:** `flushCurrentSessionPosition` reads `reactionVideoRef.current?.currentTime`, falling back to `positionRef.current`. At flush time, one of these is returning 0. Either:
- The `<video>` element has already been reset/unmounted before the flush reads it, OR
- The periodic save inside the SyncController's `onPosition` callback (line 191 of `useWatchAlongController.tsx`) is never firing — meaning `positionRef` stays at 0 throughout playback because the callback that updates it isn't being called.

The periodic save is gated on `now - lastPositionSaveRef.current > 1500 && currentSession.reactionPath && currentSession.moviePath`. If `onPosition` isn't firing, or if `sessionRef.current` doesn't have the paths at that moment, the periodic save never runs.

**The verification you must do:** Your 380 tests pass, but this is a timing/lifecycle issue that mock tests with fake video elements cannot catch. The test environment doesn't have a real `<video>` element with a real `currentTime` that resets on unmount. You must verify the fix by running the actual app:

1. Launch the app in dev mode.
2. Open a session, play for 30+ seconds.
3. Navigate to the library (or close the app).
4. Read `%APPDATA%/WatchAlong/library.json` and confirm `lastReactionTimeSeconds` is non-zero for that session.
5. Reopen the session and confirm playback resumes from the saved position.

If the position is still 0 on disk after step 4, the fix is not done. Do not report success based on tests alone.

### Bug 2 — Patreon login: both Firefox extraction AND Google OAuth are broken (critical, still broken)

Your self-report said "Live credentialed Patreon login could not be exercised without credentials." The dispatch explicitly told you to test it yourself by running the app and signing in with Google. That step was skipped.

**The evidence from the Creative Director:**
- **Firefox one-click extraction:** Was working before the v1.2 refactor. Now broken. This is a regression — the old code extracted the `session_id` cookie from Firefox's cookie store via yt-dlp. Something in your refactoring broke this path.
- **Google OAuth in-app login window:** The Creative Director can trigger Google 2FA and approve it on their phone, but the flow goes nowhere after that. A second attempt gets a **400 error** from Google. That 400 means Google's OAuth server is rejecting the redirect — the redirect URL Google is trying to send the user back to is being blocked or modified by your navigation guards.

**The likely cause for OAuth:** The old code (which worked, at commit `ad3564d:src/main/ipc/patreonIpc.ts`) allowed popups to navigate freely within `isAllowedPatreonLoginUrl` hosts. Your new `hardenWindow` installs `installPatreonNavigationGuards` on every popup, including Google's OAuth popup. The `isTrustedRendererNavigation` check compares pathname and search string **exactly** — Google's OAuth redirect chain navigates through intermediate URLs with varying query parameters that would fail this exact comparison and get blocked.

**The likely cause for Firefox extraction:** Compare your refactored `cookieExtraction.ts` and the IPC handler in `patreonIpc.ts` against the pre-refactor code. The Firefox extraction path should be unchanged from v1.0.1 — if it's broken, something in the IPC security layer (`handleTrustedIpc`) or the extraction module's refactoring broke it. Check whether the `extract-patreon-session` IPC channel is being blocked by `isTrustedIpcSender`.

**The verification you must do:**
1. Launch the app in dev mode.
2. Test the Firefox one-click extraction. Does it find Firefox? Does it extract the cookie? Does it return a token?
3. Test the Google OAuth flow. Does the sign-in window open? Does the Google popup open? Does 2FA complete? Does the redirect back to Patreon succeed? Where exactly does it break?
4. Report which step fails for each path. The observation tells you the fix.

---

## What I need from you

Two bugs, both critical, both requiring manual verification with the running app. Your tests are passing but the bugs persist — that means the tests don't cover the real failure mode. Fix the bugs, then verify by running the app and reproducing the Creative Director's exact scenarios.

Do not report done until you have:
- Played a session for 30+ seconds, closed it, and confirmed `library.json` shows a non-zero `lastReactionTimeSeconds`.
- Successfully connected to Patreon via either Firefox extraction or Google OAuth, completing the full flow and capturing a session token.

These are the two blockers preventing the Creative Director from testing auto-sync against Patreon-hosted reactions. Everything else is working. Fix these two and v1.2 ships.
