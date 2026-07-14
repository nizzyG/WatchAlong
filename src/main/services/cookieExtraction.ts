import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserDetection, BrowserName } from '@shared/types'
import { PatreonSessionVault } from './patreonSessionVault'
import { ToolResolver, runToolCommand } from './toolResolution'

interface BrowserDefinition {
  name: BrowserName
  label: string
  paths: string[]
}

export function getBrowserDefinitions(
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = homedir()
): BrowserDefinition[] {
  const appPath = (name: string): string => `/Applications/${name}`
  const userAppPath = (name: string): string => `${homeDirectory}/Applications/${name}`

  if (platform === 'darwin') {
    return [
      { name: 'firefox', label: 'Firefox', paths: [appPath('Firefox.app'), userAppPath('Firefox.app')] }
    ]
  }

  const paths = platform === 'win32'
    ? [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Mozilla Firefox\\firefox.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Mozilla Firefox\\firefox.exe')
      ]
    : ['/usr/bin/firefox', '/usr/local/bin/firefox', '/snap/bin/firefox']

  return [{ name: 'firefox', label: 'Firefox', paths }]
}

export function detectBrowsers(
  platform: NodeJS.Platform = process.platform,
  pathExists: (path: string) => boolean = existsSync
): BrowserDetection[] {
  return getBrowserDefinitions(platform).map((browser) => {
    const paths = browser.paths.filter((browserPath) => pathExists(browserPath))
    return {
      name: browser.name,
      label: browser.label,
      installed: paths.length > 0,
      paths
    }
  })
}

export async function extractPatreonSession(
  browserName: BrowserName,
  tools: ToolResolver,
  vault: PatreonSessionVault,
  runCommand: typeof runToolCommand = runToolCommand
): Promise<{ ok: boolean; token?: string; message?: string }> {
  const authorizationEpoch = vault.authEpoch
  const ytDlpPath = tools.getYtDlpPath()
  if (!ytDlpPath) {
    return { ok: false, message: 'yt-dlp is required to read browser cookies.' }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'watchalong-patreon-cookies-'))
  const cookiePath = join(tempDir, 'cookies.txt')
  try {
    const result = await runCommand(ytDlpPath, [
      '--cookies-from-browser',
      browserName,
      '--cookies',
      cookiePath,
      '--skip-download',
      '--simulate',
      'https://www.patreon.com/posts/0'
    ], 30000)

    try {
      chmodSync(cookiePath, 0o600)
    } catch {
      // The private temp directory is still the primary boundary on systems
      // that do not support POSIX modes.
    }
    const cookie = parsePatreonSessionCookie(cookiePath)
    if (!cookie) {
      return {
        ok: false,
        message: humanizeCookieExtractionError(browserName, result.output)
      }
    }

    const token = vault.createToken(cookie, authorizationEpoch)
    return token
      ? { ok: true, token }
      : {
          ok: false,
          message: 'Patreon sign-in was cancelled before browser access finished.'
        }
  } catch (error) {
    return {
      ok: false,
      message: humanizeCookieExtractionError(
        browserName,
        error instanceof Error ? error.message : 'Could not read browser cookies.'
      )
    }
  } finally {
    if (existsSync(cookiePath)) {
      try {
        writeFileSync(cookiePath, '', { encoding: 'utf8', mode: 0o600 })
      } catch {
        // A crash-leftover sweep runs before the next app window opens.
      }
    }
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 })
    } catch {
      // Startup cleanup retries the private temp directory.
    }
  }
}

export function parsePatreonSessionCookie(cookiePath: string): string | null {
  if (!existsSync(cookiePath)) {
    return null
  }

  const lines = readFileSync(cookiePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
      continue
    }

    const cleanLine = line.startsWith('#HttpOnly_') ? line.substring(10) : line
    const parts = cleanLine.split('\t')
    const [domain, , , , , name, value] = parts
    const normalizedDomain = domain?.toLowerCase().replace(/^\./, '') ?? ''
    if ((normalizedDomain === 'patreon.com' || normalizedDomain.endsWith('.patreon.com')) && name === 'session_id' && value) {
      return `session_id=${value}`
    }
  }

  return null
}

export function findPatreonSessionCookieValue(
  cookies: Array<{ name: string; value?: string; domain?: string }>
): string | null {
  const session = cookies.find((cookie) => {
    const domain = cookie.domain?.toLowerCase() ?? ''
    return cookie.name === 'session_id' && Boolean(cookie.value) && (domain === 'patreon.com' || domain.endsWith('.patreon.com'))
  })

  return session?.value ?? null
}

export function humanizeCookieExtractionError(browserName: BrowserName, output: string): string {
  const browserLabel = browserName === 'firefox' ? 'Firefox' : browserName
  if (/file is locked|locked or in use|database is locked/i.test(output)) {
    return `${browserLabel} is currently using its cookie database. Close Firefox and try again, or use Sign in with browser.`
  }

  if (/could not find .*cookies database|No .*cookie|session_id/i.test(output)) {
    return `No Patreon session was found in ${browserLabel}. Make sure you are logged into Patreon in that browser, then try again.`
  }

  return `We could not read your Patreon session from ${browserLabel}. Try Sign in with browser instead.`
}

