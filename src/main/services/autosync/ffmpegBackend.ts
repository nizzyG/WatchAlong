import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { PixelFrame } from './signatures'

export interface MediaInfo {
  duration: number
  width: number
  height: number
  frameRate: number
}

export interface FrameExtractionRequest {
  start: number
  duration: number
  fps: number
  width: number
  height: number
}

export interface AutoSyncMediaBackend {
  probe(filePath: string, signal: AbortSignal): Promise<MediaInfo>
  extractFrames(
    filePath: string,
    request: FrameExtractionRequest,
    signal: AbortSignal,
    onFrame: (frame: PixelFrame, time: number) => void
  ): Promise<void>
}

type SpawnProcess = typeof spawn

export class FfmpegAutoSyncBackend implements AutoSyncMediaBackend {
  constructor(
    private readonly ffmpegPath: string,
    private readonly ffprobePath: string,
    private readonly spawnProcess: SpawnProcess = spawn
  ) {}

  async probe(filePath: string, signal: AbortSignal): Promise<MediaInfo> {
    const output = await this.run(this.ffprobePath, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate:format=duration',
      '-of', 'json', filePath
    ], signal)
    const parsed = JSON.parse(output) as {
      streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }>
      format?: { duration?: string }
    }
    const stream = parsed.streams?.[0]
    const duration = Number(parsed.format?.duration)
    const width = Number(stream?.width)
    const height = Number(stream?.height)
    const frameRate = parseRatio(stream?.avg_frame_rate ?? stream?.r_frame_rate ?? '')
    if (!(duration > 0) || !(width > 0) || !(height > 0) || !(frameRate > 0)) {
      throw new Error('The video stream could not be analyzed.')
    }
    return { duration, width, height, frameRate }
  }

  extractFrames(
    filePath: string,
    request: FrameExtractionRequest,
    signal: AbortSignal,
    onFrame: (frame: PixelFrame, time: number) => void
  ): Promise<void> {
    const width = Math.max(16, Math.round(request.width))
    const height = Math.max(16, Math.round(request.height))
    const fps = Math.max(0.05, request.fps)
    const args = [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-ss', Math.max(0, request.start).toFixed(3), '-i', filePath,
      '-t', Math.max(0.1, request.duration).toFixed(3),
      '-vf', `fps=${fps},scale=${width}:${height}:flags=area`,
      '-an', '-sn', '-dn', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'
    ]
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return }
      const child = this.spawnProcess(this.ffmpegPath, args, { windowsHide: true })
      const frameBytes = width * height * 3
      let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0)
      let frameIndex = 0
      let stderr = ''
      const abort = (): void => { child.kill() }
      signal.addEventListener('abort', abort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
        while (pending.length >= frameBytes) {
          const data = new Uint8Array(pending.subarray(0, frameBytes))
          pending = pending.subarray(frameBytes)
          onFrame({ data, width, height, channels: 3 }, request.start + frameIndex / fps)
          frameIndex += 1
        }
      })
      child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-8000) })
      settleChild(child, signal, stderr, () => stderr, () => signal.removeEventListener('abort', abort), resolve, reject)
    })
  }

  private run(command: string, args: string[], signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return }
      const child = this.spawnProcess(command, args, { windowsHide: true })
      let stdout = ''; let stderr = ''
      const abort = (): void => { child.kill() }
      signal.addEventListener('abort', abort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-8000) })
      settleChild(child, signal, stderr, () => stderr, () => signal.removeEventListener('abort', abort), () => resolve(stdout), reject)
    })
  }
}

function settleChild(
  child: ChildProcessWithoutNullStreams,
  signal: AbortSignal,
  initialError: string,
  getError: () => string,
  cleanup: () => void,
  resolve: () => void,
  reject: (error: Error) => void
): void {
  let settled = false
  const finish = (error?: Error): void => {
    if (settled) return
    settled = true; cleanup(); error ? reject(error) : resolve()
  }
  child.on('error', (error) => finish(error))
  child.on('close', (code) => {
    if (signal.aborted) finish(abortError())
    else if (code === 0) finish()
    else finish(new Error(getError().trim() || initialError || `Media tool exited with code ${code}.`))
  })
}

function parseRatio(value: string): number {
  const [numerator, denominator = '1'] = value.split('/')
  const result = Number(numerator) / Number(denominator)
  return Number.isFinite(result) ? result : 0
}

function abortError(): Error {
  const error = new Error('Auto-sync was cancelled.')
  error.name = 'AbortError'
  return error
}
