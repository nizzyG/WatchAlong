import type {
  MediaRole,
  RemoteMediaCommand,
  RemoteMediaCommandResult,
  RemoteMediaEvent,
  RemoteMediaState
} from '@shared/types'
import type { VideoAdapter } from './SyncController'

export interface RemoteVideoTransport {
  sendCommand(command: RemoteMediaCommand): Promise<RemoteMediaCommandResult>
  onEvent(callback: (event: RemoteMediaEvent) => void): () => void
}

type RemoteMediaCommandInput = RemoteMediaCommand extends infer Command
  ? Command extends RemoteMediaCommand
    ? Omit<Command, 'id'>
    : never
  : never

const defaultState: RemoteMediaState = {
  currentTime: 0,
  duration: Number.NaN,
  paused: true,
  playbackRate: 1,
  readyState: 0,
  seeking: false,
  ended: false,
  volume: 1,
  muted: false
}

let nextCommandId = 0

export class RemoteVideoAdapter implements VideoAdapter {
  readonly role: MediaRole
  private state: RemoteMediaState
  private readonly listeners = new Map<string, Set<EventListener>>()
  private readonly unsubscribe: () => void

  constructor(role: MediaRole, private readonly transport: RemoteVideoTransport, initialState: Partial<RemoteMediaState> = {}) {
    this.role = role
    this.state = { ...defaultState, ...initialState }
    this.unsubscribe = transport.onEvent((event) => this.handleRemoteEvent(event))
  }

  get currentTime(): number {
    return this.state.currentTime
  }

  set currentTime(value: number) {
    this.state = { ...this.state, currentTime: value, seeking: true }
    void this.send({ type: 'setCurrentTime', value }).catch((error) => this.dispatchError(error))
  }

  get duration(): number {
    return this.state.duration
  }

  get paused(): boolean {
    return this.state.paused
  }

  get playbackRate(): number {
    return this.state.playbackRate
  }

  set playbackRate(value: number) {
    this.state = { ...this.state, playbackRate: value }
    void this.send({ type: 'setPlaybackRate', value }).catch((error) => this.dispatchError(error))
  }

  get readyState(): number {
    return this.state.readyState
  }

  get seeking(): boolean {
    return this.state.seeking
  }

  get ended(): boolean {
    return this.state.ended
  }

  get volume(): number {
    return this.state.volume
  }

  set volume(value: number) {
    this.state = { ...this.state, volume: value }
    void this.send({ type: 'setVolume', value }).catch((error) => this.dispatchError(error))
  }

  get muted(): boolean {
    return this.state.muted
  }

  set muted(value: boolean) {
    this.state = { ...this.state, muted: value }
    void this.send({ type: 'setMuted', value }).catch((error) => this.dispatchError(error))
  }

  async play(): Promise<void> {
    const result = await this.send({ type: 'play' })
    if (!result.ok) {
      throw new Error(result.error ?? 'Movie playback failed')
    }
  }

  pause(): void {
    this.state = { ...this.state, paused: true }
    void this.send({ type: 'pause' }).catch((error) => this.dispatchError(error))
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  destroy(): void {
    this.unsubscribe()
    this.listeners.clear()
  }

  snapshot(): RemoteMediaState {
    return { ...this.state }
  }

  private async send(command: RemoteMediaCommandInput): Promise<RemoteMediaCommandResult> {
    const result = await this.transport.sendCommand({ ...command, id: `movie-${++nextCommandId}` } as RemoteMediaCommand)
    this.state = { ...this.state, ...result.state }
    if (!result.ok) {
      throw new Error(result.error ?? 'Movie command failed')
    }
    return result
  }

  private handleRemoteEvent(event: RemoteMediaEvent): void {
    this.state = { ...this.state, ...event.state }
    this.dispatch(event.type)
  }

  private dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type))
    }
  }

  private dispatchError(error: unknown): void {
    this.dispatch('error')
    console.error(error)
  }
}
