import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'

type Handler = (event: { sender: unknown }, ...args: unknown[]) => unknown

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, { roles: readonly string[]; listener: Handler }>()
}))

vi.mock('./security', () => ({
  handleTrustedIpc: (channel: string, roles: readonly string[], listener: Handler) => {
    ipcMocks.handlers.set(channel, { roles, listener })
  }
}))

import { registerMediaKeyIpc } from './mediaKeyIpc'

describe('media key IPC', () => {
  beforeEach(() => ipcMocks.handlers.clear())

  it('limits availability changes to the main renderer and preserves its webContents identity', () => {
    const mediaKeys = { setPlayPauseEnabled: vi.fn(() => true) }
    registerMediaKeyIpc({ mediaKeys: mediaKeys as never })
    const registration = ipcMocks.handlers.get(`${IPC_PREFIX}:set-media-play-pause-enabled`)
    const sender = { id: 7 }

    expect(registration?.roles).toEqual(['main'])
    expect(registration?.listener({ sender }, true)).toBe(true)
    expect(mediaKeys.setPlayPauseEnabled).toHaveBeenCalledWith(sender, true)
  })
})
