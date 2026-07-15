import type { App, Session, WebContents } from 'electron'
import { isAllowedPatreonLoginUrl } from './patreonLoginUrls'

type NavigationPolicy = (url: string) => boolean
type PermissionMode = 'trusted-renderer-fullscreen' | 'deny-all'

interface TrustedRendererSecurityPolicy {
  allowFullscreen: boolean
  isNavigationAllowed: NavigationPolicy
}

interface PermissionDetails {
  isMainFrame: boolean
  requestingUrl?: string
}

const guardedApps = new WeakSet<App>()
const permissionModes = new WeakMap<Session, PermissionMode>()
const patreonLoginSessions = new WeakSet<Session>()
const trustedRendererPolicies = new WeakMap<WebContents, TrustedRendererSecurityPolicy>()

/**
 * The application renderer needs Chromium's Fullscreen API, but no other
 * permission. Identity is established by hardenRendererWindow before content
 * loads, so remote or future unregistered WebContents remain denied.
 */
export function hardenDefaultSession(targetSession: Session): void {
  targetSession.setSpellCheckerEnabled(false)
  installPermissionHandlers(targetSession, 'trusted-renderer-fullscreen')
}

/**
 * Patreon and its identity-provider popups share this short-lived session.
 * Marking the session lets the global navigation fallback preserve the OAuth
 * redirect chain while the window-specific guards continue to enforce the
 * same host allowlist and external-link behavior.
 */
export function hardenPatreonLoginSession(targetSession: Session): void {
  patreonLoginSessions.add(targetSession)
  targetSession.setSpellCheckerEnabled(false)
  installPermissionHandlers(targetSession, 'deny-all')
}

/** Register the exact destinations an application-owned renderer may load. */
export function registerTrustedRendererSecurityPolicy(
  webContents: WebContents,
  policy: TrustedRendererSecurityPolicy
): void {
  trustedRendererPolicies.set(webContents, policy)
}

/**
 * Give every current and future WebContents a deny-by-default safety net.
 * Purpose-built window guards replace the popup handler and register their
 * navigation policy before loading content; this fallback catches any future
 * window type that forgets to do so.
 */
export function installGlobalWebContentsGuards(targetApp: App): void {
  if (guardedApps.has(targetApp)) {
    return
  }

  guardedApps.add(targetApp)
  targetApp.on('web-contents-created', (_event, webContents) => {
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const guardNavigation = (event: Electron.Event, url: string): void => {
      if (!isAllowedNavigation(webContents, url)) {
        event.preventDefault()
      }
    }
    webContents.on('will-navigate', guardNavigation)
    webContents.on('will-redirect', guardNavigation)
  })
}

function installPermissionHandlers(
  targetSession: Session,
  mode: PermissionMode
): void {
  const currentMode = permissionModes.get(targetSession)
  // Permission policy may only stay the same or become stricter.
  if (currentMode === mode || currentMode === 'deny-all') {
    return
  }

  targetSession.setPermissionCheckHandler((webContents, permission, _requestingOrigin, details) =>
    isPermissionAllowed(mode, webContents, permission, details))
  targetSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isPermissionAllowed(mode, webContents, permission, details))
  })
  permissionModes.set(targetSession, mode)
}

function isPermissionAllowed(
  mode: PermissionMode,
  webContents: WebContents | null,
  permission: string,
  details: PermissionDetails
): boolean {
  if (
    mode !== 'trusted-renderer-fullscreen'
    || permission !== 'fullscreen'
    || webContents === null
    || details.isMainFrame !== true
    || typeof details.requestingUrl !== 'string'
  ) {
    return false
  }

  const rendererPolicy = trustedRendererPolicies.get(webContents)
  return rendererPolicy?.allowFullscreen === true
    && rendererPolicy.isNavigationAllowed(details.requestingUrl)
}

function isAllowedNavigation(webContents: WebContents, url: string): boolean {
  const policy = trustedRendererPolicies.get(webContents)?.isNavigationAllowed
  if (policy) {
    return policy(url)
  }

  return patreonLoginSessions.has(webContents.session) && isAllowedPatreonLoginUrl(url)
}
