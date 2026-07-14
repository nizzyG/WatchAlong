import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  openExternal: vi.fn(() => Promise.resolve())
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  shell: { openExternal: electronMocks.openExternal }
}))

import { handleTrustedIpc, hardenRendererWindow, isTrustedIpcSender, isTrustedRendererWebContents } from './security'

describe('trusted renderer boundary', () => {
  beforeEach(() => {
    electronMocks.handle.mockReset()
    electronMocks.openExternal.mockClear()
  })

  it('requires the registered window role, main frame, and exact renderer URL', () => {
    const harness = createWindowHarness('file:///C:/WatchAlong/out/renderer/index.html?view=wizard')
    hardenRendererWindow(harness.window, 'wizard', harness.url)

    expect(isTrustedIpcSender(harness.event(), ['wizard'])).toBe(true)
    expect(isTrustedIpcSender(harness.event(), ['main'])).toBe(false)
    expect(isTrustedIpcSender(harness.event('https://attacker.example/'), ['wizard'])).toBe(false)
    expect(isTrustedIpcSender(harness.event(harness.url, {}), ['wizard'])).toBe(false)
    expect(isTrustedRendererWebContents(harness.window.webContents, ['wizard'])).toBe(true)
    expect(isTrustedRendererWebContents(harness.window.webContents, ['main'])).toBe(false)
  })

  it('rejects privileged handlers before calling application code', () => {
    const harness = createWindowHarness('file:///C:/WatchAlong/out/renderer/index.html')
    hardenRendererWindow(harness.window, 'main', harness.url)
    const listener = vi.fn(() => 'allowed')
    handleTrustedIpc('watchalong:test', ['main'], listener)
    const registered = electronMocks.handle.mock.calls[0]?.[1] as (event: IpcMainInvokeEvent) => unknown

    expect(registered(harness.event())).toBe('allowed')
    expect(listener).toHaveBeenCalledOnce()
    expect(() => registered(harness.event('https://attacker.example/'))).toThrow('untrusted renderer')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('blocks local/custom popups and external navigation but opens ordinary web links', async () => {
    const harness = createWindowHarness('file:///C:/WatchAlong/out/renderer/index.html')
    hardenRendererWindow(harness.window, 'main', harness.url)

    expect(harness.openHandler?.({ url: 'file:///C:/Users/user/private.txt' } as never)).toEqual({ action: 'deny' })
    expect(harness.openHandler?.({ url: 'watchalong://media/session/movie' } as never)).toEqual({ action: 'deny' })
    expect(harness.openHandler?.({ url: 'https://example.com/help' } as never)).toEqual({ action: 'deny' })

    const navigation = harness.listeners.get('will-navigate')
    const blockedEvent = { preventDefault: vi.fn() }
    navigation?.(blockedEvent, 'https://example.com/help')
    expect(blockedEvent.preventDefault).toHaveBeenCalledOnce()

    const allowedEvent = { preventDefault: vi.fn() }
    navigation?.(allowedEvent, `${harness.url}#settings`)
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled()

    await Promise.resolve()
    expect(electronMocks.openExternal).toHaveBeenCalledTimes(2)
    expect(electronMocks.openExternal).toHaveBeenCalledWith('https://example.com/help')
  })
})

function createWindowHarness(url: string): {
  url: string
  window: BrowserWindow
  event: (frameUrl?: string, mainFrame?: object) => IpcMainInvokeEvent
  openHandler: ((details: unknown) => unknown) | null
  listeners: Map<string, (event: { preventDefault(): void }, url: string) => void>
} {
  const listeners = new Map<string, (event: { preventDefault(): void }, url: string) => void>()
  const frame = { url, frameTreeNodeId: 1 }
  const sender = {
    mainFrame: frame,
    setWindowOpenHandler: vi.fn((handler: (details: unknown) => unknown) => {
      harness.openHandler = handler
    }),
    on: vi.fn((name: string, listener: (event: { preventDefault(): void }, nextUrl: string) => void) => {
      listeners.set(name, listener)
    })
  } as unknown as WebContents
  const harness = {
    url,
    window: { webContents: sender } as unknown as BrowserWindow,
    event: (frameUrl = url, mainFrame: object = frame) => {
      const senderFrame = mainFrame === frame
        ? Object.assign(frame, { url: frameUrl })
        : { url: frameUrl, frameTreeNodeId: 2 }
      return { sender, senderFrame } as unknown as IpcMainInvokeEvent
    },
    openHandler: null as ((details: unknown) => unknown) | null,
    listeners
  }
  return harness
}
