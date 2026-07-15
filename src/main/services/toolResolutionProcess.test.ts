import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runToolCommand } from './toolResolution'

vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

describe('runToolCommand termination', () => {
  afterEach(() => vi.useRealTimers())

  it('aborts a child but does not resolve until its close event', async () => {
    const child = createToolChild()
    const controller = new AbortController()
    const operation = runToolCommand(
      'tool',
      ['--work'],
      60_000,
      controller.signal,
      () => child as never
    )
    let settled = false
    void operation.then(() => { settled = true })

    controller.abort()
    await Promise.resolve()

    expect(child.kill).toHaveBeenCalledOnce()
    expect(settled).toBe(false)

    child.emit('close', null)

    await expect(operation).resolves.toEqual({ ok: false, output: 'Command cancelled.' })
  })

  it('escalates on schedule but requires confirmed process exit after the final force-kill', async () => {
    vi.useFakeTimers()
    const child = createToolChild()
    const operation = runToolCommand('tool', [], 100, undefined, () => child as never)
    let settled = false
    void operation.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(100)
    expect(child.kill).toHaveBeenNthCalledWith(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(child.kill).toHaveBeenNthCalledWith(3, 'SIGKILL')
    expect(settled).toBe(false)

    child.emit('exit', null, 'SIGKILL')

    await expect(operation).resolves.toEqual({ ok: false, output: 'Timed out after 0.1s.' })
  })

  it('waits for close after a timeout when the child closes during its grace period', async () => {
    vi.useFakeTimers()
    const child = createToolChild()
    const operation = runToolCommand('tool', [], 100, undefined, () => child as never)
    let settled = false
    void operation.then(() => { settled = true })

    await vi.advanceTimersByTimeAsync(100)

    expect(child.kill).toHaveBeenCalledOnce()
    expect(settled).toBe(false)

    child.emit('close', null)

    await expect(operation).resolves.toEqual({ ok: false, output: 'Timed out after 0.1s.' })
  })
})

function createToolChild(): EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  return child
}
