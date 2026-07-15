import type {
  MovieMediaCommandRequest,
  MovieWindowCloseOptions,
  MovieWindowOpenRequest
} from '@shared/types'
import { IPC_PREFIX } from '../constants'
import type { WindowManager } from '../WindowManager'
import { handleTrustedIpc } from './security'

export function registerMovieWindowIpc({ windowManager }: { windowManager: WindowManager }): void {
  handleTrustedIpc(`${IPC_PREFIX}:open-movie-window`, ['main'], (_event, request: MovieWindowOpenRequest) => windowManager.openMovieWindow(request))
  handleTrustedIpc(`${IPC_PREFIX}:close-movie-window`, ['main'], (_event, options?: MovieWindowCloseOptions) => windowManager.closeMovieWindow(options))
  handleTrustedIpc(`${IPC_PREFIX}:request-movie-window-pop-in`, ['movie'], (event) => windowManager.requestMovieWindowPopIn(event.sender))
  handleTrustedIpc(`${IPC_PREFIX}:get-movie-window-init`, ['movie'], (event) => windowManager.getMovieWindowInit(event.sender))
  handleTrustedIpc(`${IPC_PREFIX}:movie-window-ready`, ['movie'], (event) => windowManager.markMovieWindowReady(event.sender))
  handleTrustedIpc(`${IPC_PREFIX}:movie-media-command`, ['main'], (_event, command: MovieMediaCommandRequest) => windowManager.sendMovieMediaCommand(command))
  handleTrustedIpc(`${IPC_PREFIX}:movie-media-command-result`, ['movie'], (event, result: unknown) => windowManager.handleMovieMediaCommandResult(event.sender, result))
  handleTrustedIpc(`${IPC_PREFIX}:movie-media-event`, ['movie'], (event, mediaEvent: unknown) => windowManager.handleMovieMediaEvent(event.sender, mediaEvent))
}
