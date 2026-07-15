import { app, BrowserWindow, protocol } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  APP_NAME,
  IPC_PREFIX,
  LEGACY_APP_NAME,
  MEDIA_SCHEME,
  RENDERER_SCHEME
} from './constants'
import { registerDownloadIpc } from './ipc/downloadIpc'
import { registerAutoSyncIpc } from './ipc/autoSyncIpc'
import { registerMovieWindowIpc } from './ipc/movieWindowIpc'
import { registerMediaKeyIpc } from './ipc/mediaKeyIpc'
import { registerPatreonIpc } from './ipc/patreonIpc'
import { registerPreferencesIpc } from './ipc/preferencesIpc'
import { registerSessionIpc } from './ipc/sessionIpc'
import { registerToolsIpc } from './ipc/toolsIpc'
import { registerWindowIpc } from './ipc/windowIpc'
import { registerMediaProtocol } from './mediaProtocol'
import { registerRendererProtocol } from './rendererProtocol'
import { trustedDevelopmentRendererUrl } from './rendererProtocolPolicy'
import { PreferencesStore } from './preferencesStore'
import { SessionStore } from './sessionStore'
import { DownloadManager } from './services/downloadManager'
import { MediaPathGrantStore, secureDownloadedMediaEvent } from './services/mediaPathGrants'
import { cleanupStalePatreonTempDirectories } from './services/patreonDownload'
import { PatreonSessionVault } from './services/patreonSessionVault'
import { ToolResolver } from './services/toolResolution'
import { AutoSyncService } from './services/autosync/AutoSyncService'
import { FfmpegAutoSyncBackend } from './services/autosync/ffmpegBackend'
import { WindowManager } from './WindowManager'
import { MediaKeyController } from './mediaKeyController'

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: RENDERER_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }
])

app.setName(APP_NAME)

let primaryWindowManager: WindowManager | null = null
const ownsSingleInstance = app.requestSingleInstanceLock()

if (!ownsSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => primaryWindowManager?.focusMainWindow())
  void app.whenReady().then(() => {
    const userDataPath = app.getPath('userData')
    migrateLegacyUserData(userDataPath)

    const sessionStore = new SessionStore(join(userDataPath, 'library.json'), join(userDataPath, 'session.json'))
    const mediaPathGrants = new MediaPathGrantStore(() =>
      sessionStore.read().sessions.flatMap((session) => [session.reactionPath, session.moviePath]))
    const preferencesStore = new PreferencesStore(join(userDataPath, 'preferences.json'))
    const toolResolver = new ToolResolver()
    const patreonVault = new PatreonSessionVault(join(userDataPath, 'patreon-session.bin'))
    cleanupStalePatreonTempDirectories()
    const developmentRendererUrl = trustedDevelopmentRendererUrl(
      app.isPackaged,
      process.env.ELECTRON_RENDERER_URL
    )
    const windowManager = new WindowManager(sessionStore, developmentRendererUrl)
    primaryWindowManager = windowManager
    const downloadManager = new DownloadManager(
      toolResolver,
      patreonVault,
      (event) => {
        windowManager.sendToRendererWindows(
          `${IPC_PREFIX}:download-progress`,
          secureDownloadedMediaEvent(event, mediaPathGrants)
        )
      },
      () => preferencesStore.read().reactionDownloadDirectory
    )
    const ffmpegPath = toolResolver.getFfmpegPath()
    const ffprobePath = toolResolver.getFfprobePath()
    const autoSyncService = ffmpegPath && ffprobePath
      ? new AutoSyncService({
          sessions: sessionStore,
          backend: new FfmpegAutoSyncBackend(ffmpegPath, ffprobePath),
          emitProgress: (event) => windowManager.sendToRendererWindows(`${IPC_PREFIX}:auto-sync-progress`, event),
          emitComplete: (event) => windowManager.sendToRendererWindows(`${IPC_PREFIX}:auto-sync-complete`, event)
        })
      : null
    const mainWindowGetter = () => windowManager.getMainWindow()
    const mediaKeys = new MediaKeyController(mainWindowGetter)

    registerMediaProtocol(sessionStore)
    if (!developmentRendererUrl) {
      registerRendererProtocol(join(__dirname, '../renderer'))
    }
    registerSessionIpc({ sessionStore, mediaPathGrants, mainWindowGetter })
    registerPreferencesIpc({ preferencesStore, mainWindowGetter })
    registerDownloadIpc({ downloadManager })
    registerAutoSyncIpc({ autoSyncService })
    registerMovieWindowIpc({ windowManager })
    registerMediaKeyIpc({ mediaKeys })
    const patreonIpcLifecycle = registerPatreonIpc({ toolResolver, patreonVault, downloadManager, mainWindowGetter })
    registerToolsIpc({ toolResolver, sessionStore })
    registerWindowIpc({ windowManager })

    app.on('before-quit', () => {
      downloadManager.dispose()
      void patreonIpcLifecycle.dispose()
    })
    app.on('will-quit', () => mediaKeys.dispose())

    windowManager.createMainWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windowManager.createMainWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function migrateLegacyUserData(userDataPath: string): void {
  const legacyUserDataPath = join(app.getPath('appData'), LEGACY_APP_NAME)
  if (legacyUserDataPath === userDataPath) return

  for (const fileName of ['library.json', 'session.json']) {
    const nextPath = join(userDataPath, fileName)
    const legacyPath = join(legacyUserDataPath, fileName)
    if (!existsSync(nextPath) && existsSync(legacyPath)) {
      mkdirSync(userDataPath, { recursive: true })
      copyFileSync(legacyPath, nextPath)
    }
  }
}
