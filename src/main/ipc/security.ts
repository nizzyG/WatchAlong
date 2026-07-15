import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { isHttpExternalUrl, isTrustedRendererNavigation } from '../rendererSecurityPolicy'
import { registerTrustedRendererSecurityPolicy } from '../webContentsSecurity'

export type RendererRole = 'main' | 'wizard' | 'movie'

interface TrustedRenderer {
  role: RendererRole
  url: string
}

const trustedRenderers = new WeakMap<WebContents, TrustedRenderer>()

export function hardenRendererWindow(targetWindow: BrowserWindow, role: RendererRole, rendererUrl: string): void {
  const { webContents } = targetWindow
  trustedRenderers.set(webContents, { role, url: rendererUrl })
  registerTrustedRendererSecurityPolicy(webContents, {
    allowFullscreen: role === 'main' || role === 'movie',
    isNavigationAllowed: (url) => isTrustedRendererNavigation(url, rendererUrl)
  })

  webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttpUrl(url)
    return { action: 'deny' }
  })

  const guardNavigation = (event: Electron.Event, url: string): void => {
    if (isTrustedRendererNavigation(url, rendererUrl)) {
      return
    }

    event.preventDefault()
    openExternalHttpUrl(url)
  }

  webContents.on('will-navigate', guardNavigation)
  webContents.on('will-redirect', guardNavigation)
}

export function isTrustedIpcSender(event: IpcMainInvokeEvent, allowedRoles: readonly RendererRole[]): boolean {
  const trusted = trustedRenderers.get(event.sender)
  if (!trusted || !allowedRoles.includes(trusted.role)) {
    return false
  }

  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame.frameTreeNodeId !== event.sender.mainFrame.frameTreeNodeId) {
    return false
  }

  return isTrustedRendererNavigation(senderFrame.url, trusted.url)
}

export function isTrustedRendererWebContents(webContents: WebContents, allowedRoles: readonly RendererRole[]): boolean {
  const trusted = trustedRenderers.get(webContents)
  return Boolean(trusted && allowedRoles.includes(trusted.role))
}

export function handleTrustedIpc<Args extends unknown[], Result>(
  channel: string,
  allowedRoles: readonly RendererRole[],
  listener: (event: IpcMainInvokeEvent, ...args: Args) => Result
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event, allowedRoles)) {
      throw new Error('Blocked IPC request from an untrusted renderer.')
    }

    return listener(event, ...(args as Args))
  })
}

function openExternalHttpUrl(rawUrl: string): void {
  if (!isHttpExternalUrl(rawUrl)) {
    return
  }

  void shell.openExternal(rawUrl).catch(() => {
    // Opening an optional external link should never destabilize the app.
  })
}
