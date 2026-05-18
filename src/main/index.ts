import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { SessionStore } from './sessionStore'
import type { LibrarySession, MediaFile, MediaRole, OpenVideosResult } from '@shared/types'

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
let sessionStore: SessionStore

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

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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

  ipcMain.handle(`${IPC_PREFIX}:save-active-session`, (_event, patch: Partial<LibrarySession>) => {
    return sessionStore.updateActive(patch)
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

  ipcMain.handle(`${IPC_PREFIX}:open-videos`, async (): Promise<OpenVideosResult | null> => {
    if (!mainWindow) {
      return null
    }

    const reaction = await selectVideo('Select the reaction watchalong video')
    if (!reaction) {
      return null
    }

    const movie = await selectVideo('Select the movie video')
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

  ipcMain.handle(`${IPC_PREFIX}:open-subtitle`, async () => {
    if (!mainWindow || !sessionStore.getActiveSession()) {
      return null
    }

    const subtitle = await selectSubtitle()
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
}

async function selectVideo(title: string): Promise<MediaFile | null> {
  const result = await dialog.showOpenDialog(mainWindow!, {
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

async function selectSubtitle(): Promise<MediaFile | null> {
  const result = await dialog.showOpenDialog(mainWindow!, {
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
