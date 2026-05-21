import { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  ensureVisibleWindowBounds,
  MOVIE_WINDOW_MIN_HEIGHT,
  MOVIE_WINDOW_MIN_WIDTH,
  PendingMovieCommandTracker
} from './movieWindowHelpers'
import {
  detectBrowsers,
  DownloadManager,
  extractPatreonSession,
  findPatreonSessionCookieValue,
  getDefaultReactionDownloadDirectory,
  PatreonSessionVault,
  ToolResolver
} from './mediaServices'
import { createMediaResponse } from './mediaRange'
import { PreferencesStore } from './preferencesStore'
import { SessionStore } from './sessionStore'
import type {
  BrowserName,
  AppPreferences,
  ImportWizardContext,
  ImportWizardLaunchOptions,
  LibrarySession,
  MediaFile,
  MediaRole,
  MovieWindowClosedEvent,
  MovieWindowCloseOptions,
  MovieWindowCloseResult,
  MovieWindowGeometryEvent,
  MovieWindowInit,
  MovieWindowOpenRequest,
  MovieWindowOpenResult,
  OpenVideosResult,
  OverlayGeometry,
  ReactionDownloadRequest,
  ReactionSource,
  RemoteMediaCommand,
  RemoteMediaCommandResult,
  RemoteMediaEvent,
  RemoteMediaState,
  WizardLifecycleEvent,
  WizardOutcome
} from '@shared/types'

const APP_NAME = 'WatchAlong'
const LEGACY_APP_NAME = 'WatchSync'
const MEDIA_SCHEME = 'watchalong'
const IPC_PREFIX = 'watchalong'

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let wizardWindow: BrowserWindow | null = null
let movieWindow: BrowserWindow | null = null
let wizardCloseOutcome: WizardOutcome | null = null
let recenterWizardOnParent: (() => void) | null = null
let importWizardContext: ImportWizardContext = createDefaultWizardContext()
let movieWindowInit: MovieWindowInit | null = null
let movieWindowGeometry: OverlayGeometry | null = null
let lastMovieMediaState: RemoteMediaState | null = null
let closingMovieWindowIntentionally = false
let resolveMovieWindowReady: (() => void) | null = null
let movieWindowClosedEvent: MovieWindowClosedEvent | undefined
let shouldNotifyMovieWindowClosed = true
const pendingMovieCommands = new PendingMovieCommandTracker({
  getState: () => lastMovieMediaState ?? emptyRemoteMediaState(),
  onTimeout: () => closeUnresponsiveMovieWindow()
})
let sessionStore: SessionStore
let preferencesStore: PreferencesStore
let toolResolver: ToolResolver
let patreonVault: PatreonSessionVault
let downloadManager: DownloadManager

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  mainWindow.setMenuBarVisibility(false)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    closeMovieWindowWithoutPopIn()
    mainWindow = null
  })

  void loadRenderer(mainWindow)
}

function openOnboardingWizard(options?: ImportWizardLaunchOptions): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (wizardWindow && !wizardWindow.isDestroyed()) {
    importWizardContext = createImportWizardContext(options)
    wizardWindow.focus()
    return
  }

  importWizardContext = createImportWizardContext(options)
  wizardCloseOutcome = null
  sendWizardLifecycle({ type: 'opened' })

  wizardWindow = new BrowserWindow({
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
    parent: mainWindow,
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

  wizardWindow.setMenuBarVisibility(false)
  wizardWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  recenterWizardOnParent = () => centerWizardOnParent()
  mainWindow.on('move', recenterWizardOnParent)
  mainWindow.on('resize', recenterWizardOnParent)

  wizardWindow.once('ready-to-show', () => {
    centerWizardOnParent()
    wizardWindow?.show()
    wizardWindow?.focus()
  })

  wizardWindow.on('close', () => {
    wizardCloseOutcome ??= 'cancelled'
  })

  wizardWindow.on('closed', () => {
    const outcome = wizardCloseOutcome ?? 'cancelled'
    if (mainWindow && recenterWizardOnParent) {
      mainWindow.off('move', recenterWizardOnParent)
      mainWindow.off('resize', recenterWizardOnParent)
    }
    wizardWindow = null
    wizardCloseOutcome = null
    recenterWizardOnParent = null
    sendWizardLifecycle({ type: 'closed', outcome })
  })

  void loadRenderer(wizardWindow, 'wizard')
}

function finishOnboardingWizard(outcome: WizardOutcome): void {
  wizardCloseOutcome = outcome
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.close()
  } else {
    sendWizardLifecycle({ type: 'closed', outcome })
  }
}

function createDefaultWizardContext(): ImportWizardContext {
  return {
    mode: 'new',
    sessionId: null,
    movie: null
  }
}

function createImportWizardContext(options?: ImportWizardLaunchOptions): ImportWizardContext {
  const mode = options?.mode ?? 'new'
  if (mode !== 'swap-reaction') {
    return {
      mode,
      sessionId: null,
      movie: null
    }
  }

  const session = options?.sessionId
    ? sessionStore.getSession(options.sessionId)
    : sessionStore.getActiveSession()
  if (!session?.moviePath) {
    return createDefaultWizardContext()
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

function centerWizardOnParent(): void {
  if (!mainWindow || !wizardWindow || mainWindow.isDestroyed() || wizardWindow.isDestroyed()) {
    return
  }

  const parentBounds = mainWindow.getBounds()
  const wizardBounds = wizardWindow.getBounds()
  wizardWindow.setBounds({
    x: Math.round(parentBounds.x + (parentBounds.width - wizardBounds.width) / 2),
    y: Math.round(parentBounds.y + (parentBounds.height - wizardBounds.height) / 2),
    width: wizardBounds.width,
    height: wizardBounds.height
  })
}

async function loadRenderer(targetWindow: BrowserWindow, view?: 'wizard' | 'movie'): Promise<void> {
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

function sendWizardLifecycle(event: WizardLifecycleEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(`${IPC_PREFIX}:wizard-lifecycle`, event)
}

function sendToRendererWindows(channel: string, payload: unknown): void {
  for (const targetWindow of [mainWindow, wizardWindow]) {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(channel, payload)
    }
  }
}

async function openMovieWindow(request: MovieWindowOpenRequest): Promise<MovieWindowOpenResult> {
  const session = sessionStore.getSession(request.sessionId)
  if (!session?.moviePath || !existsSync(session.moviePath)) {
    return {
      opened: false,
      geometry: request.geometry,
      state: lastMovieMediaState,
      reason: 'missing-media'
    }
  }

  await closeMovieWindow({ notifyMainWindow: false })

  const bounds = movieWindowBoundsFromRequest(request)
  movieWindowGeometry = bounds
  movieWindowInit = {
    sessionId: request.sessionId,
    title: request.title,
    mediaUrl: request.mediaUrl,
    subtitleText: request.subtitleText,
    currentTime: request.currentTime,
    playbackRate: request.playbackRate,
    volume: request.volume,
    muted: request.muted
  }
  lastMovieMediaState = {
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

  movieWindow = new BrowserWindow({
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

  movieWindow.setMenuBarVisibility(false)
  movieWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  movieWindow.on('move', notifyMovieWindowGeometry)
  movieWindow.on('resize', notifyMovieWindowGeometry)
  movieWindow.on('close', (event) => {
    if (closingMovieWindowIntentionally) {
      return
    }

    event.preventDefault()
    sendMovieWindowPopInRequest()
  })
  movieWindow.on('closed', () => {
    pendingMovieCommands.resolveAll('Movie window closed.')
    movieWindow = null
    movieWindowInit = null
    resolveMovieWindowReady = null
    const closedEvent = movieWindowClosedEvent
    const notifyMainWindow = shouldNotifyMovieWindowClosed
    movieWindowClosedEvent = undefined
    shouldNotifyMovieWindowClosed = true
    if (notifyMainWindow) {
      sendMovieWindowClosed(closedEvent)
    }
  })
  movieWindow.once('ready-to-show', () => {
    movieWindow?.show()
  })

  const readyPromise = new Promise<void>((resolve) => {
    resolveMovieWindowReady = resolve
  })
  await loadRenderer(movieWindow, 'movie')
  await Promise.race([readyPromise, delay(5000)])
  notifyMovieWindowGeometry()

  return {
    opened: true,
    geometry: movieWindowGeometry,
    state: lastMovieMediaState
  }
}

async function closeMovieWindow(options: MovieWindowCloseOptions = {}): Promise<MovieWindowCloseResult> {
  const geometry = currentMovieWindowGeometry()
  const overlay = geometry ? movieWindowGeometryToOverlay(geometry) : null
  const state = lastMovieMediaState
  const notifyMainWindow = options.notifyMainWindow !== false
  const targetWindow = movieWindow
  closingMovieWindowIntentionally = true
  try {
    if (targetWindow && !targetWindow.isDestroyed()) {
      shouldNotifyMovieWindowClosed = notifyMainWindow
      const closed = new Promise<void>((resolve) => {
        targetWindow.once('closed', () => resolve())
      })
      targetWindow.close()
      await closed
    } else if (notifyMainWindow) {
      sendMovieWindowClosed(movieWindowClosedEvent)
      movieWindowClosedEvent = undefined
    }
  } finally {
    closingMovieWindowIntentionally = false
    if (!targetWindow || targetWindow.isDestroyed()) {
      shouldNotifyMovieWindowClosed = true
    }
  }

  return { geometry, overlay, state }
}

function closeMovieWindowWithoutPopIn(): void {
  void closeMovieWindow({ notifyMainWindow: false })
}

function notifyMovieWindowGeometry(): void {
  const geometry = currentMovieWindowGeometry()
  if (!geometry) {
    return
  }

  movieWindowGeometry = geometry
  const event: MovieWindowGeometryEvent = {
    geometry,
    overlay: movieWindowGeometryToOverlay(geometry)
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-geometry`, event)
  }
}

function currentMovieWindowGeometry(): OverlayGeometry | null {
  if (movieWindow && !movieWindow.isDestroyed()) {
    const bounds = movieWindow.getBounds()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    }
  }

  return movieWindowGeometry
}

function movieWindowBoundsFromRequest(request: MovieWindowOpenRequest): Electron.Rectangle {
  const geometry = normalizeWindowGeometry(request.geometry)
  let bounds: Electron.Rectangle
  if (request.geometryMode === 'screen' || !mainWindow || mainWindow.isDestroyed()) {
    bounds = geometry
  } else {
    const contentBounds = mainWindow.getContentBounds()
    bounds = {
      ...geometry,
      x: Math.round(contentBounds.x + geometry.x),
      y: Math.round(contentBounds.y + geometry.y)
    }
  }

  return ensureVisibleWindowBounds(bounds, screen.getAllDisplays(), screen.getPrimaryDisplay())
}

function movieWindowGeometryToOverlay(geometry: OverlayGeometry): OverlayGeometry | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null
  }

  const contentBounds = mainWindow.getContentBounds()
  return {
    x: Math.round(geometry.x - contentBounds.x),
    y: Math.round(geometry.y - contentBounds.y),
    width: geometry.width,
    height: geometry.height
  }
}

function normalizeWindowGeometry(geometry: OverlayGeometry): Electron.Rectangle {
  return {
    x: Math.round(finiteOr(geometry.x, 24)),
    y: Math.round(finiteOr(geometry.y, 24)),
    width: Math.max(MOVIE_WINDOW_MIN_WIDTH, Math.round(finiteOr(geometry.width, 420))),
    height: Math.max(MOVIE_WINDOW_MIN_HEIGHT, Math.round(finiteOr(geometry.height, 236)))
  }
}

function sendMovieWindowClosed(event?: MovieWindowClosedEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-closed`, event)
  }
}

function sendMovieWindowPopInRequest(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`${IPC_PREFIX}:movie-window-pop-in-requested`)
  }
}

function closeUnresponsiveMovieWindow(): void {
  movieWindowClosedEvent = { reason: 'unresponsive' }
  void closeMovieWindow()
}

function sendMovieMediaCommand(command: RemoteMediaCommand): Promise<RemoteMediaCommandResult> {
  if (!movieWindow || movieWindow.isDestroyed()) {
    return Promise.resolve({
      id: command.id,
      ok: false,
      state: lastMovieMediaState ?? emptyRemoteMediaState(),
      error: 'Movie window is not open.'
    })
  }

  return new Promise((resolve) => {
    pendingMovieCommands.add(command.id, resolve)
    movieWindow!.webContents.send(`${IPC_PREFIX}:movie-media-command`, command)
  })
}

function emptyRemoteMediaState(): RemoteMediaState {
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

function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const mediaRequest = getMediaRequestFromUrl(request.url)
    if (!mediaRequest) {
      return new Response(`Invalid ${APP_NAME} media URL`, { status: 404 })
    }

    const session = sessionStore.getSession(mediaRequest.sessionId)
    const filePath = getMediaPath(session, mediaRequest.role)
    if (!filePath || !existsSync(filePath)) {
      return new Response('Media file is missing', { status: 404 })
    }

    try {
      return createMediaResponse(filePath, request.headers.get('range'))
    } catch (error) {
      console.error(error)
      return new Response('Could not read media file', { status: 500 })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle(`${IPC_PREFIX}:get-library`, () => sessionStore.read())

  ipcMain.handle(`${IPC_PREFIX}:get-preferences`, () => preferencesStore.read())

  ipcMain.handle(`${IPC_PREFIX}:set-preference`, (_event, key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
    if (!isPreferenceKey(key)) {
      throw new Error(`Unknown preference key: ${String(key)}`)
    }

    return preferencesStore.setPreference(key, value as never)
  })

  ipcMain.handle(`${IPC_PREFIX}:select-download-directory`, async (event): Promise<string | null> => {
    const parentWindow = getSenderWindow(event)
    if (!parentWindow) {
      return null
    }

    const currentDirectory = preferencesStore.read().reactionDownloadDirectory ?? getDefaultReactionDownloadDirectory()
    const result = await dialog.showOpenDialog(parentWindow, {
      title: 'Choose reaction download location',
      defaultPath: currentDirectory,
      properties: ['openDirectory', 'createDirectory']
    })

    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(`${IPC_PREFIX}:complete-onboarding`, () => {
    return preferencesStore.update({ hasCompletedOnboarding: true })
  })

  ipcMain.handle(`${IPC_PREFIX}:save-active-session`, (_event, patch: Partial<LibrarySession>) => {
    return sessionStore.updateActive(patch)
  })

  ipcMain.handle(`${IPC_PREFIX}:set-session-media`, (_event, role: MediaRole, filePath: string, reactionSource?: ReactionSource) => {
    return sessionStore.setSessionMedia(role, filePath, reactionSource)
  })

  ipcMain.handle(`${IPC_PREFIX}:replace-session-media`, (_event, sessionId: string, role: MediaRole, filePath: string, reactionSource?: ReactionSource) => {
    return sessionStore.replaceSessionMedia(sessionId, role, filePath, reactionSource)
  })

  ipcMain.handle(`${IPC_PREFIX}:create-or-switch-session-from-paths`, (_event, reactionPath: string, moviePath: string, reactionSource?: ReactionSource) => {
    return sessionStore.createOrSwitchSession(reactionPath, moviePath, reactionSource)
  })

  ipcMain.handle(`${IPC_PREFIX}:set-active-session`, (_event, sessionId: string) => {
    return sessionStore.setActiveSession(sessionId)
  })

  ipcMain.handle(`${IPC_PREFIX}:delete-session`, (_event, sessionId: string) => {
    return sessionStore.deleteSession(sessionId)
  })

  ipcMain.handle(`${IPC_PREFIX}:rename-session`, (_event, sessionId: string, title: string) => {
    return sessionStore.renameSession(sessionId, title)
  })

  ipcMain.handle(`${IPC_PREFIX}:get-media-url`, (_event, role: MediaRole, sessionId: string) => {
    const session = sessionStore.getSession(sessionId)
    const filePath = getMediaPath(session, role)
    if (!filePath || !existsSync(filePath)) {
      return null
    }

    return `${MEDIA_SCHEME}://media/${encodeURIComponent(sessionId)}/${role}?updated=${encodeURIComponent(session!.updatedAt)}`
  })

  ipcMain.handle(`${IPC_PREFIX}:open-movie-window`, (_event, request: MovieWindowOpenRequest) => {
    return openMovieWindow(request)
  })

  ipcMain.handle(`${IPC_PREFIX}:close-movie-window`, (_event, options?: MovieWindowCloseOptions) => {
    return closeMovieWindow(options)
  })

  ipcMain.handle(`${IPC_PREFIX}:request-movie-window-pop-in`, () => {
    sendMovieWindowPopInRequest()
  })

  ipcMain.handle(`${IPC_PREFIX}:get-movie-window-init`, () => {
    return movieWindowInit
  })

  ipcMain.handle(`${IPC_PREFIX}:movie-window-ready`, () => {
    resolveMovieWindowReady?.()
    resolveMovieWindowReady = null
  })

  ipcMain.handle(`${IPC_PREFIX}:movie-media-command`, (_event, command: RemoteMediaCommand) => {
    return sendMovieMediaCommand(command)
  })

  ipcMain.handle(`${IPC_PREFIX}:movie-media-command-result`, (_event, result: RemoteMediaCommandResult) => {
    lastMovieMediaState = result.state
    pendingMovieCommands.resolve(result)
  })

  ipcMain.handle(`${IPC_PREFIX}:movie-media-event`, (_event, event: RemoteMediaEvent) => {
    lastMovieMediaState = event.state
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`${IPC_PREFIX}:movie-media-event`, event)
    }
  })

  ipcMain.handle(`${IPC_PREFIX}:open-videos`, async (event): Promise<OpenVideosResult | null> => {
    const parentWindow = getSenderWindow(event)
    if (!parentWindow) {
      return null
    }

    const reaction = await selectVideo(parentWindow, 'Select the reaction watchalong video')
    if (!reaction) {
      return null
    }

    const movie = await selectVideo(parentWindow, 'Select the movie video')
    if (!movie) {
      return null
    }

    const previousCount = sessionStore.read().sessions.length
    const library = sessionStore.createOrSwitchSession(reaction.path, movie.path)
    const session = sessionStore.getActiveSession()

    return {
      library,
      session,
      created: library.sessions.length > previousCount,
      reaction,
      movie
    }
  })

  ipcMain.handle(`${IPC_PREFIX}:select-movie-file`, async (event): Promise<MediaFile | null> => {
    const parentWindow = getSenderWindow(event)
    if (!parentWindow) {
      return null
    }

    return selectVideo(parentWindow, 'Select the movie video')
  })

  ipcMain.handle(`${IPC_PREFIX}:select-reaction-file`, async (event): Promise<MediaFile | null> => {
    const parentWindow = getSenderWindow(event)
    if (!parentWindow) {
      return null
    }

    return selectVideo(parentWindow, 'Select the reaction watchalong video')
  })

  ipcMain.handle(`${IPC_PREFIX}:open-subtitle`, async (event) => {
    const parentWindow = getSenderWindow(event)
    if (!parentWindow || !sessionStore.getActiveSession()) {
      return null
    }

    const subtitle = await selectSubtitle(parentWindow)
    if (!subtitle) {
      return null
    }

    return sessionStore.updateActive({ subtitlePath: subtitle.path })
  })

  ipcMain.handle(`${IPC_PREFIX}:clear-subtitle`, () => {
    return sessionStore.updateActive({ subtitlePath: null })
  })

  ipcMain.handle(`${IPC_PREFIX}:get-subtitle-text`, (_event, sessionId: string) => {
    const session = sessionStore.getSession(sessionId)
    if (!session?.subtitlePath || !existsSync(session.subtitlePath)) {
      return null
    }

    try {
      return readFileSync(session.subtitlePath, 'utf8')
    } catch {
      return null
    }
  })

  ipcMain.handle(`${IPC_PREFIX}:check-tools`, () => toolResolver.checkTools())

  ipcMain.handle(`${IPC_PREFIX}:detect-browsers`, () => detectBrowsers())

  ipcMain.handle(`${IPC_PREFIX}:extract-patreon-session`, (_event, browserName: BrowserName) => {
    return extractPatreonSession(browserName, toolResolver, patreonVault)
  })

  ipcMain.handle(`${IPC_PREFIX}:open-patreon-login-window`, async (event) => {
    const parentWindow = getSenderWindow(event)
    if (!parentWindow) {
      return { ok: false, message: 'Main window is not ready.' }
    }

    return openPatreonLoginWindow(parentWindow)
  })

  ipcMain.handle(`${IPC_PREFIX}:get-saved-patreon-session-status`, () => patreonVault.status())

  ipcMain.handle(`${IPC_PREFIX}:save-last-patreon-session`, (_event, jobId: string) => {
    return downloadManager.saveLastPatreonSession(jobId)
  })

  ipcMain.handle(`${IPC_PREFIX}:discard-last-patreon-session`, (_event, jobId: string) => {
    return downloadManager.discardLastPatreonSession(jobId)
  })

  ipcMain.handle(`${IPC_PREFIX}:forget-patreon-session`, () => patreonVault.forget())

  ipcMain.handle(`${IPC_PREFIX}:start-reaction-download`, (_event, request: ReactionDownloadRequest) => {
    return downloadManager.start(request)
  })

  ipcMain.handle(`${IPC_PREFIX}:cancel-download`, (_event, jobId: string) => {
    downloadManager.cancel(jobId)
  })

  ipcMain.handle(`${IPC_PREFIX}:open-onboarding-wizard`, () => {
    openOnboardingWizard({ mode: 'new' })
  })

  ipcMain.handle(`${IPC_PREFIX}:open-import-wizard`, (_event, options?: ImportWizardLaunchOptions) => {
    openOnboardingWizard(options)
  })

  ipcMain.handle(`${IPC_PREFIX}:get-import-wizard-context`, () => {
    return importWizardContext
  })

  ipcMain.handle(`${IPC_PREFIX}:finish-onboarding-wizard`, (_event, outcome: WizardOutcome) => {
    finishOnboardingWizard(outcome)
  })
}

function openPatreonLoginWindow(parent: BrowserWindow): Promise<{ ok: boolean; token?: string; message?: string }> {
  return new Promise((resolvePromise) => {
    const partition = `patreon-login-${Date.now()}`
    const loginWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 760,
      minHeight: 560,
      parent,
      modal: false,
      title: 'Sign in to Patreon',
      backgroundColor: '#05070a',
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    let settled = false
    let timer: NodeJS.Timeout
    const loginSession = loginWindow.webContents.session
    const finish = (result: { ok: boolean; token?: string; message?: string }): void => {
      if (settled) {
        return
      }

      settled = true
      clearInterval(timer)
      loginSession.cookies.off('changed', onCookieChanged)
      if (!loginWindow.isDestroyed()) {
        loginWindow.close()
      }
      resolvePromise(result)
    }

    const checkCookies = async (): Promise<void> => {
      if (loginWindow.isDestroyed()) {
        return
      }

      const cookies = await loginSession.cookies.get({ name: 'session_id' })
      const sessionValue = findPatreonSessionCookieValue(cookies)
      if (sessionValue) {
        finish({ ok: true, token: patreonVault.createToken(`session_id=${sessionValue}`) })
      }
    }

    const onCookieChanged = (_event: unknown, cookie: Electron.Cookie, _cause: string, removed: boolean): void => {
      if (removed) {
        return
      }

      const sessionValue = findPatreonSessionCookieValue([cookie])
      if (sessionValue) {
        finish({ ok: true, token: patreonVault.createToken(`session_id=${sessionValue}`) })
      }
    }

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedPatreonLoginUrl(url)) {
        void loginWindow.loadURL(url)
      } else {
        openExternalUrl(url)
      }
      return { action: 'deny' }
    })
    loginWindow.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedPatreonLoginUrl(url)) {
        event.preventDefault()
        openExternalUrl(url)
      }
    })
    loginSession.cookies.on('changed', onCookieChanged)
    loginWindow.webContents.on('did-navigate', () => void checkCookies())
    loginWindow.webContents.on('did-navigate-in-page', () => void checkCookies())
    loginWindow.webContents.on('did-finish-load', () => void checkCookies())
    loginWindow.on('closed', () => finish({ ok: false, message: 'Patreon sign-in window was closed before a session was found.' }))

    timer = setInterval(() => void checkCookies(), 1500)
    void loginWindow.loadURL('https://www.patreon.com/login?ru=%2F')
  })
}

function isAllowedPatreonLoginUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' && (url.hostname === 'patreon.com' || url.hostname === 'www.patreon.com')
  } catch {
    return false
  }
}

function openExternalUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      void shell.openExternal(rawUrl)
    }
  } catch {
    // Ignore malformed popup/navigation targets.
  }
}

function isPreferenceKey(key: unknown): key is keyof AppPreferences {
  return (
    key === 'hasCompletedOnboarding' ||
    key === 'openLibraryOnLaunch' ||
    key === 'libraryView' ||
    key === 'reactionDownloadDirectory'
  )
}

function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const senderWindow = BrowserWindow.fromWebContents(event.sender)
  if (senderWindow && !senderWindow.isDestroyed()) {
    return senderWindow
  }

  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

async function selectVideo(parentWindow: BrowserWindow, title: string): Promise<MediaFile | null> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title,
    properties: ['openFile'],
    filters: [
      {
        name: 'Video files',
        extensions: ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi']
      },
      {
        name: 'All files',
        extensions: ['*']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  return {
    path: filePath,
    name: basename(filePath)
  }
}

async function selectSubtitle(parentWindow: BrowserWindow): Promise<MediaFile | null> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Select movie subtitle file',
    properties: ['openFile'],
    filters: [
      {
        name: 'Subtitle files',
        extensions: ['srt', 'vtt']
      },
      {
        name: 'All files',
        extensions: ['*']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  return {
    path: filePath,
    name: basename(filePath)
  }
}

function getMediaRequestFromUrl(rawUrl: string): { sessionId: string; role: MediaRole } | null {
  const url = new URL(rawUrl)
  const [sessionId, role] = url.pathname.split('/').filter(Boolean)
  return url.hostname === 'media' && sessionId && (role === 'reaction' || role === 'movie')
    ? { sessionId: decodeURIComponent(sessionId), role }
    : null
}

function getMediaPath(session: LibrarySession | null, role: MediaRole): string | null {
  if (!session) {
    return null
  }

  return role === 'reaction' ? session.reactionPath : session.moviePath
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function migrateLegacyUserData(userDataPath: string): void {
  const legacyUserDataPath = join(app.getPath('appData'), LEGACY_APP_NAME)
  if (legacyUserDataPath === userDataPath) {
    return
  }

  for (const fileName of ['library.json', 'session.json']) {
    const nextPath = join(userDataPath, fileName)
    const legacyPath = join(legacyUserDataPath, fileName)
    if (!existsSync(nextPath) && existsSync(legacyPath)) {
      mkdirSync(userDataPath, { recursive: true })
      copyFileSync(legacyPath, nextPath)
    }
  }
}

app.setName(APP_NAME)

void app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  migrateLegacyUserData(userDataPath)
  sessionStore = new SessionStore(join(userDataPath, 'library.json'), join(userDataPath, 'session.json'))
  preferencesStore = new PreferencesStore(join(userDataPath, 'preferences.json'))
  toolResolver = new ToolResolver()
  patreonVault = new PatreonSessionVault(join(userDataPath, 'patreon-session.bin'))
  downloadManager = new DownloadManager(
    toolResolver,
    patreonVault,
    (event) => {
      sendToRendererWindows(`${IPC_PREFIX}:download-progress`, event)
    },
    () => preferencesStore.read().reactionDownloadDirectory
  )
  registerMediaProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
