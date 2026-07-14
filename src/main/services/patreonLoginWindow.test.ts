import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shell, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  shell: { openExternal: vi.fn(async () => undefined) }
}))

import { PatreonLoginWindowManager } from './patreonLoginWindow'

describe('PatreonLoginWindowManager', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.mocked(shell.openExternal).mockClear()
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
      sandbox: true
    })
    expect(options[0]?.webPreferences?.partition).toMatch(/^patreon-login-/)

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
    expect(popup.webContents.listenerCount('will-redirect')).toBe(0)
    expect(popup.webContents.listenerCount('did-navigate')).toBe(0)

    const allowedNavigation = { preventDefault: vi.fn() }
    popup.webContents.emit(
      'will-navigate',
      allowedNavigation,
      'https://accounts.google.com/signin/oauth/consent'
    )
    expect(allowedNavigation.preventDefault).not.toHaveBeenCalled()

    const blockedNavigation = { preventDefault: vi.fn() }
    popup.webContents.emit(
      'will-navigate',
      blockedNavigation,
      'https://example.test/leave-login'
    )
    expect(blockedNavigation.preventDefault).toHaveBeenCalledOnce()
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.test/leave-login')

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

  it('does not send unsafe external schemes to the operating system', async () => {
    const root = new FakeWindow(new FakeSession())
    const manager = new PatreonLoginWindowManager(
      new FakeVault() as never,
      () => root as unknown as BrowserWindow
    )

    const resultPromise = manager.open({} as BrowserWindow)
    expect(root.openHandler?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(shell.openExternal).not.toHaveBeenCalled()

    await manager.closeAll()
    await expect(resultPromise).resolves.toMatchObject({ ok: false })
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
