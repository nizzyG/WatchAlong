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

  it('denies permissions and guards popups, navigation, and redirects', async () => {
    const rootSession = new FakeSession()
    const popupSession = new FakeSession()
    const root = new FakeWindow(rootSession)
    const popup = new FakeWindow(popupSession)
    const options: BrowserWindowConstructorOptions[] = []
    const vault = new FakeVault()
    const manager = new PatreonLoginWindowManager(
      vault as never,
      (windowOptions) => {
        options.push(windowOptions)
        return root as unknown as BrowserWindow
      }
    )

    const resultPromise = manager.open({} as BrowserWindow)
    const requestPermission = rootSession.setPermissionRequestHandler.mock.calls[0]?.[0]
    const permissionCallback = vi.fn()
    requestPermission?.(null, 'media', permissionCallback, {} as never)
    expect(permissionCallback).toHaveBeenCalledWith(false)
    expect(rootSession.setPermissionCheckHandler.mock.calls[0]?.[0]()).toBe(false)
    expect(rootSession.setDevicePermissionHandler.mock.calls[0]?.[0]({} as never)).toBe(false)
    const displayMediaCallback = vi.fn()
    rootSession.setDisplayMediaRequestHandler.mock.calls[0]?.[0](
      {} as never,
      displayMediaCallback
    )
    expect(displayMediaCallback).toHaveBeenCalledWith({})

    expect(root.openHandler?.({ url: 'https://user:secret@patreon.com/login' })).toEqual({
      action: 'deny'
    })
    const popupDecision = root.openHandler?.({
      url: 'https://accounts.google.com/o/oauth2/v2/auth'
    }) as Electron.WindowOpenHandlerResponse
    expect(popupDecision.action).toBe('allow')
    expect(popupDecision.overrideBrowserWindowOptions?.webPreferences).toMatchObject({
      partition: options[0]?.webPreferences?.partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })

    const redirectEvent = { preventDefault: vi.fn() }
    root.webContents.emit(
      'will-redirect',
      redirectEvent,
      'https://patreon.com.evil.test/steal'
    )
    expect(redirectEvent.preventDefault).toHaveBeenCalledOnce()

    const allowedNavigation = { preventDefault: vi.fn() }
    root.webContents.emit(
      'will-navigate',
      allowedNavigation,
      'https://www.facebook.com/login'
    )
    expect(allowedNavigation.preventDefault).not.toHaveBeenCalled()

    root.webContents.emit('did-create-window', popup)
    expect(popup.openHandler).toBeTypeOf('function')
    expect(popupSession.setPermissionRequestHandler).toHaveBeenCalledOnce()

    await manager.closeAll()
    await expect(resultPromise).resolves.toMatchObject({ ok: false })
    expect(root.destroy).toHaveBeenCalledOnce()
    expect(popup.destroy).toHaveBeenCalledOnce()
    expect(rootSession.clearStorageData).toHaveBeenCalledOnce()
    expect(rootSession.clearCache).toHaveBeenCalledOnce()
    expect(popupSession.clearStorageData).toHaveBeenCalledOnce()
    expect(popupSession.clearCache).toHaveBeenCalledOnce()
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
    await manager.dispose()
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
  get = vi.fn(async () => [])
}

class FakeSession {
  cookies = new FakeCookies()
  setPermissionCheckHandler = vi.fn()
  setPermissionRequestHandler = vi.fn()
  setDevicePermissionHandler = vi.fn()
  setDisplayMediaRequestHandler = vi.fn()
  clearStorageData = vi.fn(async () => undefined)
  clearCache = vi.fn(async () => undefined)
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
  destroy = vi.fn(() => {
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
