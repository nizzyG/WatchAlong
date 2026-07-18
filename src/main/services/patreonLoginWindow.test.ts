import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {}
}))

import { PatreonLoginWindowManager } from './patreonLoginWindow'

describe('PatreonLoginWindowManager', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('preserves the native OAuth opener lifecycle from the known-working login window', async () => {
    const loginSession = new FakeSession()
    const root = new FakeWindow(loginSession)
    const popup = new FakeWindow(loginSession)
    const options: BrowserWindowConstructorOptions[] = []
    const manager = new PatreonLoginWindowManager(
      new FakeVault() as never,
      (windowOptions) => {
        options.push(windowOptions)
        return root as unknown as BrowserWindow
      }
    )

    const resultPromise = manager.open({} as BrowserWindow)

    expect(options[0]?.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    })
    expect(options[0]?.webPreferences).not.toHaveProperty('enableBlinkFeatures')
    expect(options[0]?.webPreferences?.partition).toMatch(/^patreon-login-/)
    expect(loginSession.setSpellCheckerEnabled).toHaveBeenCalledWith(false)
    expect(loginSession.setPermissionCheckHandler).toHaveBeenCalledOnce()
    expect(loginSession.setPermissionRequestHandler).toHaveBeenCalledOnce()
    const permissionCheck = loginSession.setPermissionCheckHandler.mock.calls[0]?.[0]
    expect(permissionCheck?.(
      root.webContents,
      'fullscreen',
      'https://www.patreon.com',
      { isMainFrame: true, requestingUrl: 'https://www.patreon.com/login' }
    )).toBe(false)
    const permissionDecision = vi.fn()
    const permissionRequest = loginSession.setPermissionRequestHandler.mock.calls[0]?.[0]
    permissionRequest?.(
      root.webContents,
      'media',
      permissionDecision,
      { isMainFrame: true, requestingUrl: 'https://www.patreon.com/login' }
    )
    expect(permissionDecision).toHaveBeenCalledWith(false)

    const popupDecision = root.openHandler?.({
      url: 'https://accounts.google.com/o/oauth2/v2/auth'
    }) as Electron.WindowOpenHandlerResponse
    expect(popupDecision.action).toBe('allow')
    expect(popupDecision.overrideBrowserWindowOptions).toMatchObject({
      parent: root,
      backgroundColor: '#05070a',
      autoHideMenuBar: true
    })
    expect(popupDecision.overrideBrowserWindowOptions?.webPreferences).toBeUndefined()

    root.webContents.emit('did-create-window', popup)
    expect(popup.openHandler?.({ url: 'https://www.patreon.com/api/oauth2/callback' })).toEqual({
      action: 'allow'
    })
    expect(root.webContents.listenerCount('will-redirect')).toBe(1)
    expect(popup.webContents.listenerCount('will-redirect')).toBe(1)
    expect(popup.webContents.listenerCount('did-navigate')).toBe(0)

    const allowedNavigation = { preventDefault: vi.fn() }
    popup.webContents.emit(
      'will-navigate',
      allowedNavigation,
      'https://accounts.google.com/signin/oauth/consent'
    )
    expect(allowedNavigation.preventDefault).not.toHaveBeenCalled()

    // A provider's server-managed chain may use a non-interactive intermediate
    // host. It must remain in the native popup lifecycle instead of being
    // handed to the desktop browser.
    const allowedRedirect = { preventDefault: vi.fn(), isMainFrame: false }
    popup.webContents.emit(
      'will-redirect',
      allowedRedirect,
      'https://provider-intermediate.invalid/oauth-return?state=opaque'
    )
    expect(allowedRedirect.preventDefault).not.toHaveBeenCalled()

    await manager.closeAll()
    await expect(resultPromise).resolves.toMatchObject({ ok: false })
    expect(root.close).toHaveBeenCalledOnce()
    expect(popup.close).not.toHaveBeenCalled()
  })

  it('captures the Patreon cookie and closes the opener normally', async () => {
    const loginSession = new FakeSession()
    const root = new FakeWindow(loginSession)
    const vault = new FakeVault()
    const manager = new PatreonLoginWindowManager(
      vault as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    loginSession.cookies.emit(
      'changed',
      {},
      { name: 'session_id', value: 'oauth-cookie', domain: '.patreon.com' },
      'explicit',
      false
    )

    await expect(resultPromise).resolves.toEqual({ ok: true, token: 'patreon-token' })
    expect(vault.createToken).toHaveBeenCalledWith('session_id=oauth-cookie', 0)
    expect(root.close).toHaveBeenCalledOnce()
  })

  it('does not intercept provider subframe redirects before Patreon cookie capture', async () => {
    const loginSession = new FakeSession()
    const root = new FakeWindow(loginSession)
    const popup = new FakeWindow(loginSession)
    const vault = new FakeVault()
    const manager = new PatreonLoginWindowManager(
      vault as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    expect(root.openHandler?.({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque'
    })?.action).toBe('allow')
    root.webContents.emit('did-create-window', popup)

    for (const challengeUrl of [
      'https://accounts.google.com/signin/v2/challenge/pwd',
      'https://accounts.google.com/signin/v2/challenge/ipp'
    ]) {
      const challenge = { preventDefault: vi.fn() }
      popup.webContents.emit('will-navigate', challenge, challengeUrl)
      expect(challenge.preventDefault).not.toHaveBeenCalled()
    }

    const providerReturn = { preventDefault: vi.fn(), isMainFrame: false }
    popup.webContents.emit(
      'will-redirect',
      providerReturn,
      'https://provider-intermediate.invalid/oauth-return?state=opaque'
    )
    expect(providerReturn.preventDefault).not.toHaveBeenCalled()

    const youtubeSessionRedirect = { preventDefault: vi.fn(), isMainFrame: true }
    popup.webContents.emit(
      'will-redirect',
      youtubeSessionRedirect,
      'https://accounts.youtube.com/accounts/SetSID?sid=opaque'
    )
    expect(youtubeSessionRedirect.preventDefault).not.toHaveBeenCalled()

    const youtubeSessionNavigation = { preventDefault: vi.fn() }
    popup.webContents.emit(
      'will-navigate',
      youtubeSessionNavigation,
      'https://accounts.youtube.com/accounts/CheckConnection?continue=opaque'
    )
    expect(youtubeSessionNavigation.preventDefault).not.toHaveBeenCalled()

    const patreonCallback = { preventDefault: vi.fn(), isMainFrame: true }
    popup.webContents.emit(
      'will-redirect',
      patreonCallback,
      'https://www.patreon.com/api/oauth2/callback/google?state=opaque&code=one-time'
    )
    expect(patreonCallback.preventDefault).not.toHaveBeenCalled()

    loginSession.cookies.emit(
      'changed',
      {},
      { name: 'session_id', value: 'oauth-cookie', domain: '.patreon.com' },
      'explicit',
      false
    )

    await expect(resultPromise).resolves.toEqual({ ok: true, token: 'patreon-token' })
    expect(vault.createToken).toHaveBeenCalledWith('session_id=oauth-cookie', 0)
    expect(root.close).toHaveBeenCalledOnce()
    expect(popup.close).not.toHaveBeenCalled()
  })

  it('blocks an untrusted top-level redirect without handing OAuth details to the OS', async () => {
    const root = new FakeWindow(new FakeSession())
    const manager = new PatreonLoginWindowManager(
      new FakeVault() as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    const blockedRedirect = { preventDefault: vi.fn(), isMainFrame: true }
    root.webContents.emit(
      'will-redirect',
      blockedRedirect,
      'https://attacker.example/oauth?state=private&code=one-time'
    )

    expect(blockedRedirect.preventDefault).toHaveBeenCalledOnce()
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: 'Patreon sign-in stopped at an unrecognized site (https://attacker.example). No sign-in details were opened in another browser.'
    })
    expect(root.close).toHaveBeenCalledOnce()
  })

  it('blocks an untrusted direct navigation without handing OAuth details to the OS', async () => {
    const root = new FakeWindow(new FakeSession())
    const manager = new PatreonLoginWindowManager(
      new FakeVault() as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    const blockedNavigation = { preventDefault: vi.fn() }
    root.webContents.emit(
      'will-navigate',
      blockedNavigation,
      'https://attacker.example/continue?state=private&code=one-time'
    )

    expect(blockedNavigation.preventDefault).toHaveBeenCalledOnce()
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: 'Patreon sign-in stopped at an unrecognized site (https://attacker.example). No sign-in details were opened in another browser.'
    })
    expect(root.close).toHaveBeenCalledOnce()
  })

  it('blocks an untrusted popup without handing OAuth details to the OS', async () => {
    const root = new FakeWindow(new FakeSession())
    const manager = new PatreonLoginWindowManager(
      new FakeVault() as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    expect(root.openHandler?.({
      url: 'https://attacker.example/popup?state=private&code=one-time'
    })).toEqual({ action: 'deny' })

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: 'Patreon sign-in stopped at an unrecognized site (https://attacker.example). No sign-in details were opened in another browser.'
    })
    expect(root.close).toHaveBeenCalledOnce()
  })

  it('cannot create a token after Forget advances the authorization epoch', async () => {
    const loginSession = new FakeSession()
    const root = new FakeWindow(loginSession)
    const vault = new FakeVault()
    const manager = new PatreonLoginWindowManager(
      vault as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    vault.forget()
    loginSession.cookies.emit(
      'changed',
      {},
      { name: 'session_id', value: 'late-cookie', domain: '.patreon.com' },
      'explicit',
      false
    )

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: 'Patreon sign-in was cancelled.'
    })
    expect(vault.createToken).toHaveBeenCalledWith('session_id=late-cookie', 0)
    expect(root.close).toHaveBeenCalledOnce()
  })

  it('does not mint a token when cookie polling finishes after cancellation', async () => {
    const loginSession = new FakeSession()
    const root = new FakeWindow(loginSession)
    const vault = new FakeVault()
    let resolveCookies: ((cookies: Electron.Cookie[]) => void) | undefined
    loginSession.cookies.get.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCookies = resolve
      })
    )
    const manager = new PatreonLoginWindowManager(
      vault as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    root.webContents.emit('did-finish-load')
    await manager.closeAll()
    resolveCookies?.([
      { name: 'session_id', value: 'late-cookie', domain: '.patreon.com' } as Electron.Cookie
    ])
    await Promise.resolve()

    await expect(resultPromise).resolves.toMatchObject({ ok: false })
    expect(vault.createToken).not.toHaveBeenCalled()
  })

  it('blocks unsafe popup schemes inside the login flow', async () => {
    const root = new FakeWindow(new FakeSession())
    const manager = new PatreonLoginWindowManager(
      new FakeVault() as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    expect(root.openHandler?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      message: 'Patreon sign-in stopped at an unrecognized site (invalid address). No sign-in details were opened in another browser.'
    })
  })
})

class FakeVault {
  authEpoch = 0

  createToken = vi.fn((_cookie: string, expectedEpoch: number): string | null =>
    expectedEpoch === this.authEpoch ? 'patreon-token' : null
  )

  forget(): void {
    this.authEpoch += 1
  }
}

class FakeCookies extends EventEmitter {
  get = vi.fn(async (): Promise<Electron.Cookie[]> => [])
}

class FakeSession {
  cookies = new FakeCookies()
  setSpellCheckerEnabled = vi.fn()
  setPermissionCheckHandler = vi.fn()
  setPermissionRequestHandler = vi.fn()
}

class FakeWebContents extends EventEmitter {
  openHandler: ((details: { url: string }) => Electron.WindowOpenHandlerResponse) | null = null

  constructor(readonly session: FakeSession) {
    super()
  }

  setWindowOpenHandler = vi.fn(
    (handler: (details: { url: string }) => Electron.WindowOpenHandlerResponse) => {
      this.openHandler = handler
    }
  )
}

class FakeWindow extends EventEmitter {
  readonly webContents: FakeWebContents
  private destroyed = false
  loadURL = vi.fn(async () => undefined)
  close = vi.fn(() => {
    if (this.destroyed) return
    this.destroyed = true
    this.emit('closed')
  })

  constructor(session: FakeSession) {
    super()
    this.webContents = new FakeWebContents(session)
  }

  get openHandler(): FakeWebContents['openHandler'] {
    return this.webContents.openHandler
  }

  isDestroyed(): boolean {
    return this.destroyed
  }
}
