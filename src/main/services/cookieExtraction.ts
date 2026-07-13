import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserDetection, BrowserExtractionMode, BrowserName } from '@shared/types'
import { PatreonSessionVault } from './patreonSessionVault'
import { ToolResolver, runToolCommand } from './toolResolution'

interface BrowserDefinition {
  name: BrowserName
  label: string
  paths: string[]
}

const CHROMIUM_BROWSERS = new Set<BrowserName>(['chrome', 'edge', 'brave', 'opera'])

function browserLabelFromName(browserName: BrowserName): string {
  return getBrowserDefinitions().find((browser) => browser.name === browserName)?.label ?? browserName
}

export function getBrowserExtractionMode(
  browserName: BrowserName,
  platform: NodeJS.Platform = process.platform
): BrowserExtractionMode {
  if (browserName === 'firefox') {
    return 'automatic'
  }

  if (platform === 'darwin' && CHROMIUM_BROWSERS.has(browserName)) {
    return 'best-effort'
  }

  return 'manual-only'
}

function getBrowserSubtitle(browserName: BrowserName, platform: NodeJS.Platform): string | undefined {
  const mode = getBrowserExtractionMode(browserName, platform)
  if (mode === 'best-effort') {
    return 'May not work'
  }

  if (browserName === 'safari') {
    return 'Rarely works - manual entry needed'
  }

  if (mode === 'manual-only') {
    return 'Manual entry needed'
  }

  return undefined
}

export function getBrowserDefinitions(
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = homedir()
): BrowserDefinition[] {
  const appPath = (name: string): string => `/Applications/${name}`
  const userAppPath = (name: string): string => `${homeDirectory}/Applications/${name}`

  if (platform === 'darwin') {
    return [
      { name: 'firefox', label: 'Firefox', paths: [appPath('Firefox.app'), userAppPath('Firefox.app')] },
      { name: 'chrome', label: 'Chrome', paths: [appPath('Google Chrome.app'), userAppPath('Google Chrome.app')] },
      { name: 'edge', label: 'Edge', paths: [appPath('Microsoft Edge.app'), userAppPath('Microsoft Edge.app')] },
      { name: 'brave', label: 'Brave', paths: [appPath('Brave Browser.app'), userAppPath('Brave Browser.app')] },
      {
        name: 'safari',
        label: 'Safari',
        paths: [appPath('Safari.app'), '/System/Applications/Safari.app', userAppPath('Safari.app')]
      },
      { name: 'opera', label: 'Opera', paths: [appPath('Opera.app'), userAppPath('Opera.app')] }
    ]
  }

  return [
    {
      name: 'firefox',
      label: 'Firefox',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Mozilla Firefox\\firefox.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Mozilla Firefox\\firefox.exe')
      ]
    },
    {
      name: 'chrome',
      label: 'Chrome',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe')
      ]
    },
    {
      name: 'edge',
      label: 'Edge',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe')
      ]
    },
    {
      name: 'brave',
      label: 'Brave',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
      ]
    },
    { name: 'safari', label: 'Safari', paths: [] },
    {
      name: 'opera',
      label: 'Opera',
      paths: [
        join(process.env.LOCALAPPDATA ?? '', 'Programs\\Opera\\opera.exe'),
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Opera\\launcher.exe')
      ]
    }
  ]
}

export function canExtractNatively(browserName: BrowserName, platform: NodeJS.Platform = process.platform): boolean {
  return getBrowserExtractionMode(browserName, platform) !== 'manual-only'
}

export function detectBrowsers(
  platform: NodeJS.Platform = process.platform,
  pathExists: (path: string) => boolean = existsSync
): BrowserDetection[] {
  return getBrowserDefinitions(platform).map((browser) => {
    const paths = browser.paths.filter((browserPath) => pathExists(browserPath))
    const extractionMode = getBrowserExtractionMode(browser.name, platform)
    return {
      name: browser.name,
      label: browser.label,
      installed: paths.length > 0,
      extractionSupported: extractionMode !== 'manual-only',
      extractionMode,
      subtitle: getBrowserSubtitle(browser.name, platform),
      paths
    }
  })
}

export async function extractPatreonSession(
  browserName: BrowserName,
  tools: ToolResolver,
  vault: PatreonSessionVault,
  platform: NodeJS.Platform = process.platform
): Promise<{ ok: boolean; token?: string; message?: string }> {
  if (getBrowserExtractionMode(browserName, platform) === 'manual-only') {
    const browserLabel = browserLabelFromName(browserName)
    return {
      ok: false,
      message: `${browserLabel} requires manual Patreon session entry in WatchAlong. Paste your session_id to continue.`
    }
  }

  const ytDlpPath = tools.getYtDlpPath()
  if (!ytDlpPath) {
    return { ok: false, message: 'yt-dlp is required to read browser cookies.' }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'watchalong-patreon-cookies-'))
  const cookiePath = join(tempDir, 'cookies.txt')
  try {
    const result = await runToolCommand(ytDlpPath, [
      '--cookies-from-browser',
      browserName,
      '--cookies',
      cookiePath,
      '--skip-download',
      '--simulate',
      'https://www.patreon.com/posts/0'
    ], 30000)

    const cookie = parsePatreonSessionCookie(cookiePath)
    if (!cookie) {
      return {
        ok: false,
        message: humanizeCookieExtractionError(browserName, result.output)
      }
    }

    return { ok: true, token: vault.createToken(cookie) }
  } catch (error) {
    return {
      ok: false,
      message: humanizeCookieExtractionError(
        browserName,
        error instanceof Error ? error.message : 'Could not read browser cookies.'
      )
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
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
    if (domain?.includes('patreon.com') && name === 'session_id' && value) {
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
  const browserLabel = browserLabelFromName(browserName)
  if (/could not copy chrome cookie database|file is locked|locked or in use|database is locked/i.test(output)) {
    return `${browserLabel} is blocking cookie access. This is usually caused by browser encryption or a locked database. Use the Patreon sign-in window or paste session_id manually.`
  }

  if (/could not find .*cookies database|No .*cookie|session_id/i.test(output)) {
    return `No Patreon session was found in ${browserLabel}. Make sure you are logged into Patreon in that browser, then try again.`
  }

  return `We could not read your Patreon session from ${browserLabel}. Use the Patreon sign-in window or paste session_id manually.`
}

