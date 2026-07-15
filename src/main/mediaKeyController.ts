import { globalShortcut, type BrowserWindow, type WebContents } from 'electron'
import { IPC_PREFIX } from './constants'

export const MEDIA_PLAY_PAUSE_ACCELERATOR = 'MediaPlayPause'

/**
 * Owns WatchAlong's system-wide media key for exactly one live main renderer.
 * Registration is deliberately dynamic so an idle library never captures a
 * play/pause gesture intended for another media app.
 */
export class MediaKeyController {
  private owner: WebContents | null = null
  private registered = false

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {}

  setPlayPauseEnabled(sender: WebContents, enabled: unknown): boolean {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('Media play/pause availability must be a boolean.')
    }

    const mainWindow = this.getMainWindow()
    const isCurrentMainRenderer = Boolean(
      mainWindow
      && !mainWindow.isDestroyed()
      && !sender.isDestroyed()
      && mainWindow.webContents === sender
    )

    if (!isCurrentMainRenderer) {
      if (this.owner === sender) this.deactivate()
      return false
    }

    if (!enabled) {
      if (this.owner === sender) this.deactivate()
      return false
    }

    if (this.owner === sender && this.registered) return true

    this.deactivate()
    this.owner = sender
    sender.once('destroyed', this.handleOwnerUnavailable)
    sender.once('render-process-gone', this.handleOwnerUnavailable)

    this.registered = globalShortcut.register(
      MEDIA_PLAY_PAUSE_ACCELERATOR,
      this.handlePlayPause
    )
    if (!this.registered) this.detachOwner()
    return this.registered
  }

  dispose(): void {
    this.deactivate()
  }

  private readonly handlePlayPause = (): void => {
    const mainWindow = this.getMainWindow()
    const owner = this.owner
    if (
      !this.registered
      || !owner
      || owner.isDestroyed()
      || !mainWindow
      || mainWindow.isDestroyed()
      || mainWindow.webContents !== owner
    ) {
      this.deactivate()
      return
    }

    owner.send(`${IPC_PREFIX}:media-play-pause`)
  }

  private readonly handleOwnerUnavailable = (): void => {
    this.deactivate()
  }

  private deactivate(): void {
    if (this.registered) {
      this.registered = false
      globalShortcut.unregister(MEDIA_PLAY_PAUSE_ACCELERATOR)
    }
    this.detachOwner()
  }

  private detachOwner(): void {
    this.owner?.removeListener('destroyed', this.handleOwnerUnavailable)
    this.owner?.removeListener('render-process-gone', this.handleOwnerUnavailable)
    this.owner = null
  }
}
