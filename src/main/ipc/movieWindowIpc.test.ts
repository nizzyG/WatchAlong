import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'

type Handler = (event: { sender: unknown }, ...args: unknown[]) => unknown

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, { roles: readonly string[]; listener: Handler }>()
}))

vi.mock('./security', () => ({
  handleTrustedIpc: (
    channel: string,
    roles: readonly string[],
    listener: Handler
  ) => {
    ipcMocks.handlers.set(channel, { roles, listener })
  }
}))

import { registerMovieWindowIpc } from './movieWindowIpc'

describe('movie window IPC instance binding', () => {
  beforeEach(() => {
    ipcMocks.handlers.clear()
  })

  it('preserves movie-role trust checks and passes the invoking webContents to every movie-originated handler', () => {
    const manager = {
      openMovieWindow: vi.fn(),
      closeMovieWindow: vi.fn(),
      requestMovieWindowPopIn: vi.fn(),
      getMovieWindowInit: vi.fn(),
      markMovieWindowReady: vi.fn(),
      sendMovieMediaCommand: vi.fn(),
      handleMovieMediaCommandResult: vi.fn(),
      handleMovieMediaEvent: vi.fn()
    }
    registerMovieWindowIpc({ windowManager: manager as never })
    const sender = { id: 42 }
    const event = { sender }
    const commandResult = { id: 'audio-1' }
    const mediaEvent = { type: 'audiotrackchange' }

    invoke('request-movie-window-pop-in', event)
    invoke('get-movie-window-init', event)
    invoke('movie-window-ready', event)
    invoke('movie-media-command-result', event, commandResult)
    invoke('movie-media-event', event, mediaEvent)

    expect(manager.requestMovieWindowPopIn).toHaveBeenCalledWith(sender)
    expect(manager.getMovieWindowInit).toHaveBeenCalledWith(sender)
    expect(manager.markMovieWindowReady).toHaveBeenCalledWith(sender)
    expect(manager.handleMovieMediaCommandResult).toHaveBeenCalledWith(sender, commandResult)
    expect(manager.handleMovieMediaEvent).toHaveBeenCalledWith(sender, mediaEvent)
    for (const suffix of [
      'request-movie-window-pop-in',
      'get-movie-window-init',
      'movie-window-ready',
      'movie-media-command-result',
      'movie-media-event'
    ]) {
      expect(ipcMocks.handlers.get(`${IPC_PREFIX}:${suffix}`)?.roles).toEqual(['movie'])
    }
  })
})

function invoke(suffix: string, event: { sender: unknown }, ...args: unknown[]): unknown {
  const handler = ipcMocks.handlers.get(`${IPC_PREFIX}:${suffix}`)?.listener
  if (!handler) throw new Error(`Missing IPC handler for ${suffix}`)
  return handler(event, ...args)
}
