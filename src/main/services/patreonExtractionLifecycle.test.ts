import { describe, expect, it, vi } from 'vitest'
import { PatreonExtractionLifecycle } from './patreonExtractionLifecycle'

describe('PatreonExtractionLifecycle', () => {
  it('aborts active work and waits for its cleanup before disposal resolves', async () => {
    let finishCleanup!: () => void
    const cleanupGate = new Promise<void>((resolve) => { finishCleanup = resolve })
    const events: string[] = []
    const startExtraction = vi.fn(async (_browser, signal: AbortSignal) => {
      events.push('started')
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          events.push('aborted')
          resolve()
        }, { once: true })
      })
      await cleanupGate
      events.push('cleaned')
      return { ok: false, message: 'cancelled' }
    })
    const lifecycle = new PatreonExtractionLifecycle(startExtraction)
    const extraction = lifecycle.extract('firefox')
    await Promise.resolve()

    let disposed = false
    const disposal = lifecycle.dispose().then(() => { disposed = true })
    await Promise.resolve()

    expect(events).toEqual(['started', 'aborted'])
    expect(disposed).toBe(false)

    finishCleanup()
    await disposal
    await extraction

    expect(events).toEqual(['started', 'aborted', 'cleaned'])
    expect(disposed).toBe(true)
  })

  it('refuses to start new extraction work after disposal', async () => {
    const startExtraction = vi.fn()
    const lifecycle = new PatreonExtractionLifecycle(startExtraction)

    await lifecycle.dispose()

    await expect(lifecycle.extract('firefox')).resolves.toMatchObject({ ok: false })
    expect(startExtraction).not.toHaveBeenCalled()
  })
})
