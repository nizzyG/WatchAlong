import { BrowserWindow, ipcMain, shell, type BrowserWindow as BrowserWindowType } from 'electron'
import type { BrowserName } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { isAllowedPatreonLoginUrl } from '../patreonLoginUrls'
import { detectBrowsers, extractPatreonSession, findPatreonSessionCookieValue } from '../services/cookieExtraction'
import { PatreonSessionVault } from '../services/patreonSessionVault'
import { ToolResolver } from '../services/toolResolution'
import { getSenderWindow } from './utils'

export function registerPatreonIpc(deps: {
  toolResolver: ToolResolver
  patreonVault: PatreonSessionVault
  mainWindowGetter: () => BrowserWindowType | null
}): void {
  const { toolResolver, patreonVault, mainWindowGetter } = deps
  ipcMain.handle(`${IPC_PREFIX}:detect-browsers`, () => detectBrowsers())
  ipcMain.handle(`${IPC_PREFIX}:extract-patreon-session`, (_event, browser: BrowserName) => extractPatreonSession(browser, toolResolver, patreonVault))
  ipcMain.handle(`${IPC_PREFIX}:open-patreon-login-window`, (event) => {
    const parent = getSenderWindow(event, mainWindowGetter)
    return parent ? openPatreonLoginWindow(parent, patreonVault) : { ok: false, message: 'Main window is not ready.' }
  })
  ipcMain.handle(`${IPC_PREFIX}:get-saved-patreon-session-status`, () => patreonVault.status())
  ipcMain.handle(`${IPC_PREFIX}:forget-patreon-session`, () => patreonVault.forget())
}

function openPatreonLoginWindow(parent: BrowserWindow, vault: PatreonSessionVault): Promise<{ ok: boolean; token?: string; message?: string }> {
  return new Promise((resolve) => {
    const loginWindow = new BrowserWindow({
      width: 800, height: 600, minWidth: 760, minHeight: 560, parent, modal: false,
      title: 'Sign in to Patreon', backgroundColor: '#05070a',
      webPreferences: { partition: `patreon-login-${Date.now()}`, contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    const loginSession = loginWindow.webContents.session
    let settled = false
    let timer: NodeJS.Timeout
    const finish = (result: { ok: boolean; token?: string; message?: string }): void => {
      if (settled) return
      settled = true
      clearInterval(timer)
      loginSession.cookies.off('changed', onCookieChanged)
      if (!loginWindow.isDestroyed()) loginWindow.close()
      resolve(result)
    }
    const capture = (cookies: Array<{ name: string; value?: string; domain?: string }>): boolean => {
      const value = findPatreonSessionCookieValue(cookies)
      if (!value) return false
      finish({ ok: true, token: vault.createToken(`session_id=${value}`) })
      return true
    }
    const checkCookies = async (): Promise<void> => {
      if (!loginWindow.isDestroyed()) capture(await loginSession.cookies.get({ name: 'session_id' }))
    }
    const onCookieChanged = (_event: unknown, cookie: Electron.Cookie, _cause: string, removed: boolean): void => {
      if (!removed) capture([cookie])
    }
    const guardExternal = ({ url }: { url: string }): Electron.WindowOpenHandlerResponse => {
      if (isAllowedPatreonLoginUrl(url)) return { action: 'allow' }
      openExternalUrl(url)
      return { action: 'deny' }
    }
    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedPatreonLoginUrl(url)) {
        return { action: 'allow', overrideBrowserWindowOptions: { parent: loginWindow, backgroundColor: '#05070a', autoHideMenuBar: true } }
      }
      openExternalUrl(url)
      return { action: 'deny' }
    })
    loginWindow.webContents.on('did-create-window', (popup) => {
      popup.webContents.setWindowOpenHandler(guardExternal)
      popup.webContents.on('will-navigate', (event, url) => { if (!isAllowedPatreonLoginUrl(url)) { event.preventDefault(); openExternalUrl(url) } })
    })
    loginWindow.webContents.on('will-navigate', (event, url) => { if (!isAllowedPatreonLoginUrl(url)) { event.preventDefault(); openExternalUrl(url) } })
    loginSession.cookies.on('changed', onCookieChanged)
    loginWindow.webContents.on('did-navigate', () => void checkCookies())
    loginWindow.webContents.on('did-navigate-in-page', () => void checkCookies())
    loginWindow.webContents.on('did-finish-load', () => void checkCookies())
    loginWindow.on('closed', () => finish({ ok: false, message: 'Patreon sign-in window was closed before a session was found.' }))
    timer = setInterval(() => void checkCookies(), 1500)
    void loginWindow.loadURL('https://www.patreon.com/login?ru=%2F')
  })
}

function openExternalUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') void shell.openExternal(rawUrl)
  } catch { /* Ignore malformed navigation targets. */ }
}
