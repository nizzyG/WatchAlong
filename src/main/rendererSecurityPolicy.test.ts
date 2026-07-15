import { describe, expect, it } from 'vitest'
import {
  isHttpExternalUrl,
  isTrustedRendererNavigation,
  secureRendererWebPreferences
} from './rendererSecurityPolicy'

describe('renderer security policy', () => {
  it('sandboxes every local renderer preload boundary', () => {
    expect(secureRendererWebPreferences('C:\\WatchAlong\\preload.js')).toEqual({
      preload: 'C:\\WatchAlong\\preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    })
  })

  it('allows only the exact renderer document, while permitting an in-document hash', () => {
    const expected = 'watchalong-app://renderer/index.html?view=wizard'

    expect(isTrustedRendererNavigation(expected, expected)).toBe(true)
    expect(isTrustedRendererNavigation(`${expected}#reaction`, expected)).toBe(true)
    expect(isTrustedRendererNavigation('watchalong-app://renderer/index.html?view=movie', expected)).toBe(false)
    expect(isTrustedRendererNavigation('watchalong-app://renderer/other.html?view=wizard', expected)).toBe(false)
    expect(isTrustedRendererNavigation('watchalong-app://user:password@renderer/index.html?view=wizard', expected)).toBe(false)
    expect(isTrustedRendererNavigation('file:///C:/WatchAlong/out/renderer/index.html?view=wizard', expected)).toBe(false)
    expect(isTrustedRendererNavigation('https://attacker.example/?view=wizard', expected)).toBe(false)
  })

  it('opens only credential-free HTTP(S) URLs externally', () => {
    expect(isHttpExternalUrl('https://watchalong.example/help')).toBe(true)
    expect(isHttpExternalUrl('http://localhost:5173/help')).toBe(true)
    expect(isHttpExternalUrl('https://user:password@example.com/')).toBe(false)
    expect(isHttpExternalUrl('file:///C:/Users/user/private.txt')).toBe(false)
    expect(isHttpExternalUrl('watchalong://media/session/movie')).toBe(false)
    expect(isHttpExternalUrl('not a url')).toBe(false)
  })
})
