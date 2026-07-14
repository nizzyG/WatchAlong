import type {
  MovieMediaCommandRequest,
  MovieWindowCloseOptions,
  MovieWindowOpenRequest,
  RemoteMediaCommandResult,
  RemoteMediaEvent
} from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { WindowManager } from '../WindowManager'
import { handleTrustedIpc } from './security'

export function registerMovieWindowIpc({ windowManager }: { windowManager: WindowManager }): void {
  handleTrustedIpc(`${IPC_PREFIX}:open-movie-window`, ['main'], (_event, request: MovieWindowOpenRequest) => windowManager.openMovieWindow(request))
  handleTrustedIpc(`${IPC_PREFIX}:close-movie-window`, ['main'], (_event, options?: MovieWindowCloseOptions) => windowManager.closeMovieWindow(options))
  handleTrustedIpc(`${IPC_PREFIX}:request-movie-window-pop-in`, ['movie'], () => windowManager.sendMovieWindowPopInRequest())
  handleTrustedIpc(`${IPC_PREFIX}:get-movie-window-init`, ['movie'], () => windowManager.getMovieWindowInit())
  handleTrustedIpc(`${IPC_PREFIX}:movie-window-ready`, ['movie'], () => windowManager.markMovieWindowReady())
  handleTrustedIpc(`${IPC_PREFIX}:movie-media-command`, ['main'], (_event, command: MovieMediaCommandRequest) => windowManager.sendMovieMediaCommand(command))
  handleTrustedIpc(`${IPC_PREFIX}:movie-media-command-result`, ['movie'], (_event, result: RemoteMediaCommandResult) => windowManager.handleMovieMediaCommandResult(result))
  handleTrustedIpc(`${IPC_PREFIX}:movie-media-event`, ['movie'], (_event, event: RemoteMediaEvent) => windowManager.handleMovieMediaEvent(event))
}
