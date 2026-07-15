import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserDetection, BrowserName } from '@shared/types'
import { secureYtDlpArgs } from './childProcessSecurity'
import { PatreonSessionVault } from './patreonSessionVault'
import { ToolResolver, runToolCommand } from './toolResolution'

export interface PatreonExtractionResult {
  ok: boolean
  token?: string
  message?: string
}

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

// yt-dlp initializes and exports the browser cookie jar while handling this
// built-in data URL. It performs no DNS lookup or network request.
const COOKIE_EXPORT_TRIGGER = 'data:text/plain,watchalong-cookie-export'

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
  runCommand: typeof runToolCommand = runToolCommand,
  signal?: AbortSignal
): Promise<PatreonExtractionResult> {
  const authorizationEpoch = vault.authEpoch
  const ytDlpPath = tools.getYtDlpPath()
  if (!ytDlpPath) {
    return { ok: false, message: 'yt-dlp is required to read browser cookies.' }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'watchalong-patreon-cookies-'))
  const cookiePath = join(tempDir, 'cookies.txt')
  try {
    // yt-dlp treats --cookies as both an input and output file. A valid empty
    // Netscape jar lets us create it owner-only before yt-dlp ever opens it.
    writeFileSync(cookiePath, '# Netscape HTTP Cookie File\n', {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    })
    try {
      chmodSync(cookiePath, 0o600)
    } catch {
      // Windows applies the private temp-directory ACL instead of POSIX modes.
    }

    const result = await runCommand(ytDlpPath, secureYtDlpArgs([
      '--cookies-from-browser',
      browserName,
      '--cookies',
      cookiePath,
      '--skip-download',
      '--simulate',
      COOKIE_EXPORT_TRIGGER
    ]), 30000, signal)

    // yt-dlp exports the browser jar as a whole. Reduce it to the single
    // Patreon session cookie immediately after the child exits, before any
    // parsing or error handling can extend the full jar's lifetime on disk.
    retainOnlyPatreonSessionCookie(cookiePath)
    if (signal?.aborted) {
      return { ok: false, message: 'Patreon connection was cancelled.' }
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

export function retainOnlyPatreonSessionCookie(cookiePath: string): void {
  if (!existsSync(cookiePath)) {
    return
  }

  let retainedLine: string | undefined
  try {
    retainedLine = readFileSync(cookiePath, 'utf8')
      .split(/\r?\n/)
      .find((line) => cookieLineToPatreonSession(line) !== null)
  } finally {
    writeFileSync(
      cookiePath,
      `# Netscape HTTP Cookie File\n${retainedLine ? `${retainedLine}\n` : ''}`,
      { encoding: 'utf8', mode: 0o600 }
    )
    try {
      chmodSync(cookiePath, 0o600)
    } catch {
      // The private temp directory remains the boundary on Windows.
    }
  }
}

export function parsePatreonSessionCookie(cookiePath: string): string | null {
  if (!existsSync(cookiePath)) {
    return null
  }

  const lines = readFileSync(cookiePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const session = cookieLineToPatreonSession(line)
    if (session) return session
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

function cookieLineToPatreonSession(line: string): string | null {
  if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
    return null
  }

  const cleanLine = line.startsWith('#HttpOnly_') ? line.substring(10) : line
  const [domain, , , , , name, value] = cleanLine.split('\t')
  const normalizedDomain = domain?.toLowerCase().replace(/^\./, '') ?? ''
  return (
    (normalizedDomain === 'patreon.com' || normalizedDomain.endsWith('.patreon.com')) &&
    name === 'session_id' &&
    value
  )
    ? `session_id=${value}`
    : null
}

