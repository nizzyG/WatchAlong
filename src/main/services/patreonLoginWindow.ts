import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Session,
  type WebContents
} from 'electron'
import { randomUUID } from 'node:crypto'
import { isAllowedPatreonLoginUrl } from '../patreonLoginUrls'
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
  cancel(): Promise<void>
}

const CANCELLED_MESSAGE = 'Patreon sign-in was cancelled.'

/**
 * Owns every short-lived Patreon login partition. The manager is deliberately
 * separate from IPC registration so Forget and app shutdown can invalidate and
 * scrub all active browser state in one place.
 */
export class PatreonLoginWindowManager {
  private readonly activeLogins = new Set<ActivePatreonLogin>()
  private readonly cleanupPromises = new Set<Promise<void>>()

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
        webPreferences: secureLoginWebPreferences(partition)
      })
    } catch {
      return Promise.resolve({
        ok: false,
        message: 'WatchAlong could not open the Patreon sign-in window.'
      })
    }

    return new Promise((resolve) => {
      const loginSession = loginWindow.webContents.session
      const windows = new Set<BrowserWindow>()
      const sessions = new Set<Session>()
      let settled = false
      let timer: NodeJS.Timeout | undefined
      let cleanupPromise = Promise.resolve()
      let scope: ActivePatreonLogin

      const clearSessions = async (): Promise<void> => {
        await Promise.all([...sessions].map(clearLoginSession))
      }

      const finish = (result: PatreonLoginResult): Promise<void> => {
        if (settled) {
          return cleanupPromise
        }

        settled = true
        if (timer) {
          clearInterval(timer)
        }
        loginSession.cookies.off('changed', onCookieChanged)
        this.activeLogins.delete(scope)

        for (const window of windows) {
          if (!window.isDestroyed()) {
            // destroy() cannot be held open by a remote beforeunload handler.
            window.destroy()
          }
        }

        cleanupPromise = clearSessions()
        this.trackCleanup(cleanupPromise)
        resolve(result)
        return cleanupPromise
      }

      const capture = (
        cookies: Array<{ name: string; value?: string; domain?: string }>
      ): boolean => {
        const value = findPatreonSessionCookieValue(cookies)
        if (!value) {
          return false
        }

        const token = this.vault.createToken(`session_id=${value}`, authorizationEpoch)
        void finish(
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
          // The partition may be clearing while a final navigation event lands.
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

      const hardenWindow = (window: BrowserWindow): void => {
        if (settled) {
          if (!window.isDestroyed()) {
            window.destroy()
          }
          return
        }

        windows.add(window)
        sessions.add(window.webContents.session)
        denyPatreonLoginPermissions(window.webContents.session)
        installPatreonNavigationGuards(
          window.webContents,
          securePopupOptions(loginWindow, partition)
        )
        window.webContents.on('did-create-window', (popup) => hardenWindow(popup))
        window.on('closed', () => {
          windows.delete(window)
          if (window === loginWindow) {
            void finish({
              ok: false,
              message: 'Patreon sign-in window was closed before a session was found.'
            })
          }
        })
      }

      scope = {
        cancel: () => finish({ ok: false, message: CANCELLED_MESSAGE })
      }
      this.activeLogins.add(scope)
      hardenWindow(loginWindow)

      loginSession.cookies.on('changed', onCookieChanged)
      loginWindow.webContents.on('did-navigate', () => void checkCookies())
      loginWindow.webContents.on('did-navigate-in-page', () => void checkCookies())
      loginWindow.webContents.on('did-finish-load', () => void checkCookies())
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
    await Promise.all([...this.activeLogins].map((login) => login.cancel()))
    await Promise.all([...this.cleanupPromises])
  }

  dispose(): Promise<void> {
    return this.closeAll()
  }

  private trackCleanup(promise: Promise<void>): void {
    this.cleanupPromises.add(promise)
    void promise.finally(() => this.cleanupPromises.delete(promise))
  }
}

export function denyPatreonLoginPermissions(loginSession: Session): void {
  loginSession.setPermissionCheckHandler(() => false)
  loginSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  loginSession.setDevicePermissionHandler(() => false)
  loginSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({})
  })
}

export function installPatreonNavigationGuards(
  webContents: WebContents,
  popupOptions: BrowserWindowConstructorOptions
): void {
  webContents.setWindowOpenHandler(({ url }) =>
    isAllowedPatreonLoginUrl(url)
      ? { action: 'allow', overrideBrowserWindowOptions: popupOptions }
      : { action: 'deny' }
  )

  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (!isAllowedPatreonLoginUrl(url)) {
      event.preventDefault()
    }
  }
  webContents.on('will-navigate', guardNavigation)
  webContents.on('will-redirect', guardNavigation)
}

async function clearLoginSession(loginSession: Session): Promise<void> {
  try {
    await loginSession.clearStorageData()
  } catch {
    // A destroyed Chromium partition can reject while it tears down.
  }

  try {
    await loginSession.clearCache()
  } catch {
    // Best effort; the partition is in-memory and uniquely named regardless.
  }
}

function secureLoginWebPreferences(partition: string): Electron.WebPreferences {
  return {
    partition,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
}

function securePopupOptions(
  parent: BrowserWindow,
  partition: string
): BrowserWindowConstructorOptions {
  return {
    parent,
    modal: false,
    backgroundColor: '#05070a',
    autoHideMenuBar: true,
    webPreferences: secureLoginWebPreferences(partition)
  }
}
