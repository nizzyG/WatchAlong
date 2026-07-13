import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { ToolCheckResult, ToolName, ToolStatus } from '@shared/types'

type ToolExecutableName = Exclude<ToolName, 'patreon-dl'> | 'ffprobe'

export function getPlatformToolFilename(
  toolName: ToolExecutableName,
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  if (platform === 'win32') {
    return {
      'yt-dlp': 'yt-dlp.exe',
      ffmpeg: 'ffmpeg.exe',
      ffprobe: 'ffprobe.exe',
      node: 'node.exe'
    }[toolName]
  }

  if (platform === 'darwin') {
    const darwinArch = arch === 'arm64' ? 'arm64' : 'x64'
    return {
      'yt-dlp': 'yt-dlp_macos',
      ffmpeg: `ffmpeg-darwin-${darwinArch}`,
      ffprobe: `ffprobe-darwin-${darwinArch}`,
      node: `node-darwin-${darwinArch}`
    }[toolName]
  }

  return {
    'yt-dlp': 'yt-dlp',
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe',
    node: 'node'
  }[toolName]
}

export class ToolResolver {
  async checkTools(): Promise<ToolCheckResult> {
    const tools = await Promise.all<ToolStatus>([
      this.checkExecutable('yt-dlp', 'yt-dlp', this.getYtDlpPath(), ['--version']),
      this.checkExecutable('ffmpeg', 'FFmpeg', this.getFfmpegPath(), ['-version']),
      this.checkExecutable('node', 'Node runtime', this.getNodePath(), ['--version']),
      this.checkPatreonDl()
    ])

    return {
      ready: tools.every((tool) => tool.ok),
      tools
    }
  }

  getYtDlpPath(): string | null {
    return firstExisting([resourcePath('tools', 'yt-dlp', getPlatformToolFilename('yt-dlp'))])
  }

  getFfmpegPath(): string | null {
    return firstExisting([resourcePath('tools', 'ffmpeg', getPlatformToolFilename('ffmpeg'))])
  }

  getFfprobePath(): string | null {
    return firstExisting([resourcePath('tools', 'ffmpeg', getPlatformToolFilename('ffprobe'))])
  }

  getNodePath(): string | null {
    return firstExisting([resourcePath('tools', 'node', getPlatformToolFilename('node'))])
  }

  getPatreonCliPath(): string | null {
    return firstExisting([
      resourcePath('tools', 'patreon-dl', 'bin', 'patreon-dl.js'),
      resourcePath('tools', 'patreon-dl', 'node_modules', 'patreon-dl', 'bin', 'patreon-dl.js')
    ])
  }

  getPatreonDistPath(): string | null {
    const cliPath = this.getPatreonCliPath()
    if (!cliPath) {
      return null
    }

    const distPath = resolve(dirname(cliPath), '..', 'dist', 'cli', 'index.js')
    return existsSync(distPath) ? distPath : null
  }

  private async checkPatreonDl(): Promise<ToolStatus> {
    const cliPath = this.getPatreonCliPath()
    const nodePath = this.getNodePath()
    if (!cliPath) {
      return {
        name: 'patreon-dl',
        label: 'Patreon downloader',
        ok: false,
        path: null,
        message: 'patreon-dl was not found in bundled resources or the local tool clone.'
      }
    }

    if (!nodePath || !this.getPatreonDistPath()) {
      return {
        name: 'patreon-dl',
        label: 'Patreon downloader',
        ok: false,
        path: cliPath,
        message: 'patreon-dl source was found, but its built dist files or Node runtime are missing.'
      }
    }

    const packagePath = resolve(dirname(cliPath), '..', 'package.json')
    const version = readPackageVersion(packagePath)
    return {
      name: 'patreon-dl',
      label: 'Patreon downloader',
      ok: Boolean(version),
      path: cliPath,
      version,
      message: version ? undefined : 'patreon-dl package metadata could not be read.'
    }
  }

  private async checkExecutable(name: ToolName, label: string, filePath: string | null, args: string[]): Promise<ToolStatus> {
    if (!filePath) {
      return {
        name,
        label,
        ok: false,
        path: null,
        message: `${label} was not found.`
      }
    }

    const result = await runToolCommand(filePath, args, 10000)
    return {
      name,
      label,
      ok: result.ok,
      path: filePath,
      version: result.output.split(/\r?\n/)[0]?.trim(),
      message: result.ok ? undefined : result.output || `${label} could not be started.`
    }
  }
}

export async function detectMovieFrameRate(moviePath: string, tools: ToolResolver): Promise<number | null> {
  if (!moviePath || !existsSync(moviePath)) {
    return null
  }

  const ffprobePath = tools.getFfprobePath()
  if (!ffprobePath) {
    return null
  }

  const result = await runToolCommand(ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=r_frame_rate',
    '-of',
    'csv=p=0',
    moviePath
  ], 10000)

  return result.ok ? parseFfprobeFrameRate(result.output) : null
}

export function parseFfprobeFrameRate(output: string): number | null {
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0)

  if (!line) {
    return null
  }

  const match = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(line)
  if (!match) {
    return null
  }

  const numerator = Number.parseFloat(match[1])
  const denominator = match[2] ? Number.parseFloat(match[2]) : 1
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null
  }

  const fps = numerator / denominator
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : null
}

export function runToolCommand(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { windowsHide: true })
    let output = ''
    let settled = false
    const finish = (ok: boolean, nextOutput = output): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolvePromise({ ok, output: nextOutput })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(false, `${output}\nTimed out after ${timeoutMs / 1000}s.`.trim())
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => finish(false, error.message))
    child.on('close', (code) => finish(code === 0, output))
  })
}

function firstExisting(paths: Array<string | null>): string | null {
  for (const filePath of paths) {
    if (!filePath) {
      continue
    }

    if (filePath.includes('\\') || filePath.includes('/')) {
      if (existsSync(filePath)) {
        return filePath
      }
    } else {
      return filePath
    }
  }

  return null
}

function resourcePath(...parts: string[]): string {
  const resourcesPath = app.isPackaged
    ? ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? process.cwd())
    : join(process.cwd(), 'resources')
  return join(resourcesPath, ...parts)
}

function readPackageVersion(packagePath: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' ? raw.version : undefined
  } catch {
    return undefined
  }
}
