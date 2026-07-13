import { BrowserWindow, screen, shell } from 'electron'
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
  MovieWindowOpenRequest,
  MovieWindowOpenResult,
  OverlayGeometry,
  RemoteMediaCommand,
  RemoteMediaCommandResult,
  RemoteMediaEvent,
  RemoteMediaState,
  WizardLifecycleEvent,
  WizardOutcome
} from '@shared/types'
import { ensureVisibleWindowBounds, MOVIE_WINDOW_MIN_HEIGHT, MOVIE_WINDOW_MIN_WIDTH, PendingMovieCommandTracker } from './movieWindowHelpers'
import { SessionStore } from './sessionStore'
import { APP_NAME, IPC_PREFIX, MAIN_WINDOW_CLOSE_TIMEOUT_MS } from './constants'

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
  private readonly pendingMovieCommands = new PendingMovieCommandTracker({
    getState: () => this.lastMovieMediaState ?? this.emptyRemoteMediaState(),
    onTimeout: () => this.closeUnresponsiveMovieWindow()
  })

  constructor(private readonly sessionStore: SessionStore) {}

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  getImportWizardContext(): ImportWizardContext {
    return this.importWizardContext
  }

  getMovieWindowInit(): MovieWindowInit | null {
    return this.movieWindowInit
  }

  markMovieWindowReady(): void {
    this.resolveMovieWindowReady?.()
    this.resolveMovieWindowReady = null
  }

  handleMovieMediaCommandResult(result: RemoteMediaCommandResult): void {
    this.lastMovieMediaState = result.state
    this.pendingMovieCommands.resolve(result)
  }

  handleMovieMediaEvent(event: RemoteMediaEvent): void {
    this.lastMovieMediaState = event.state
    this.getMainWindow()?.webContents.send(`${IPC_PREFIX}:movie-media-event`, event)
  }

  public createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 780,
      minWidth: 960,
      minHeight: 560,
      backgroundColor: '#05070a',
      title: APP_NAME,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  
    this.mainWindow.setMenuBarVisibility(false)
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
  
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
      backgroundColor: '#05070a',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  
    this.wizardWindow.setMenuBarVisibility(false)
    this.wizardWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
  
    this.recenterWizardOnParent = () => this.centerWizardOnParent()
    this.mainWindow.on('move', this.recenterWizardOnParent)
    this.mainWindow.on('resize', this.recenterWizardOnParent)
  
    this.wizardWindow.once('ready-to-show', () => {
      this.centerWizardOnParent()
      this.wizardWindow?.show()
      this.wizardWindow?.focus()
    })
  
    this.wizardWindow.on('close', () => {
      this.wizardCloseOutcome ??= 'cancelled'
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
    if (process.env.ELECTRON_RENDERER_URL) {
      const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
      if (view) {
        rendererUrl.searchParams.set('view', view)
      }
      await targetWindow.loadURL(rendererUrl.toString())
      return
    }
  
    await targetWindow.loadFile(
      join(__dirname, '../renderer/index.html'),
      view ? { query: { view } } : undefined
    )
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
  
  public async openMovieWindow(request: MovieWindowOpenRequest): Promise<MovieWindowOpenResult> {
    const session = this.sessionStore.getSession(request.sessionId)
    if (!session?.moviePath || !existsSync(session.moviePath)) {
      return {
        opened: false,
        geometry: request.geometry,
        state: this.lastMovieMediaState,
        reason: 'missing-media'
      }
    }
  
    await this.closeMovieWindow({ notifyMainWindow: false })
  
    const bounds = this.movieWindowBoundsFromRequest(request)
    this.movieWindowGeometry = bounds
    this.movieWindowInit = {
      sessionId: request.sessionId,
      title: request.title,
      mediaUrl: request.mediaUrl,
      subtitleText: request.subtitleText,
      currentTime: request.currentTime,
      playbackRate: request.playbackRate,
      volume: request.volume,
      muted: request.muted
    }
    this.lastMovieMediaState = {
      currentTime: request.currentTime,
      duration: Number.NaN,
      paused: true,
      playbackRate: request.playbackRate,
      readyState: 0,
      seeking: false,
      ended: false,
      volume: request.volume,
      muted: request.muted
    }
  
    this.movieWindow = new BrowserWindow({
      ...bounds,
      minWidth: 320,
      minHeight: 180,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      show: false,
      title: request.title,
      backgroundColor: '#05070a',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  
    this.movieWindow.setMenuBarVisibility(false)
    this.movieWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
  
    this.movieWindow.on('move', () => this.notifyMovieWindowGeometry())
    this.movieWindow.on('resize', () => this.notifyMovieWindowGeometry())
    this.movieWindow.on('close', (event) => {
      if (this.closingMovieWindowIntentionally) {
        return
      }
  
      event.preventDefault()
      this.sendMovieWindowPopInRequest()
    })
    this.movieWindow.on('closed', () => {
      this.pendingMovieCommands.resolveAll('Movie window closed.')
      this.movieWindow = null
      this.movieWindowInit = null
      this.resolveMovieWindowReady = null
      const closedEvent = this.movieWindowClosedEvent
      const notifyMainWindow = this.shouldNotifyMovieWindowClosed
      this.movieWindowClosedEvent = undefined
      this.shouldNotifyMovieWindowClosed = true
      if (notifyMainWindow) {
        this.sendMovieWindowClosed(closedEvent)
      }
    })
    this.movieWindow.once('ready-to-show', () => {
      this.movieWindow?.show()
    })
  
    const readyPromise = new Promise<void>((resolve) => {
      this.resolveMovieWindowReady = resolve
    })
    await this.loadRenderer(this.movieWindow, 'movie')
    await Promise.race([readyPromise, delay(5000)])
    this.notifyMovieWindowGeometry()
  
    return {
      opened: true,
      geometry: this.movieWindowGeometry,
      state: this.lastMovieMediaState
    }
  }
  
  public async closeMovieWindow(options: MovieWindowCloseOptions = {}): Promise<MovieWindowCloseResult> {
    const geometry = this.currentMovieWindowGeometry()
    const overlay = geometry ? this.movieWindowGeometryToOverlay(geometry) : null
    const state = this.lastMovieMediaState
    const notifyMainWindow = options.notifyMainWindow !== false
    const targetWindow = this.movieWindow
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
        this.sendMovieWindowClosed(this.movieWindowClosedEvent)
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
    if (!geometry) {
      return
    }
  
    this.movieWindowGeometry = geometry
    const event: MovieWindowGeometryEvent = {
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
  
  private normalizeWindowGeometry(geometry: OverlayGeometry): Electron.Rectangle {
    return {
      x: Math.round(finiteOr(geometry.x, 24)),
      y: Math.round(finiteOr(geometry.y, 24)),
      width: Math.max(MOVIE_WINDOW_MIN_WIDTH, Math.round(finiteOr(geometry.width, 420))),
      height: Math.max(MOVIE_WINDOW_MIN_HEIGHT, Math.round(finiteOr(geometry.height, 236)))
    }
  }
  
  private sendMovieWindowClosed(event?: MovieWindowClosedEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-closed`, event)
    }
  }
  
  public sendMovieWindowPopInRequest(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-pop-in-requested`)
    }
  }
  
  private closeUnresponsiveMovieWindow(): void {
    this.movieWindowClosedEvent = { reason: 'unresponsive' }
    void this.closeMovieWindow()
  }
  
  public sendMovieMediaCommand(command: RemoteMediaCommand): Promise<RemoteMediaCommandResult> {
    if (!this.movieWindow || this.movieWindow.isDestroyed()) {
      return Promise.resolve({
        id: command.id,
        ok: false,
        state: this.lastMovieMediaState ?? this.emptyRemoteMediaState(),
        error: 'Movie window is not open.'
      })
    }
  
    return new Promise((resolve) => {
      this.pendingMovieCommands.add(command.id, resolve)
      this.movieWindow!.webContents.send(`${IPC_PREFIX}:movie-media-command`, command)
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
