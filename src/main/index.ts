import { app, BrowserWindow, protocol } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { APP_NAME, IPC_PREFIX, LEGACY_APP_NAME, MEDIA_SCHEME } from './constants'
import { registerDownloadIpc } from './ipc/downloadIpc'
import { registerAutoSyncIpc } from './ipc/autoSyncIpc'
import { registerMovieWindowIpc } from './ipc/movieWindowIpc'
import { registerPatreonIpc } from './ipc/patreonIpc'
import { registerPreferencesIpc } from './ipc/preferencesIpc'
import { registerSessionIpc } from './ipc/sessionIpc'
import { registerToolsIpc } from './ipc/toolsIpc'
import { registerWindowIpc } from './ipc/windowIpc'
import { registerMediaProtocol } from './mediaProtocol'
import { PreferencesStore } from './preferencesStore'
import { SessionStore } from './sessionStore'
import { DownloadManager } from './services/downloadManager'
import { PatreonSessionVault } from './services/patreonSessionVault'
import { ToolResolver } from './services/toolResolution'
import { AutoSyncService } from './services/autosync/AutoSyncService'
import { FfmpegAutoSyncBackend } from './services/autosync/ffmpegBackend'
import { WindowManager } from './WindowManager'

protocol.registerSchemesAsPrivileged([{
  scheme: MEDIA_SCHEME,
  privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
}])

app.setName(APP_NAME)

void app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  migrateLegacyUserData(userDataPath)

  const sessionStore = new SessionStore(join(userDataPath, 'library.json'), join(userDataPath, 'session.json'))
  const preferencesStore = new PreferencesStore(join(userDataPath, 'preferences.json'))
  const toolResolver = new ToolResolver()
  const patreonVault = new PatreonSessionVault(join(userDataPath, 'patreon-session.bin'))
  const windowManager = new WindowManager(sessionStore)
  const downloadManager = new DownloadManager(
    toolResolver,
    patreonVault,
    (event) => windowManager.sendToRendererWindows(`${IPC_PREFIX}:download-progress`, event),
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

  registerMediaProtocol(sessionStore)
  registerSessionIpc({ sessionStore, mainWindowGetter })
  registerPreferencesIpc({ preferencesStore, mainWindowGetter })
  registerDownloadIpc({ downloadManager })
  registerAutoSyncIpc({ autoSyncService })
  registerMovieWindowIpc({ windowManager })
  registerPatreonIpc({ toolResolver, patreonVault, mainWindowGetter })
  registerToolsIpc({ toolResolver })
  registerWindowIpc({ windowManager })

  windowManager.createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowManager.createMainWindow()
  })
})

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
