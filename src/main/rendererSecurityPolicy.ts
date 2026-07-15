import type { WebPreferences } from 'electron'

export function secureRendererWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false
  }
}

export function isHttpExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

export function isTrustedRendererNavigation(candidateUrl: string, expectedUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const expected = new URL(expectedUrl)

    return candidate.username === ''
      && candidate.password === ''
      && expected.username === ''
      && expected.password === ''
      && candidate.protocol === expected.protocol
      && candidate.host === expected.host
      && candidate.pathname === expected.pathname
      && candidate.search === expected.search
  } catch {
    return false
  }
}
