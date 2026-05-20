import { describe, expect, it, vi } from 'vitest'
import type { RemoteMediaCommand, RemoteMediaEvent, RemoteMediaEventType, RemoteMediaState } from '@shared/types'
import { RemoteVideoAdapter, type RemoteVideoTransport } from './RemoteVideoAdapter'

const bridgedEvents: RemoteMediaEventType[] = [
  'play',
  'pause',
  'seeking',
  'seeked',
  'waiting',
  'canplay',
  'stalled',
  'ended',
  'error',
  'timeupdate',
  'loadedmetadata',
  'durationchange',
  'ratechange',
  'volumechange'
]

class FakeTransport implements RemoteVideoTransport {
  readonly commands: RemoteMediaCommand[] = []
  private callback: ((event: RemoteMediaEvent) => void) | null = null

  async sendCommand(command: RemoteMediaCommand) {
    this.commands.push(command)
    return {
      id: command.id,
      ok: true,
      state: state()
    }
  }

  onEvent(callback: (event: RemoteMediaEvent) => void): () => void {
    this.callback = callback
    return () => {
      this.callback = null
    }
  }

  emit(type: RemoteMediaEventType, patch: Partial<RemoteMediaState> = {}): void {
    this.callback?.({
      type,
      state: state(patch)
    })
  }
}

describe('RemoteVideoAdapter', () => {
  it('sends setters and play through the transport', async () => {
    const transport = new FakeTransport()
    const adapter = new RemoteVideoAdapter('movie', transport)

    adapter.currentTime = 42
    adapter.playbackRate = 1.25
    adapter.volume = 0.4
    adapter.muted = true
    await adapter.play()
    adapter.pause()

    expect(transport.commands.map((command) => command.type)).toEqual([
      'setCurrentTime',
      'setPlaybackRate',
      'setVolume',
      'setMuted',
      'play',
      'pause'
    ])
    expect(adapter.currentTime).toBe(0)
  })

  it('keeps seeking true until the remote seek event arrives', () => {
    const transport = new FakeTransport()
    const adapter = new RemoteVideoAdapter('movie', transport)
    const onSeeked = vi.fn()
    adapter.addEventListener('seeked', onSeeked)

    adapter.currentTime = 12
    expect(adapter.seeking).toBe(true)

    transport.emit('seeked', { currentTime: 12, seeking: false })

    expect(adapter.currentTime).toBe(12)
    expect(adapter.seeking).toBe(false)
    expect(onSeeked).toHaveBeenCalledTimes(1)
  })

  it('forwards every required bridged media event', () => {
    const transport = new FakeTransport()
    const adapter = new RemoteVideoAdapter('movie', transport)
    const received: string[] = []

    for (const eventName of bridgedEvents) {
      adapter.addEventListener(eventName, () => received.push(eventName))
      transport.emit(eventName)
    }

    expect(received).toEqual(bridgedEvents)
  })

  it('removes the remote event subscription on destroy', () => {
    const transport = new FakeTransport()
    const adapter = new RemoteVideoAdapter('movie', transport)
    const onTimeUpdate = vi.fn()
    adapter.addEventListener('timeupdate', onTimeUpdate)

    adapter.destroy()
    transport.emit('timeupdate')

    expect(onTimeUpdate).not.toHaveBeenCalled()
  })
})

function state(patch: Partial<RemoteMediaState> = {}): RemoteMediaState {
  return {
    currentTime: 0,
    duration: 120,
    paused: true,
    playbackRate: 1,
    readyState: 4,
    seeking: false,
    ended: false,
    volume: 1,
    muted: false,
    ...patch
  }
}
