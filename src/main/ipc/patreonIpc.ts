import type { BrowserWindow as BrowserWindowType } from 'electron'
import { IPC_PREFIX } from '../constants'
import { isBrowserName, isPatreonSessionToken } from '../ipcValidation'
import { detectBrowsers, extractPatreonSession } from '../services/cookieExtraction'
import { PatreonSessionVault } from '../services/patreonSessionVault'
import { DownloadManager } from '../services/downloadManager'
import { PatreonLoginWindowManager } from '../services/patreonLoginWindow'
import { ToolResolver } from '../services/toolResolution'
import { handleTrustedIpc } from './security'
import { getSenderWindow } from './utils'

const APP_RENDERERS = ['main', 'wizard'] as const

export function registerPatreonIpc(deps: {
  toolResolver: ToolResolver
  patreonVault: PatreonSessionVault
  downloadManager: DownloadManager
  mainWindowGetter: () => BrowserWindowType | null
}): { dispose(): Promise<void> } {
  const { toolResolver, patreonVault, downloadManager, mainWindowGetter } = deps
  const loginWindows = new PatreonLoginWindowManager(patreonVault)
  handleTrustedIpc(`${IPC_PREFIX}:detect-browsers`, APP_RENDERERS, () => detectBrowsers())
  handleTrustedIpc(`${IPC_PREFIX}:extract-patreon-session`, APP_RENDERERS, (_event, browser: unknown) => {
    if (!isBrowserName(browser)) {
      throw new Error('Invalid browser selection.')
    }
    return extractPatreonSession(browser, toolResolver, patreonVault)
  })
  handleTrustedIpc(`${IPC_PREFIX}:open-patreon-login-window`, APP_RENDERERS, (event) => {
    const parent = getSenderWindow(event, mainWindowGetter)
    return parent ? loginWindows.open(parent) : { ok: false, message: 'Main window is not ready.' }
  })
  handleTrustedIpc(`${IPC_PREFIX}:get-saved-patreon-session-status`, APP_RENDERERS, () => patreonVault.status())
  handleTrustedIpc(`${IPC_PREFIX}:discard-patreon-session-token`, APP_RENDERERS, (_event, token: unknown) => {
    if (!isPatreonSessionToken(token)) {
      throw new Error('Invalid Patreon session token.')
    }
    patreonVault.discardToken(token)
  })
  handleTrustedIpc(`${IPC_PREFIX}:forget-patreon-session`, APP_RENDERERS, async () => {
    // Advance the vault epoch before closing windows so no cookie callback can
    // mint a fresh token in the gap.
    try {
      return downloadManager.forgetPatreonSession()
    } finally {
      await loginWindows.closeAll()
    }
  })

  return { dispose: () => loginWindows.dispose() }
}
