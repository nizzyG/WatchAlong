import { describe, expect, it, vi } from 'vitest'
import { ShutdownLifecycle } from './shutdownLifecycle'

describe('ShutdownLifecycle', () => {
  it('starts both credential drains immediately and sweeps only after both finish', async () => {
    const events: string[] = []
    let finishDownloads!: () => void
    const downloadCleanup = new Promise<void>((resolve) => { finishDownloads = resolve })
    let finishPatreon!: () => void
    const patreonCleanup = new Promise<void>((resolve) => { finishPatreon = resolve })
    const quit = vi.fn(() => { events.push('quit') })
    const shutdown = new ShutdownLifecycle({
      disposeDownloads: async () => {
        events.push('downloads-stopping')
        await downloadCleanup
        events.push('downloads-cleared')
      },
      disposePatreon: async () => {
        events.push('patreon-stopping')
        await patreonCleanup
        events.push('patreon-cleared')
      },
      clearPatreonTemp: () => { events.push('temp-swept') },
      quit
    })
    const firstEvent = { preventDefault: vi.fn() }
    const repeatedEvent = { preventDefault: vi.fn() }

    const pending = shutdown.handleBeforeQuit(firstEvent)
    const samePending = shutdown.handleBeforeQuit(repeatedEvent)

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce()
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce()
    expect(samePending).toBe(pending)
    expect(events).toEqual(['downloads-stopping', 'patreon-stopping'])
    expect(quit).not.toHaveBeenCalled()

    finishPatreon()
    await Promise.resolve()
    await Promise.resolve()

    expect(events).toEqual([
      'downloads-stopping',
      'patreon-stopping',
      'patreon-cleared'
    ])
    expect(quit).not.toHaveBeenCalled()

    finishDownloads()
    await pending

    expect(events).toEqual([
      'downloads-stopping',
      'patreon-stopping',
      'patreon-cleared',
      'downloads-cleared',
      'temp-swept',
      'quit'
    ])

    const finalEvent = { preventDefault: vi.fn() }
    expect(shutdown.handleBeforeQuit(finalEvent)).toBeNull()
    expect(finalEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('still sweeps credentials and permits final quit when disposal fails', async () => {
    const events: string[] = []
    const shutdown = new ShutdownLifecycle({
      disposeDownloads: () => {
        events.push('downloads-failed')
        throw new Error('download cleanup failed')
      },
      disposePatreon: async () => {
        events.push('patreon-failed')
        throw new Error('Patreon cleanup failed')
      },
      clearPatreonTemp: () => { events.push('temp-swept') },
      quit: () => { events.push('quit') }
    })
    const event = { preventDefault: vi.fn() }

    await shutdown.handleBeforeQuit(event)

    expect(events).toEqual([
      'downloads-failed',
      'patreon-failed',
      'temp-swept',
      'quit'
    ])
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
})
