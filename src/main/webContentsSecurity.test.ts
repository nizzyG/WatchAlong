import { describe, expect, it, vi } from 'vitest'
import type { App, Session, WebContents } from 'electron'
import {
  hardenDefaultSession,
  hardenPatreonLoginSession,
  installGlobalWebContentsGuards,
  registerTrustedRendererSecurityPolicy
} from './webContentsSecurity'

describe('web contents security', () => {
  it('allows fullscreen only for registered local renderers on the default session', () => {
    const targetSession = createSessionHarness()
    const main = createWebContentsHarness(targetSession.session)
    const movie = createWebContentsHarness(targetSession.session)
    const wizard = createWebContentsHarness(targetSession.session)
    const untrusted = createWebContentsHarness(targetSession.session)
    const mainUrl = 'watchalong-app://renderer/index.html'
    const movieUrl = 'watchalong-app://renderer/index.html?view=movie'
    const wizardUrl = 'watchalong-app://renderer/index.html?view=wizard'

    hardenDefaultSession(targetSession.session)
    hardenDefaultSession(targetSession.session)
    registerRenderer(main.webContents, mainUrl, true)
    registerRenderer(movie.webContents, movieUrl, true)
    registerRenderer(wizard.webContents, wizardUrl, false)

    expect(targetSession.setSpellCheckerEnabled).toHaveBeenCalledWith(false)
    expect(targetSession.setPermissionCheckHandler).toHaveBeenCalledOnce()
    expect(checkPermission(targetSession, main.webContents, 'fullscreen', mainUrl)).toBe(true)
    expect(checkPermission(targetSession, movie.webContents, 'fullscreen', movieUrl)).toBe(true)
    expect(checkPermission(targetSession, wizard.webContents, 'fullscreen', wizardUrl)).toBe(false)
    expect(checkPermission(targetSession, main.webContents, 'media', mainUrl)).toBe(false)
    expect(checkPermission(targetSession, untrusted.webContents, 'fullscreen', mainUrl)).toBe(false)
    expect(checkPermission(
      targetSession,
      main.webContents,
      'fullscreen',
      'https://attacker.example/'
    )).toBe(false)
    expect(checkPermission(targetSession, main.webContents, 'fullscreen', mainUrl, false)).toBe(false)
    expect(targetSession.setPermissionRequestHandler).toHaveBeenCalledOnce()

    const fullscreenDecision = vi.fn()
    targetSession.requestHandler?.(
      main.webContents,
      'fullscreen',
      fullscreenDecision,
      permissionDetails(mainUrl)
    )
    expect(fullscreenDecision).toHaveBeenCalledWith(true)

    const subframeDecision = vi.fn()
    targetSession.requestHandler?.(
      movie.webContents,
      'fullscreen',
      subframeDecision,
      permissionDetails(movieUrl, false)
    )
    expect(subframeDecision).toHaveBeenCalledWith(false)
  })

  it('disables spellchecking and denies every permission in Patreon sessions', () => {
    const targetSession = createSessionHarness()
    const contents = createWebContentsHarness(targetSession.session)
    // A remote session must tighten even if it was configured incorrectly first.
    hardenDefaultSession(targetSession.session)
    hardenPatreonLoginSession(targetSession.session)

    // Even an accidental renderer registration must not widen a remote session.
    registerTrustedRendererSecurityPolicy(contents.webContents, {
      allowFullscreen: true,
      isNavigationAllowed: () => true
    })

    expect(targetSession.setSpellCheckerEnabled).toHaveBeenCalledWith(false)
    expect(checkPermission(
      targetSession,
      contents.webContents,
      'fullscreen',
      'https://www.patreon.com/'
    )).toBe(false)
    const decision = vi.fn()
    targetSession.requestHandler?.(
      contents.webContents,
      'fullscreen',
      decision,
      permissionDetails('https://www.patreon.com/')
    )
    expect(decision).toHaveBeenCalledWith(false)
  })

  it('gives every new WebContents deny-by-default popup and navigation guards', () => {
    const app = createAppHarness()
    const targetSession = createSessionHarness()
    const contents = createWebContentsHarness(targetSession.session)

    installGlobalWebContentsGuards(app.app)
    installGlobalWebContentsGuards(app.app)
    app.emitWebContentsCreated(contents.webContents)

    expect(app.on).toHaveBeenCalledOnce()
    expect(contents.openHandler?.({ url: 'https://example.test' })).toEqual({ action: 'deny' })

    const blocked = { preventDefault: vi.fn() }
    contents.navigate('will-navigate', blocked, 'https://example.test')
    expect(blocked.preventDefault).toHaveBeenCalledOnce()

    const blockedRedirect = { preventDefault: vi.fn() }
    contents.navigate('will-redirect', blockedRedirect, 'https://example.test/redirect')
    expect(blockedRedirect.preventDefault).toHaveBeenCalledOnce()

    const blockedSubframeRedirect = { preventDefault: vi.fn(), isMainFrame: false }
    contents.navigate(
      'will-redirect',
      blockedSubframeRedirect,
      'https://example.test/frame-redirect'
    )
    expect(blockedSubframeRedirect.preventDefault).toHaveBeenCalledOnce()
  })

  it('allows only destinations approved by an application renderer policy', () => {
    const app = createAppHarness()
    const contents = createWebContentsHarness(createSessionHarness().session)
    installGlobalWebContentsGuards(app.app)
    app.emitWebContentsCreated(contents.webContents)
    registerRenderer(contents.webContents, 'watchalong-app://renderer/index.html', true)

    const allowed = { preventDefault: vi.fn() }
    contents.navigate('will-navigate', allowed, 'watchalong-app://renderer/index.html')
    expect(allowed.preventDefault).not.toHaveBeenCalled()

    const blocked = { preventDefault: vi.fn() }
    contents.navigate('will-navigate', blocked, 'https://attacker.example')
    expect(blocked.preventDefault).toHaveBeenCalledOnce()
  })

  it('preserves Patreon subframe redirects while blocking unsafe top-level destinations', () => {
    const app = createAppHarness()
    const targetSession = createSessionHarness()
    const contents = createWebContentsHarness(targetSession.session)
    installGlobalWebContentsGuards(app.app)
    app.emitWebContentsCreated(contents.webContents)
    hardenPatreonLoginSession(targetSession.session)

    const allowed = { preventDefault: vi.fn() }
    contents.navigate(
      'will-navigate',
      allowed,
      'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fwww.patreon.com'
    )
    expect(allowed.preventDefault).not.toHaveBeenCalled()

    const allowedRedirect = { preventDefault: vi.fn(), isMainFrame: false }
    contents.navigate(
      'will-redirect',
      allowedRedirect,
      'https://provider-intermediate.invalid/oauth-return?state=opaque'
    )
    expect(allowedRedirect.preventDefault).not.toHaveBeenCalled()

    const allowedMainFrameRedirect = { preventDefault: vi.fn(), isMainFrame: true }
    contents.navigate(
      'will-redirect',
      allowedMainFrameRedirect,
      'https://www.patreon.com/api/oauth2/callback?state=opaque'
    )
    expect(allowedMainFrameRedirect.preventDefault).not.toHaveBeenCalled()

    const allowedGoogleSessionBridge = { preventDefault: vi.fn(), isMainFrame: true }
    contents.navigate(
      'will-redirect',
      allowedGoogleSessionBridge,
      'https://accounts.youtube.com/accounts/SetSID?sid=opaque'
    )
    expect(allowedGoogleSessionBridge.preventDefault).not.toHaveBeenCalled()

    const blockedRedirect = { preventDefault: vi.fn(), isMainFrame: true }
    contents.navigate(
      'will-redirect',
      blockedRedirect,
      'https://accounts.google.com.attacker.example/oauth'
    )
    expect(blockedRedirect.preventDefault).toHaveBeenCalledOnce()

    const blockedNavigation = { preventDefault: vi.fn() }
    contents.navigate(
      'will-navigate',
      blockedNavigation,
      'https://accounts.google.com.attacker.example/oauth'
    )
    expect(blockedNavigation.preventDefault).toHaveBeenCalledOnce()
  })
})

function createAppHarness(): {
  app: App
  on: ReturnType<typeof vi.fn>
  emitWebContentsCreated(webContents: WebContents): void
} {
  let createdListener: ((_event: Electron.Event, webContents: WebContents) => void) | undefined
  const on = vi.fn((event: string, listener: typeof createdListener) => {
    if (event === 'web-contents-created') {
      createdListener = listener
    }
  })

  return {
    app: { on } as unknown as App,
    on,
    emitWebContentsCreated: (webContents) => createdListener?.({} as Electron.Event, webContents)
  }
}

function createSessionHarness(): {
  session: Session
  checkHandler: PermissionCheckHandler | null
  requestHandler: PermissionRequestHandler | null
  setSpellCheckerEnabled: ReturnType<typeof vi.fn>
  setPermissionCheckHandler: ReturnType<typeof vi.fn>
  setPermissionRequestHandler: ReturnType<typeof vi.fn>
} {
  const harness = {
    checkHandler: null as PermissionCheckHandler | null,
    requestHandler: null as PermissionRequestHandler | null,
    setSpellCheckerEnabled: vi.fn(),
    setPermissionCheckHandler: vi.fn((handler: PermissionCheckHandler) => {
      harness.checkHandler = handler
    }),
    setPermissionRequestHandler: vi.fn((handler: typeof harness.requestHandler) => {
      harness.requestHandler = handler
    })
  }

  return {
    session: harness as unknown as Session,
    get checkHandler() {
      return harness.checkHandler
    },
    get requestHandler() {
      return harness.requestHandler
    },
    setSpellCheckerEnabled: harness.setSpellCheckerEnabled,
    setPermissionCheckHandler: harness.setPermissionCheckHandler,
    setPermissionRequestHandler: harness.setPermissionRequestHandler
  }
}

function createWebContentsHarness(targetSession: Session): {
  webContents: WebContents
  openHandler: ((details: { url: string }) => Electron.WindowOpenHandlerResponse) | null
  navigate(
    type: 'will-navigate' | 'will-redirect',
    event: { preventDefault(): void; isMainFrame?: boolean },
    url: string
  ): void
} {
  let openHandler: ((details: { url: string }) => Electron.WindowOpenHandlerResponse) | null = null
  const navigationHandlers = new Map<string, (event: Electron.Event, url: string) => void>()
  const webContents = {
    session: targetSession,
    setWindowOpenHandler: vi.fn((handler) => {
      openHandler = handler
    }),
    on: vi.fn((event, listener) => {
      if (event === 'will-navigate' || event === 'will-redirect') {
        navigationHandlers.set(event, listener)
      }
    })
  } as unknown as WebContents

  return {
    webContents,
    get openHandler() {
      return openHandler
    },
    navigate: (type, event, url) =>
      navigationHandlers.get(type)?.(event as unknown as Electron.Event, url)
  }
}

type PermissionCheckHandler = (
  webContents: WebContents | null,
  permission: string,
  requestingOrigin: string,
  details: TestPermissionDetails
) => boolean
type PermissionRequestHandler = (
  webContents: WebContents,
  permission: string,
  callback: (allowed: boolean) => void,
  details: TestPermissionDetails
) => void

interface TestPermissionDetails {
  isMainFrame: boolean
  requestingUrl: string
}

function registerRenderer(webContents: WebContents, url: string, allowFullscreen: boolean): void {
  registerTrustedRendererSecurityPolicy(webContents, {
    allowFullscreen,
    isNavigationAllowed: (candidate) => candidate === url
  })
}

function checkPermission(
  targetSession: ReturnType<typeof createSessionHarness>,
  webContents: WebContents,
  permission: string,
  requestingUrl: string,
  isMainFrame = true
): boolean | undefined {
  return targetSession.checkHandler?.(
    webContents,
    permission,
    new URL(requestingUrl).origin,
    permissionDetails(requestingUrl, isMainFrame)
  )
}

function permissionDetails(requestingUrl: string, isMainFrame = true): TestPermissionDetails {
  return { isMainFrame, requestingUrl }
}
