# Security

Anything that touches your Patreon credentials needs to be handled with care. Here's how WatchAlong handles yours, and what you should know.

## Your Patreon session is a bearer token

The `session_id` cookie from Patreon is a bearer token — anyone who has it can authenticate as you on Patreon. WatchAlong treats it accordingly.

## How the session is handled

### Extraction (automatic browser)

If you use the automatic browser extraction:
1. `yt-dlp` reads your browser's cookie store and writes a short-lived cookie jar in a private OS temp directory; that jar can include cookies beyond Patreon
2. WatchAlong reads only Patreon's `session_id` value from that file
3. WatchAlong removes the temporary directory after the attempt; if a crash or file lock interrupts cleanup, the next app launch retries it before opening a window

### Login window

If you use the in-app login window:
1. An isolated browser window opens (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
2. Navigation is restricted to Patreon domains and selected identity providers (Google, Facebook, Apple)
3. Only `session_id` cookies from `patreon.com` are read — nothing else
4. The window is destroyed after the cookie is captured

### Manual entry

If you paste the session ID yourself, it goes directly into memory. No temp file.

### During download

1. A temporary config file containing the session cookie is written to an OS temp directory
2. File permissions are set to `0600` (owner read/write only where supported). This reduces accidental exposure but is not a defense against malware, administrator/root access, or other processes running as your user.
3. `patreon-dl` uses this config to authenticate with Patreon
4. WatchAlong clears the credential file and removes the temp directory when the run ends; if the OS keeps a file locked, startup cleanup retries it
5. After a successful download, the session is held briefly in memory so you can choose to save it

### Saving (optional)

If you choose to save:
1. The session is encrypted using Electron's `safeStorage.encryptString()`
2. Encrypted data is written to `patreon-session.bin` in WatchAlong's `userData` directory
3. The app checks `safeStorage.isEncryptionAvailable()` before saving — if your OS doesn't support secure storage, you'll be warned and the save option won't be offered

If you decline or dismiss the save prompt, the session is discarded from memory immediately.

### Forgetting

You can delete the saved session at any time from the Preferences panel. This deletes `patreon-session.bin` and removes the session from memory.

## How to revoke your session

If you're ever concerned that your session may have been compromised:

1. Go to Patreon → Settings → Connected apps
2. Sign out of all sessions
3. Log back in

This invalidates all existing `session_id` tokens, including any saved in WatchAlong. You'll need to re-authenticate in WatchAlong afterward.

## App hardening

### Renderer security

- **Content Security Policy:** `default-src 'self'` with tight media, script, and image restrictions
- **Patreon login window:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **App windows:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

### Known limitations

- Renderer IPC is restricted by window role, trusted origin, and validated argument shapes. Local media access is capability-bound to picker selections, completed downloads, and paths already stored in the library.
- On Linux, Electron's `safeStorage` behavior depends on the desktop environment's secret service. Some setups use weaker fallback encryption. Check Electron's [safeStorage docs](https://www.electronjs.org/docs/latest/api/safe-storage) for your distribution.

### Logging

Log messages strip `session_id` tokens before being written. What appears in logs: file paths, download progress, tool versions. What doesn't: your Patreon cookie.

## Reporting a security issue

If you find a vulnerability, please don't open a public issue. Email me: `watchalong@pm.me`. I'll respond within 48 hours.

Please include:
- A description of the issue
- Steps to reproduce
- Affected version(s)

I don't run a bug bounty program — this is a free project — but I take security issues seriously and I'll fix them as fast as I can.
