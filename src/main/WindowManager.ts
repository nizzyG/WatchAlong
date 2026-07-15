import { BrowserWindow, screen, type WebContents, type WebPreferences } from 'electron'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  ImportWizardContext,
  ImportWizardLaunchOptions,
  MovieWindowClosedEvent,
  MovieWindowCloseOptions,
  MovieWindowCloseResult,
  MovieWindowGeometryEvent,
  MovieWindowInit,
  MovieMediaCommandRequest,
  MovieWindowOpenRequest,
  MovieWindowOpenResult,
  OverlayGeometry,
  RemoteMediaCommandResult,
  RemoteMediaState,
  WizardLifecycleEvent,
  WizardOutcome
} from '@shared/types'
import {
  bindTrustedMovieSource,
  ensureVisibleWindowBounds,
  MOVIE_WINDOW_MIN_HEIGHT,
  MOVIE_WINDOW_MIN_WIDTH,
  normalizeRemoteMediaCommandResult,
  normalizeRemoteMediaEvent,
  PendingMovieCommandTracker,
  SerialTaskQueue
} from './movieWindowHelpers'
import { SessionStore } from './sessionStore'
import { APP_NAME, IPC_PREFIX, MAIN_WINDOW_CLOSE_TIMEOUT_MS } from './constants'
import { hardenRendererWindow, type RendererRole } from './ipc/security'
import { createSessionMediaUrl } from './mediaProtocol'
import { secureRendererWebPreferences } from './rendererSecurityPolicy'
import { createRendererEntryUrl } from './rendererProtocolPolicy'

const AUDIO_TRACKS_BLINK_FEATURE = 'AudioVideoTracks'

/**
 * Audio-track enumeration is a playback-only capability. Keep onboarding and
 * import wizard renderers on the baseline sandboxed preferences; Patreon and
 * other remote windows are created outside WindowManager and never use this
 * helper.
 */
export function rendererWebPreferencesForRole(preload: string, role: RendererRole): WebPreferences {
  const preferences = secureRendererWebPreferences(preload)
  return role === 'main' || role === 'movie'
    ? { ...preferences, enableBlinkFeatures: AUDIO_TRACKS_BLINK_FEATURE }
    : preferences
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private wizardWindow: BrowserWindow | null = null
  private movieWindow: BrowserWindow | null = null
  private wizardCloseOutcome: WizardOutcome | null = null
  private recenterWizardOnParent: (() => void) | null = null
  private importWizardContext: ImportWizardContext = { mode: 'new', sessionId: null, movie: null }
  private movieWindowInit: MovieWindowInit | null = null
  private movieWindowGeometry: OverlayGeometry | null = null
  private lastMovieMediaState: RemoteMediaState | null = null
  private closingMovieWindowIntentionally = false
  private resolveMovieWindowReady: (() => void) | null = null
  private movieWindowClosedEvent: MovieWindowClosedEvent | undefined
  private shouldNotifyMovieWindowClosed = true
  private mainWindowCloseConfirmed = false
  private mainWindowCloseTimer: NodeJS.Timeout | null = null
  private movieWindowOperationVersion = 0
  private readonly movieWindowOpenQueue = new SerialTaskQueue()
  private readonly pendingMovieCommands = new PendingMovieCommandTracker({
    getState: () => this.lastMovieMediaState ?? this.emptyRemoteMediaState(),
    onTimeout: () => this.closeUnresponsiveMovieWindow()
  })

  constructor(
    private readonly sessionStore: SessionStore,
    private readonly developmentRendererUrl: string | null = null
  ) {}

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  focusMainWindow(): void {
    const target = this.getMainWindow()
    if (!target) return
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
  }

  getImportWizardContext(): ImportWizardContext {
    return this.importWizardContext
  }

  getMovieWindowInit(sender: WebContents): MovieWindowInit | null {
    return this.isCurrentMovieWindowSender(sender) ? this.movieWindowInit : null
  }

  markMovieWindowReady(sender: WebContents): boolean {
    if (!this.isCurrentMovieWindowSender(sender)) return false
    this.resolveMovieWindowReady?.()
    this.resolveMovieWindowReady = null
    return true
  }

  handleMovieMediaCommandResult(sender: WebContents, value: unknown): boolean {
    if (!this.isCurrentMovieWindowSender(sender)) return false
    const result = normalizeRemoteMediaCommandResult(value)
    if (!result || !this.pendingMovieCommands.resolve(result)) return false
    this.lastMovieMediaState = result.state
    return true
  }

  handleMovieMediaEvent(sender: WebContents, value: unknown): boolean {
    if (!this.isCurrentMovieWindowSender(sender)) return false
    const event = normalizeRemoteMediaEvent(value)
    if (!event) return false
    this.lastMovieMediaState = event.state
    this.getMainWindow()?.webContents.send(`${IPC_PREFIX}:movie-media-event`, event)
    return true
  }

  requestMovieWindowPopIn(sender: WebContents): boolean {
    if (!this.isCurrentMovieWindowSender(sender)) return false
    this.sendMovieWindowPopInRequest()
    return true
  }

  public createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 780,
      minWidth: 1280,
      minHeight: 720,
      backgroundColor: '#0c0b09',
      title: APP_NAME,
      webPreferences: rendererWebPreferencesForRole(join(__dirname, '../preload/index.js'), 'main')
    })
  
    this.mainWindow.setMenuBarVisibility(false)
    this.mainWindow.on('close', (event) => {
      if (this.mainWindowCloseConfirmed) {
        return
      }
  
      event.preventDefault()
      this.requestMainWindowClose()
    })
  
    this.mainWindow.on('closed', () => {
      this.clearMainWindowCloseTimer()
      this.mainWindowCloseConfirmed = false
      this.closeMovieWindowWithoutPopIn()
      this.mainWindow = null
    })
  
    void this.loadRenderer(this.mainWindow)
  }
  
  private requestMainWindowClose(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || this.mainWindowCloseTimer) {
      return
    }
  
    this.mainWindow.webContents.send(`${IPC_PREFIX}:main-window-close-request`)
    this.mainWindowCloseTimer = setTimeout(() => {
      this.confirmMainWindowClose()
    }, MAIN_WINDOW_CLOSE_TIMEOUT_MS)
  }
  
  public confirmMainWindowClose(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }
  
    this.clearMainWindowCloseTimer()
    if (this.mainWindowCloseConfirmed) {
      return
    }
  
    this.mainWindowCloseConfirmed = true
    this.mainWindow.close()
  }
  
  private clearMainWindowCloseTimer(): void {
    if (this.mainWindowCloseTimer) {
      clearTimeout(this.mainWindowCloseTimer)
      this.mainWindowCloseTimer = null
    }
  }
  
  public openOnboardingWizard(options?: ImportWizardLaunchOptions): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }
  
    if (this.wizardWindow && !this.wizardWindow.isDestroyed()) {
      this.importWizardContext = this.createImportWizardContext(options)
      this.wizardWindow.focus()
      return
    }
  
    this.importWizardContext = this.createImportWizardContext(options)
    this.wizardCloseOutcome = null
    this.sendWizardLifecycle({ type: 'opened' })
  
    this.wizardWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 600,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      frame: false,
      show: false,
      parent: this.mainWindow,
      modal: true,
      title: 'Choose Your Movie',
      backgroundColor: '#0c0b09',
      webPreferences: rendererWebPreferencesForRole(join(__dirname, '../preload/index.js'), 'wizard')
    })
  
    this.wizardWindow.setMenuBarVisibility(false)
    this.recenterWizardOnParent = () => this.centerWizardOnParent()
    this.mainWindow.on('move', this.recenterWizardOnParent)
    this.mainWindow.on('resize', this.recenterWizardOnParent)
  
    this.wizardWindow.once('ready-to-show', () => {
      this.centerWizardOnParent()
      this.wizardWindow?.show()
      this.wizardWindow?.focus()
    })
  
    this.wizardWindow.on('close', (event) => {
      if (this.wizardCloseOutcome) return
      event.preventDefault()
      this.wizardWindow?.webContents.send(`${IPC_PREFIX}:wizard-close-request`)
    })
  
    this.wizardWindow.on('closed', () => {
      const outcome = this.wizardCloseOutcome ?? 'cancelled'
      if (this.mainWindow && this.recenterWizardOnParent) {
        this.mainWindow.off('move', this.recenterWizardOnParent)
        this.mainWindow.off('resize', this.recenterWizardOnParent)
      }
      this.wizardWindow = null
      this.wizardCloseOutcome = null
      this.recenterWizardOnParent = null
      this.sendWizardLifecycle({ type: 'closed', outcome })
    })
  
    void this.loadRenderer(this.wizardWindow, 'wizard')
  }
  
  public finishOnboardingWizard(outcome: WizardOutcome): void {
    this.wizardCloseOutcome = outcome
    if (this.wizardWindow && !this.wizardWindow.isDestroyed()) {
      this.wizardWindow.close()
    } else {
      this.sendWizardLifecycle({ type: 'closed', outcome })
    }
  }
  
  private createDefaultWizardContext(): ImportWizardContext {
    return {
      mode: 'new',
      sessionId: null,
      movie: null
    }
  }
  
  private createImportWizardContext(options?: ImportWizardLaunchOptions): ImportWizardContext {
    const mode = options?.mode ?? 'new'
    if (mode !== 'swap-reaction') {
      return {
        mode,
        sessionId: null,
        movie: null
      }
    }
  
    const session = options?.sessionId
      ? this.sessionStore.getSession(options.sessionId)
      : this.sessionStore.getActiveSession()
    if (!session?.moviePath) {
      return this.createDefaultWizardContext()
    }
  
    return {
      mode: 'swap-reaction',
      sessionId: session.id,
      movie: {
        path: session.moviePath,
        name: basename(session.moviePath)
      }
    }
  }
  
  private centerWizardOnParent(): void {
    if (!this.mainWindow || !this.wizardWindow || this.mainWindow.isDestroyed() || this.wizardWindow.isDestroyed()) {
      return
    }
  
    const parentBounds = this.mainWindow.getBounds()
    const wizardBounds = this.wizardWindow.getBounds()
    this.wizardWindow.setBounds({
      x: Math.round(parentBounds.x + (parentBounds.width - wizardBounds.width) / 2),
      y: Math.round(parentBounds.y + (parentBounds.height - wizardBounds.height) / 2),
      width: wizardBounds.width,
      height: wizardBounds.height
    })
  }
  
  private async loadRenderer(targetWindow: BrowserWindow, view?: 'wizard' | 'movie'): Promise<void> {
    const rendererUrl = new URL(this.developmentRendererUrl ?? createRendererEntryUrl(view))
    if (this.developmentRendererUrl && view) {
      rendererUrl.searchParams.set('view', view)
    }

    hardenRendererWindow(targetWindow, (view ?? 'main') satisfies RendererRole, rendererUrl.toString())
    await targetWindow.loadURL(rendererUrl.toString())
  }
  
  private sendWizardLifecycle(event: WizardLifecycleEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }
  
    this.mainWindow.webContents.send(`${IPC_PREFIX}:wizard-lifecycle`, event)
  }
  
  public sendToRendererWindows(channel: string, payload: unknown): void {
    for (const targetWindow of [this.mainWindow, this.wizardWindow]) {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(channel, payload)
      }
    }
  }
  
  public openMovieWindow(request: MovieWindowOpenRequest): Promise<MovieWindowOpenResult> {
    const operationVersion = ++this.movieWindowOperationVersion
    return this.movieWindowOpenQueue.run(() => this.openMovieWindowSerially(request, operationVersion))
  }

  private async openMovieWindowSerially(
    request: MovieWindowOpenRequest,
    operationVersion: number
  ): Promise<MovieWindowOpenResult> {
    const requestedGeometry = this.normalizeWindowGeometry(request?.geometry)
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : ''
    const source = this.getStoredMovieSource(sessionId)
    if (!source) {
      return this.movieWindowOpenFailure(requestedGeometry, 'missing-media')
    }
    if (operationVersion !== this.movieWindowOperationVersion || this.sessionStore.getActiveSession()?.id !== sessionId) {
      return this.movieWindowOpenFailure(requestedGeometry, 'stale-session')
    }

    if (
      this.movieWindow && !this.movieWindow.isDestroyed() &&
      this.movieWindowInit?.sessionId === sessionId &&
      !this.closingMovieWindowIntentionally
    ) {
      return {
        opened: true,
        geometry: this.currentMovieWindowGeometry() ?? requestedGeometry,
        state: this.lastMovieMediaState
      }
    }

    await this.closeMovieWindowNow({ notifyMainWindow: false })
    const refreshedSource = this.getStoredMovieSource(sessionId)
    if (
      operationVersion !== this.movieWindowOperationVersion ||
      this.sessionStore.getActiveSession()?.id !== sessionId ||
      !refreshedSource || refreshedSource.path !== source.path
    ) {
      return this.movieWindowOpenFailure(requestedGeometry, refreshedSource ? 'stale-session' : 'missing-media')
    }

    const bounds = this.movieWindowBoundsFromRequest(request)
    const currentTime = Math.max(0, finiteOr(request.currentTime, 0))
    const playbackRate = clamp(finiteOr(request.playbackRate, 1), 0.25, 4)
    const volume = clamp(finiteOr(request.volume, 1), 0, 1)
    const muted = request.muted === true
    const subtitleText = typeof request.subtitleText === 'string' ? request.subtitleText : null
    this.movieWindowGeometry = bounds
    this.movieWindowInit = {
      sessionId,
      title: refreshedSource.session.title,
      mediaUrl: refreshedSource.mediaUrl,
      subtitleText,
      currentTime,
      playbackRate,
      volume,
      muted,
      audioTrackPreference: refreshedSource.session.movieAudioTrackPreference
    }
    this.lastMovieMediaState = {
      currentTime,
      duration: Number.NaN,
      paused: true,
      playbackRate,
      readyState: 0,
      seeking: false,
      ended: false,
      volume,
      muted
    }

    const targetWindow = new BrowserWindow({
      ...bounds,
      minWidth: 320,
      minHeight: 180,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      show: false,
      title: refreshedSource.session.title,
      backgroundColor: '#0c0b09',
      webPreferences: rendererWebPreferencesForRole(join(__dirname, '../preload/index.js'), 'movie')
    })
    this.movieWindow = targetWindow

    targetWindow.setMenuBarVisibility(false)
    targetWindow.on('move', () => this.notifyMovieWindowGeometry())
    targetWindow.on('resize', () => this.notifyMovieWindowGeometry())
    targetWindow.on('close', (event) => {
      if (this.closingMovieWindowIntentionally) {
        return
      }

      event.preventDefault()
      this.sendMovieWindowPopInRequest()
    })
    targetWindow.on('closed', () => {
      this.pendingMovieCommands.resolveAll('Movie window closed.')
      if (this.movieWindow !== targetWindow) {
        return
      }
      this.movieWindow = null
      this.movieWindowInit = null
      this.resolveMovieWindowReady = null
      const closedEvent = { ...this.movieWindowClosedEvent, sessionId }
      const notifyMainWindow = this.shouldNotifyMovieWindowClosed
      this.movieWindowClosedEvent = undefined
      this.shouldNotifyMovieWindowClosed = true
      if (notifyMainWindow) {
        this.sendMovieWindowClosed(closedEvent)
      }
    })
    targetWindow.once('ready-to-show', () => {
      if (this.isCurrentMovieWindow(targetWindow, sessionId, refreshedSource.path, operationVersion)) {
        targetWindow.show()
      }
    })

    const readyPromise = new Promise<void>((resolve) => {
      this.resolveMovieWindowReady = resolve
    })
    try {
      await this.loadRenderer(targetWindow, 'movie')
      await Promise.race([readyPromise, delay(5000)])
    } catch {
      if (this.movieWindow === targetWindow) {
        await this.closeMovieWindowNow({ notifyMainWindow: false })
      }
      return this.movieWindowOpenFailure(requestedGeometry, 'renderer-load-failed')
    }

    if (!this.isCurrentMovieWindow(targetWindow, sessionId, refreshedSource.path, operationVersion)) {
      if (this.movieWindow === targetWindow) {
        await this.closeMovieWindowNow({ notifyMainWindow: false })
      }
      return this.movieWindowOpenFailure(requestedGeometry, 'stale-session')
    }

    this.notifyMovieWindowGeometry()
    return {
      opened: true,
      geometry: this.movieWindowGeometry ?? requestedGeometry,
      state: this.lastMovieMediaState
    }
  }

  public closeMovieWindow(options: MovieWindowCloseOptions = {}): Promise<MovieWindowCloseResult> {
    this.movieWindowOperationVersion += 1
    return this.closeMovieWindowNow(options)
  }

  private async closeMovieWindowNow(options: MovieWindowCloseOptions = {}): Promise<MovieWindowCloseResult> {
    const geometry = this.currentMovieWindowGeometry()
    const overlay = geometry ? this.movieWindowGeometryToOverlay(geometry) : null
    const state = this.lastMovieMediaState
    const notifyMainWindow = options.notifyMainWindow !== false
    const targetWindow = this.movieWindow
    const sessionId = this.movieWindowInit?.sessionId
    this.closingMovieWindowIntentionally = true
    try {
      if (targetWindow && !targetWindow.isDestroyed()) {
        this.shouldNotifyMovieWindowClosed = notifyMainWindow
        const closed = new Promise<void>((resolve) => {
          targetWindow.once('closed', () => resolve())
        })
        targetWindow.close()
        await closed
      } else if (notifyMainWindow) {
        this.sendMovieWindowClosed({ ...this.movieWindowClosedEvent, sessionId })
        this.movieWindowClosedEvent = undefined
      }
    } finally {
      this.closingMovieWindowIntentionally = false
      if (!targetWindow || targetWindow.isDestroyed()) {
        this.shouldNotifyMovieWindowClosed = true
      }
    }
  
    return { geometry, overlay, state }
  }
  
  public closeMovieWindowWithoutPopIn(): void {
    void this.closeMovieWindow({ notifyMainWindow: false })
  }
  
  private notifyMovieWindowGeometry(): void {
    const geometry = this.currentMovieWindowGeometry()
    const sessionId = this.movieWindowInit?.sessionId
    if (!geometry || !sessionId) {
      return
    }
  
    this.movieWindowGeometry = geometry
    const event: MovieWindowGeometryEvent = {
      sessionId,
      geometry,
      overlay: this.movieWindowGeometryToOverlay(geometry)
    }
  
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-geometry`, event)
    }
  }
  
  private currentMovieWindowGeometry(): OverlayGeometry | null {
    if (this.movieWindow && !this.movieWindow.isDestroyed()) {
      const bounds = this.movieWindow.getBounds()
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }
    }
  
    return this.movieWindowGeometry
  }
  
  private movieWindowBoundsFromRequest(request: MovieWindowOpenRequest): Electron.Rectangle {
    const geometry = this.normalizeWindowGeometry(request.geometry)
    let bounds: Electron.Rectangle
    if (request.geometryMode === 'screen' || !this.mainWindow || this.mainWindow.isDestroyed()) {
      bounds = geometry
    } else {
      const contentBounds = this.mainWindow.getContentBounds()
      bounds = {
        ...geometry,
        x: Math.round(contentBounds.x + geometry.x),
        y: Math.round(contentBounds.y + geometry.y)
      }
    }
  
    return ensureVisibleWindowBounds(bounds, screen.getAllDisplays(), screen.getPrimaryDisplay())
  }
  
  private movieWindowGeometryToOverlay(geometry: OverlayGeometry): OverlayGeometry | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null
    }
  
    const contentBounds = this.mainWindow.getContentBounds()
    return {
      x: Math.round(geometry.x - contentBounds.x),
      y: Math.round(geometry.y - contentBounds.y),
      width: geometry.width,
      height: geometry.height
    }
  }
  
  private normalizeWindowGeometry(geometry?: OverlayGeometry | null): Electron.Rectangle {
    return {
      x: Math.round(finiteOr(geometry?.x, 24)),
      y: Math.round(finiteOr(geometry?.y, 24)),
      width: Math.max(MOVIE_WINDOW_MIN_WIDTH, Math.round(finiteOr(geometry?.width, 420))),
      height: Math.max(MOVIE_WINDOW_MIN_HEIGHT, Math.round(finiteOr(geometry?.height, 236)))
    }
  }

  private getStoredMovieSource(sessionId: string) {
    if (!sessionId) {
      return null
    }
    const session = this.sessionStore.getSession(sessionId)
    if (!session?.moviePath || !existsSync(session.moviePath)) {
      return null
    }
    return {
      session,
      path: session.moviePath,
      mediaUrl: createSessionMediaUrl(session, 'movie')
    }
  }

  private isCurrentMovieWindow(
    targetWindow: BrowserWindow,
    sessionId: string,
    moviePath: string,
    operationVersion: number
  ): boolean {
    const currentSource = this.getStoredMovieSource(sessionId)
    return operationVersion === this.movieWindowOperationVersion &&
      this.sessionStore.getActiveSession()?.id === sessionId &&
      currentSource?.path === moviePath &&
      this.movieWindow === targetWindow &&
      !targetWindow.isDestroyed()
  }

  private isCurrentMovieWindowSender(sender: WebContents): boolean {
    return Boolean(
      this.movieWindow &&
      !this.movieWindow.isDestroyed() &&
      this.movieWindow.webContents === sender
    )
  }

  private movieWindowOpenFailure(geometry: OverlayGeometry, reason: string): MovieWindowOpenResult {
    return {
      opened: false,
      geometry,
      state: this.lastMovieMediaState,
      reason
    }
  }
  
  private sendMovieWindowClosed(event?: MovieWindowClosedEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-closed`, event)
    }
  }
  
  private sendMovieWindowPopInRequest(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-pop-in-requested`, {
        sessionId: this.movieWindowInit?.sessionId
      } satisfies MovieWindowClosedEvent)
    }
  }
  
  private closeUnresponsiveMovieWindow(): void {
    this.movieWindowClosedEvent = {
      sessionId: this.movieWindowInit?.sessionId,
      reason: 'unresponsive'
    }
    void this.closeMovieWindow()
  }
  
  public sendMovieMediaCommand(command: MovieMediaCommandRequest): Promise<RemoteMediaCommandResult> {
    if (!command || typeof command.id !== 'string' || command.id.length === 0 || command.id.length > 256) {
      return Promise.resolve({
        id: '',
        ok: false,
        state: this.lastMovieMediaState ?? this.emptyRemoteMediaState(),
        error: 'Invalid movie command.'
      })
    }
    if (!this.movieWindow || this.movieWindow.isDestroyed()) {
      return Promise.resolve({
        id: command.id,
        ok: false,
        state: this.lastMovieMediaState ?? this.emptyRemoteMediaState(),
        error: 'Movie window is not open.'
      })
    }

    const sessionId = this.movieWindowInit?.sessionId
    const source = sessionId ? this.getStoredMovieSource(sessionId) : null
    if (!source || this.sessionStore.getActiveSession()?.id !== sessionId) {
      return Promise.resolve({
        id: command.id,
        ok: false,
        state: this.lastMovieMediaState ?? this.emptyRemoteMediaState(),
        error: 'The stored movie file is no longer available.'
      })
    }
    const trustedCommand = bindTrustedMovieSource(command, {
      mediaUrl: source.mediaUrl,
      title: source.session.title,
      audioTrackPreference: source.session.movieAudioTrackPreference
    })
  
    return new Promise((resolve) => {
      this.pendingMovieCommands.add(command.id, resolve)
      this.movieWindow!.webContents.send(`${IPC_PREFIX}:movie-media-command`, trustedCommand)
    })
  }
  
  private emptyRemoteMediaState(): RemoteMediaState {
    return {
      currentTime: 0,
      duration: Number.NaN,
      paused: true,
      playbackRate: 1,
      readyState: 0,
      seeking: false,
      ended: false,
      volume: 1,
      muted: false
    }
  }
  
  
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
