import { type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  secureChildProcessOptions,
  type SecureChildProcessOptions
} from './childProcessSecurity'

export type SpawnDownloadProcess = (
  command: string,
  args: string[],
  options: SecureChildProcessOptions
) => ChildProcessWithoutNullStreams

export const MAX_DIAGNOSTIC_OUTPUT_LENGTH = 64 * 1024
const MAX_PENDING_LINE_LENGTH = 1024 * 1024
const MAX_CAPTURED_PROCESS_OUTPUT = 2 * 1024 * 1024

/** Buffers process output until complete CR- or LF-terminated lines are available. */
export class BufferedLineReader {
  private pending = ''
  private swallowLeadingLineFeed = false

  push(chunk: string): string[] {
    const nextChunk = this.swallowLeadingLineFeed && chunk.startsWith('\n') ? chunk.slice(1) : chunk
    this.swallowLeadingLineFeed = false
    this.pending = `${this.pending}${nextChunk}`.slice(-MAX_PENDING_LINE_LENGTH)
    const lines: string[] = []
    let lineStart = 0

    for (let index = 0; index < this.pending.length; index += 1) {
      const character = this.pending[index]
      if (character !== '\r' && character !== '\n') {
        continue
      }

      lines.push(this.pending.slice(lineStart, index))
      if (character === '\r' && index === this.pending.length - 1) {
        this.swallowLeadingLineFeed = true
      }
      while (
        index + 1 < this.pending.length &&
        (this.pending[index + 1] === '\r' || this.pending[index + 1] === '\n')
      ) {
        index += 1
      }
      lineStart = index + 1
    }

    this.pending = this.pending.slice(lineStart)
    return lines
  }

  flush(): string[] {
    if (!this.pending) {
      return []
    }

    const line = this.pending
    this.pending = ''
    return [line]
  }
}

export async function captureProcessOutput(
  spawnProcess: SpawnDownloadProcess,
  command: string,
  args: string[]
): Promise<string | null> {
  let child: ChildProcessWithoutNullStreams
  try {
    child = spawnProcess(command, args, secureChildProcessOptions())
  } catch {
    return null
  }

  let stdout = ''
  let overflowed = false
  child.stdout.on('data', (chunk: Buffer | string) => {
    if (overflowed) return
    stdout += chunk.toString()
    if (stdout.length > MAX_CAPTURED_PROCESS_OUTPUT) {
      overflowed = true
      stdout = ''
      child.kill()
    }
  })

  return await new Promise<string | null>((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      child.kill()
      finish(null)
    }, 15_000)
    const finish = (value: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }
    child.on('close', (code) => finish(!overflowed && code === 0 && stdout.trim() ? stdout.trim() : null))
    child.on('error', () => finish(null))
  })
}

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

export function sanitizeOutput(output: string): string {
  return output.replace(/session_id=[^;\s]+/g, 'session_id=[redacted]')
}
