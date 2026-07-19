import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, { roles: readonly string[]; listener: Handler }>()
}))

vi.mock('./security', () => ({
  handleTrustedIpc: (channel: string, roles: readonly string[], listener: Handler) => {
    ipcMocks.handlers.set(channel, { roles, listener })
  }
}))

import { registerAppIpc } from './appIpc'

describe('app IPC', () => {
  beforeEach(() => ipcMocks.handlers.clear())

  it('shares the packaged app version only with the trusted main renderer', () => {
    const getVersion = vi.fn(() => '1.1.0')
    registerAppIpc({ getVersion })

    const registration = ipcMocks.handlers.get(`${IPC_PREFIX}:get-app-version`)
    expect(registration?.roles).toEqual(['main'])
    expect(registration?.listener({})).toBe('1.1.0')
    expect(getVersion).toHaveBeenCalledOnce()
  })
})
