import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import {
  detectBrowsers,
  DownloadManager,
  extractPatreonSession,
  findPatreonSessionCookieValue,
  getDefaultReactionDownloadDirectory,
  PatreonSessionVault,
  ToolResolver
} from './mediaServices'
import { PreferencesStore } from './preferencesStore'
import { SessionStore } from './sessionStore'
import type {
  BrowserName,
  AppPreferences,
  LibrarySession,
  MediaFile,
  MediaRole,
  OpenVideosResult,
  ReactionDownloadRequest,
  ReactionSource,
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
let wizardCloseOutcome: WizardOutcome | null = null
let recenterWizardOnParent: (() => void) | null = null
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

  void loadRenderer(mainWindow)
}

function openOnboardingWizard(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.focus()
    return
  }

  wizardCloseOutcome = null
  sendWizardLifecycle({ type: 'opened' })

  wizardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
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

async function loadRenderer(targetWindow: BrowserWindow, view?: 'wizard'): Promise<void> {
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

  ipcMain.handle(`${IPC_PREFIX}:forget-patreon-session`, () => patreonVault.forget())

  ipcMain.handle(`${IPC_PREFIX}:start-reaction-download`, (_event, request: ReactionDownloadRequest) => {
    return downloadManager.start(request)
  })

  ipcMain.handle(`${IPC_PREFIX}:cancel-download`, (_event, jobId: string) => {
    downloadManager.cancel(jobId)
  })

  ipcMain.handle(`${IPC_PREFIX}:open-onboarding-wizard`, () => {
    openOnboardingWizard()
  })

  ipcMain.handle(`${IPC_PREFIX}:open-import-wizard`, () => {
    openOnboardingWizard()
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
        sandbox: false
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
      if (isPatreonUrl(url)) {
        void loginWindow.loadURL(url)
        return { action: 'deny' }
      }
      return { action: 'allow' }
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

function isPatreonUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' && (url.hostname === 'patreon.com' || url.hostname.endsWith('.patreon.com'))
  } catch {
    return false
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

function createMediaResponse(filePath: string, rangeHeader: string | null): Response {
  const fileStat = statSync(filePath)
  const fileSize = fileStat.size
  const contentType = getContentType(filePath)
  const baseHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize)
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${fileSize}`
        }
      })
    }

    const { start, end } = range
    const chunkSize = end - start + 1
    return new Response(nodeStreamToBody(createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`
      }
    })
  }

  return new Response(nodeStreamToBody(createReadStream(filePath)), {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(fileSize)
    }
  })
}

function parseRange(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
  if (!match) {
    return null
  }

  let start = match[1] ? Number.parseInt(match[1], 10) : 0
  let end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) {
    return null
  }

  end = Math.min(end, fileSize - 1)
  if (start > end) {
    return null
  }

  return { start, end }
}

function nodeStreamToBody(stream: Readable): BodyInit {
  return Readable.toWeb(stream) as unknown as BodyInit
}

function getContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.ogv':
    case '.ogg':
      return 'video/ogg'
    default:
      return 'application/octet-stream'
  }
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
