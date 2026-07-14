import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  detectMovieFrameRate: vi.fn()
}))

vi.mock('./security', () => ({
  handleTrustedIpc: (
    channel: string,
    _roles: readonly string[],
    listener: (...args: unknown[]) => unknown
  ) => mocks.handlers.set(channel, listener)
}))

vi.mock('../services/toolResolution', () => ({
  ToolResolver: class ToolResolver {},
  detectMovieFrameRate: (...args: unknown[]) => mocks.detectMovieFrameRate(...args)
}))

import { registerToolsIpc } from './toolsIpc'

describe('tool IPC media authority', () => {
  const toolResolver = { checkTools: vi.fn() }
  const sessionStore = {
    getSession: vi.fn((sessionId: string) => sessionId === 'session-1'
      ? { moviePath: 'C:\\Movies\\Saved.mp4' }
      : null)
  }

  beforeEach(() => {
    mocks.handlers.clear()
    mocks.detectMovieFrameRate.mockReset().mockResolvedValue(23.976)
    sessionStore.getSession.mockClear()
    registerToolsIpc({ toolResolver: toolResolver as never, sessionStore: sessionStore as never })
  })

  it('resolves the movie path from a stored session instead of probing renderer input', async () => {
    const handler = getHandler(`${IPC_PREFIX}:detect-movie-frame-rate`)

    await expect(handler({}, 'session-1')).resolves.toBe(23.976)
    expect(mocks.detectMovieFrameRate).toHaveBeenCalledWith('C:\\Movies\\Saved.mp4', toolResolver)

    expect(handler({}, '\\\\server\\share\\private.mp4')).toBeNull()
    expect(mocks.detectMovieFrameRate).toHaveBeenCalledTimes(1)
  })
})

function getHandler(channel: string): (...args: unknown[]) => any {
  const handler = mocks.handlers.get(channel)
  expect(handler).toBeTypeOf('function')
  return handler!
}
