import { join } from 'node:path'

export const APP_NAME = 'WatchAlong'
export const LEGACY_APP_NAME = 'WatchSync'
export const MEDIA_SCHEME = 'watchalong'
export const RENDERER_SCHEME = 'watchalong-app'
export const RENDERER_HOST = 'renderer'
export const IPC_PREFIX = 'watchalong'
export const MAIN_WINDOW_CLOSE_TIMEOUT_MS = 1000

/**
 * Whether the app is running from a packaged build (app.asar) vs dev.
 * Avoids importing `app` from electron at module scope so partial electron
 * mocks in window-construction tests don't trip Vitest's missing-export
 * proxy. The classic app.asar-in-__dirname heuristic is reliable for
 * electron-builder packaged apps.
 */
function isPackaged(): boolean {
  return __dirname.includes('app.asar')
}

/**
 * Absolute path to the monogram PNG used for BrowserWindow/taskbar icons.
 *
 * In dev the source lives at <project>/assets/icons/icon.png, four levels
 * above out/main/index.js. In a packaged build the PNG ships as an
 * extraResource under resources/icons/, which maps to process.resourcesPath.
 */
export function appIconPath(): string {
  if (isPackaged() && process.resourcesPath) {
    return join(process.resourcesPath, 'icons', 'icon.png')
  }
  return join(__dirname, '..', '..', 'assets', 'icons', 'icon.png')
}
