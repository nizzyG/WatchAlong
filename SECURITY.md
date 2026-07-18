# Security

Anything that touches your Patreon credentials needs to be handled with care. Here's how WatchAlong handles yours, and what you should know.

## Your Patreon session is a bearer token

The `session_id` cookie from Patreon is a bearer token — anyone who has it can authenticate as you on Patreon. WatchAlong treats it accordingly.

## How the session is handled

### Extraction (Firefox)

If you choose the Firefox one-click extraction:
1. WatchAlong pre-creates an owner-only cookie file (`0600` where supported), then `yt-dlp` reads your browser's cookie store and writes a short-lived cookie jar there; that jar can include cookies beyond Patreon
2. As soon as `yt-dlp` exits, WatchAlong rewrites the jar to retain only Patreon's `session_id`, then reads that value
3. WatchAlong performs best-effort clearing of the file and removes the temporary directory after the attempt; app shutdown and the next launch retry matching leftovers if a crash or file lock interrupts cleanup

### Login window

If you use the in-app login window:
1. An isolated browser window opens (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
2. Top-level navigation and new windows are restricted to Patreon domains and selected identity providers (Google, including its exact `accounts.youtube.com` authentication bridge; Facebook; Apple)
3. Only `session_id` cookies from `patreon.com` are read — nothing else
4. After the cookie is captured, the login window closes normally so the identity provider can finish its OAuth callback

### During download

1. A temporary config file containing the session cookie is written to an OS temp directory
2. File permissions are set to `0600` (owner read/write only where supported). This reduces accidental exposure but is not a defense against malware, administrator/root access, or other processes running as your user.
3. `patreon-dl` uses this config to authenticate with Patreon
4. WatchAlong performs best-effort clearing of the credential file and removes the temp directory when the run ends; app shutdown and startup cleanup retry matching leftovers if the OS keeps a file locked
5. After a successful download, the session is held briefly in memory so you can choose to save it

Best-effort clearing overwrites credential contents before deletion when the file is still accessible. It reduces ordinary plaintext remnants, but it is not forensic erasure: SSD wear levelling, filesystem journals, backups, indexers, or privileged software may retain earlier blocks or copies.

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

1. Use **Forget saved Patreon sign-in** in WatchAlong's Preferences to remove its encrypted local copy.
2. Follow Patreon's current [compromised-account guidance](https://support.patreon.com/hc/en-us/articles/207483443-Login-help): log out of Patreon and reset your password. If you know the current password, Patreon documents the current web path as **Member profile → Settings → Account → Login** in [How to change my password](https://support.patreon.com/hc/en-us/articles/44781453964557-How-to-change-my-password).
3. If you sign in through Google, Apple, or Facebook, secure that identity-provider account too. Patreon's guidance notes that those accounts may not have a Patreon password.
4. Contact [Patreon Product Support](https://support.patreon.com/hc/en-us/articles/360042749811-How-to-contact-Patreon-Product-Support) and ask them to invalidate every active Patreon session if you believe a bearer cookie was exposed. The Patreon Help Center pages reviewed on July 15, 2026 do not document a self-service “sign out all sessions” control or promise that a password change alone invalidates every existing cookie.
5. Sign back in to Patreon and reconnect WatchAlong only after the account is secure.

Do not use **Connected apps** for this purpose. Patreon documents that area as revoking OAuth access granted to [third-party applications](https://support.patreon.com/hc/en-us/articles/115004061726-What-information-do-third-party-apps-receive-about-my-Patreon-account); WatchAlong authenticates with a browser session cookie and is not registered as a Patreon OAuth app.

## App hardening

### Renderer security

- **Content Security Policy:** `default-src 'self'` with tight media, script, and image restrictions
- **Patreon login window:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **App windows:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

### Known limitations

- Renderer IPC is restricted by window role, trusted origin, and validated argument shapes. Local media access is capability-bound to picker selections, completed downloads, and paths already stored in the library.
- Firefox one-click extraction asks `yt-dlp` to export Firefox's cookie store. The temporary jar can therefore contain cookies for sites other than Patreon while the child process is running. WatchAlong immediately rewrites it to the single Patreon `session_id` after the child exits. Owner-only permissions, a private temp directory, prompt filtering and best-effort clearing, and shutdown/startup cleanup reduce exposure; a future implementation should read only Patreon's domain directly so the full jar never exists.
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
