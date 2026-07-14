import type { BrowserName } from '@shared/types'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BROWSER_NAMES = new Set<BrowserName>(['firefox', 'chrome', 'edge', 'brave', 'safari', 'opera'])

export function isBrowserName(value: unknown): value is BrowserName {
  return typeof value === 'string' && BROWSER_NAMES.has(value as BrowserName)
}

export function isPatreonSessionToken(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value)
}
