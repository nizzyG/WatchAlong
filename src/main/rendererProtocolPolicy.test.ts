import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createRendererEntryUrl,
  parseRendererAssetRequest,
  resolveRendererAssetPath,
  trustedDevelopmentRendererUrl
} from './rendererProtocolPolicy'

describe('renderer protocol policy', () => {
  it('creates canonical entry URLs for each production window', () => {
    expect(createRendererEntryUrl()).toBe('watchalong-app://renderer/index.html')
    expect(createRendererEntryUrl('wizard')).toBe('watchalong-app://renderer/index.html?view=wizard')
    expect(createRendererEntryUrl('movie')).toBe('watchalong-app://renderer/index.html?view=movie')
  })

  it('never trusts a runtime renderer override in a packaged app', () => {
    expect(trustedDevelopmentRendererUrl(true, 'https://attacker.example/app')).toBeNull()
    expect(trustedDevelopmentRendererUrl(true, 'http://localhost:5173')).toBeNull()
  })

  it('allows only a credential-free loopback development server when unpackaged', () => {
    expect(trustedDevelopmentRendererUrl(false, 'http://localhost:5173')).toBe('http://localhost:5173/')
    expect(trustedDevelopmentRendererUrl(false, 'http://127.0.0.1:5173/app')).toBe('http://127.0.0.1:5173/app')
    expect(trustedDevelopmentRendererUrl(false, 'https://attacker.example/app')).toBeNull()
    expect(trustedDevelopmentRendererUrl(false, 'http://user:secret@localhost:5173')).toBeNull()
    expect(trustedDevelopmentRendererUrl(false, 'file:///tmp/index.html')).toBeNull()
  })

  it('allows only the entry document and generated assets', () => {
    expect(parseRendererAssetRequest('watchalong-app://renderer/index.html')).toEqual({
      relativePath: 'index.html',
      view: null
    })
    expect(parseRendererAssetRequest('watchalong-app://renderer/index.html?view=wizard#setup')).toEqual({
      relativePath: 'index.html',
      view: 'wizard'
    })
    expect(parseRendererAssetRequest('watchalong-app://renderer/assets/index-ABC123.js')).toEqual({
      relativePath: 'assets/index-ABC123.js',
      view: null
    })
    expect(parseRendererAssetRequest('watchalong-app://renderer/assets/fonts/Source%20Sans.woff2')).toEqual({
      relativePath: 'assets/fonts/Source Sans.woff2',
      view: null
    })
  })

  it.each([
    'watchalong-app://attacker/index.html',
    'watchalong-app://renderer.attacker.example/index.html',
    'watchalong-app://renderer@attacker.example/index.html',
    'watchalong-app://user:password@renderer/index.html',
    'watchalong-app://renderer:444/index.html',
    'https://renderer/index.html',
    'watchalong-app:///index.html'
  ])('rejects a non-canonical scheme or host: %s', (url) => {
    expect(parseRendererAssetRequest(url)).toBeNull()
  })

  it.each([
    'watchalong-app://renderer/../package.json',
    'watchalong-app://renderer/assets/../../package.json',
    'watchalong-app://renderer/assets/%2e%2e/index.html',
    'watchalong-app://renderer/assets/%2E./index.html',
    'watchalong-app://renderer/assets%2f..%2fpackage.json',
    'watchalong-app://renderer/assets/%5c..%5cpackage.json',
    'watchalong-app://renderer/assets\\..\\package.json',
    'watchalong-app://renderer/assets//index.js',
    'watchalong-app://renderer#/assets/index.js',
    'watchalong-app://renderer/assets/index.js%3A%3A%24DATA',
    'watchalong-app://renderer/assets/NUL.js'
  ])('rejects path traversal and ambiguous separators: %s', (url) => {
    expect(parseRendererAssetRequest(url)).toBeNull()
  })

  it.each([
    'watchalong-app://renderer/',
    'watchalong-app://renderer/package.json',
    'watchalong-app://renderer/assets',
    'watchalong-app://renderer/assets/index.js?view=wizard',
    'watchalong-app://renderer/assets/index.js#fragment',
    'watchalong-app://renderer/index.html?view=admin',
    'watchalong-app://renderer/index.html?view=wizard&view=movie'
  ])('rejects URLs outside the renderer asset allowlist: %s', (url) => {
    expect(parseRendererAssetRequest(url)).toBeNull()
  })

  it('resolves allowed relative paths only within the renderer root', () => {
    const root = join('C:', 'WatchAlong', 'out', 'renderer')

    expect(resolveRendererAssetPath(root, 'assets/index-ABC123.js'))
      .toBe(join(root, 'assets', 'index-ABC123.js'))
    expect(resolveRendererAssetPath(root, '../main/index.js')).toBeNull()
    expect(resolveRendererAssetPath(root, 'assets/../index.html')).toBeNull()
    expect(resolveRendererAssetPath(root, 'assets\\..\\index.html')).toBeNull()
  })
})
