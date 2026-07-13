import { ipcMain } from 'electron'
import type { MovieWindowCloseOptions, MovieWindowOpenRequest, RemoteMediaCommand, RemoteMediaCommandResult, RemoteMediaEvent } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { WindowManager } from '../WindowManager'

export function registerMovieWindowIpc({ windowManager }: { windowManager: WindowManager }): void {
  ipcMain.handle(`${IPC_PREFIX}:open-movie-window`, (_event, request: MovieWindowOpenRequest) => windowManager.openMovieWindow(request))
  ipcMain.handle(`${IPC_PREFIX}:close-movie-window`, (_event, options?: MovieWindowCloseOptions) => windowManager.closeMovieWindow(options))
  ipcMain.handle(`${IPC_PREFIX}:request-movie-window-pop-in`, () => windowManager.sendMovieWindowPopInRequest())
  ipcMain.handle(`${IPC_PREFIX}:get-movie-window-init`, () => windowManager.getMovieWindowInit())
  ipcMain.handle(`${IPC_PREFIX}:movie-window-ready`, () => windowManager.markMovieWindowReady())
  ipcMain.handle(`${IPC_PREFIX}:movie-media-command`, (_event, command: RemoteMediaCommand) => windowManager.sendMovieMediaCommand(command))
  ipcMain.handle(`${IPC_PREFIX}:movie-media-command-result`, (_event, result: RemoteMediaCommandResult) => windowManager.handleMovieMediaCommandResult(result))
  ipcMain.handle(`${IPC_PREFIX}:movie-media-event`, (_event, event: RemoteMediaEvent) => windowManager.handleMovieMediaEvent(event))
}
