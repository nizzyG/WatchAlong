import { ipcMain } from 'electron'
import { IPC_PREFIX } from '../constants'
import { detectMovieFrameRate, ToolResolver } from '../services/toolResolution'

export function registerToolsIpc({ toolResolver }: { toolResolver: ToolResolver }): void {
  ipcMain.handle(`${IPC_PREFIX}:check-tools`, () => toolResolver.checkTools())
  ipcMain.handle(`${IPC_PREFIX}:detect-movie-frame-rate`, (_event, path: unknown) => typeof path === 'string' ? detectMovieFrameRate(path, toolResolver) : null)
}
