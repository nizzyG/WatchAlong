import {
  BrowserWindow,
  shell,
  type BrowserWindowConstructorOptions
} from 'electron'
import { randomUUID } from 'node:crypto'
import { isAllowedPatreonLoginUrl } from '../patreonLoginUrls'
import { hardenPatreonLoginSession } from '../webContentsSecurity'
import { appIconPath } from '../constants'
import { findPatreonSessionCookieValue } from './cookieExtraction'
import { PatreonSessionVault } from './patreonSessionVault'

export interface PatreonLoginResult {
  ok: boolean
  token?: string
  message?: string
}

export type PatreonLoginWindowFactory = (
  options: BrowserWindowConstructorOptions
) => BrowserWindow

interface ActivePatreonLogin {
  cancel(): void
}

const CANCELLED_MESSAGE = 'Patreon sign-in was cancelled.'

/**
 * Owns every short-lived Patreon login partition. The manager is deliberately
 * separate from IPC registration so Forget and app shutdown can cancel every
 * active browser flow in one place.
 */
export class PatreonLoginWindowManager {
  private readonly activeLogins = new Set<ActivePatreonLogin>()

  constructor(
    private readonly vault: PatreonSessionVault,
    private readonly createWindow: PatreonLoginWindowFactory = (options) =>
      new BrowserWindow(options)
  ) {}

  open(parent: BrowserWindow): Promise<PatreonLoginResult> {
    const authorizationEpoch = this.vault.authEpoch
    const partition = `patreon-login-${randomUUID()}`
    let loginWindow: BrowserWindow

    try {
      loginWindow = this.createWindow({
        width: 800,
        height: 600,
        minWidth: 760,
        minHeight: 560,
        parent,
        modal: false,
        title: 'Sign in to Patreon',
        backgroundColor: '#05070a',
        autoHideMenuBar: true,
        icon: appIconPath(),
        webPreferences: secureLoginWebPreferences(partition)
      })
      hardenPatreonLoginSession(loginWindow.webContents.session)
    } catch {
      return Promise.resolve({
        ok: false,
        message: 'WatchAlong could not open the Patreon sign-in window.'
      })
    }

    return new Promise((resolve) => {
      const loginSession = loginWindow.webContents.session
      let settled = false
      let timer: NodeJS.Timeout | undefined
      let scope: ActivePatreonLogin

      const finish = (result: PatreonLoginResult): void => {
        if (settled) {
          return
        }

        settled = true
        if (timer) {
          clearInterval(timer)
        }
        loginSession.cookies.off('changed', onCookieChanged)
        this.activeLogins.delete(scope)

        // Let Chromium close the opener-owned OAuth popup normally. Forced
        // destruction can interrupt the provider's final postMessage/callback.
        if (!loginWindow.isDestroyed()) {
          loginWindow.close()
        }

        resolve(result)
      }

      const capture = (
        cookies: Array<{ name: string; value?: string; domain?: string }>
      ): boolean => {
        if (settled) {
          return false
        }

        const value = findPatreonSessionCookieValue(cookies)
        if (!value) {
          return false
        }

        const token = this.vault.createToken(`session_id=${value}`, authorizationEpoch)
        finish(
          token
            ? { ok: true, token }
            : { ok: false, message: CANCELLED_MESSAGE }
        )
        return true
      }

      const checkCookies = async (): Promise<void> => {
        if (settled || loginWindow.isDestroyed()) {
          return
        }

        try {
          capture(await loginSession.cookies.get({ name: 'session_id' }))
        } catch {
          // The window may close while a final navigation event lands.
        }
      }

      const onCookieChanged = (
        _event: unknown,
        cookie: Electron.Cookie,
        _cause: string,
        removed: boolean
      ): void => {
        if (!removed && !settled) {
          capture([cookie])
        }
      }

      const guardPopupOpen = ({ url }: { url: string }): Electron.WindowOpenHandlerResponse => {
        if (isAllowedPatreonLoginUrl(url)) {
          return { action: 'allow' }
        }

        openExternalUrl(url)
        return { action: 'deny' }
      }

      const guardLoginNavigation = (event: Electron.Event, url: string): void => {
        if (!isAllowedPatreonLoginUrl(url)) {
          event.preventDefault()
          openExternalUrl(url)
        }
      }

      scope = {
        cancel: () => finish({ ok: false, message: CANCELLED_MESSAGE })
      }
      this.activeLogins.add(scope)

      // Match the known-working OAuth lifecycle from ad3564d. Security-related
      // webPreferences are inherited from the root window, while Chromium keeps
      // the native opener relationship used by Google's popup callback.
      loginWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedPatreonLoginUrl(url)) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              parent: loginWindow,
              backgroundColor: '#05070a',
              autoHideMenuBar: true
            }
          }
        }

        openExternalUrl(url)
        return { action: 'deny' }
      })
      loginWindow.webContents.on('did-create-window', (popup) => {
        popup.webContents.setWindowOpenHandler(guardPopupOpen)
        popup.webContents.on('will-navigate', guardLoginNavigation)
        popup.webContents.on('will-redirect', guardLoginNavigation)
      })
      loginWindow.webContents.on('will-navigate', guardLoginNavigation)
      loginWindow.webContents.on('will-redirect', guardLoginNavigation)

      loginSession.cookies.on('changed', onCookieChanged)
      loginWindow.webContents.on('did-navigate', () => void checkCookies())
      loginWindow.webContents.on('did-navigate-in-page', () => void checkCookies())
      loginWindow.webContents.on('did-finish-load', () => void checkCookies())
      loginWindow.on('closed', () =>
        finish({
          ok: false,
          message: 'Patreon sign-in window was closed before a session was found.'
        })
      )
      timer = setInterval(() => void checkCookies(), 1500)
      timer.unref?.()

      void loginWindow
        .loadURL('https://www.patreon.com/login?ru=%2F')
        .catch(() =>
          finish({
            ok: false,
            message: 'WatchAlong could not load the Patreon sign-in page.'
          })
        )
    })
  }

  async closeAll(): Promise<void> {
    for (const login of [...this.activeLogins]) {
      login.cancel()
    }
  }

  dispose(): Promise<void> {
    return this.closeAll()
  }
}

function secureLoginWebPreferences(partition: string): Electron.WebPreferences {
  return {
    partition,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false
  }
}

function openExternalUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      void shell.openExternal(rawUrl)
    }
  } catch {
    // Ignore malformed navigation targets.
  }
}
