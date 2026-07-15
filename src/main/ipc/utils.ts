import { BrowserWindow, dialog } from 'electron'
import { basename } from 'node:path'
import type { LibrarySession, MediaFile, MediaRole } from '@shared/types'
import {
  MAX_MOVIE_POSTER_BYTES,
  validateMoviePosterPath,
  type MoviePosterPathRejectionReason
} from '../services/moviePosterFiles'
import { isSupportedSubtitleFile } from '../services/subtitleFiles'

export type MoviePosterPickerResult =
  | { status: 'cancelled' }
  | { status: 'selected'; file: MediaFile }
  | { status: 'rejected'; reason: MoviePosterPathRejectionReason; message: string }

export function getSenderWindow(
  event: Electron.IpcMainInvokeEvent,
  mainWindowGetter: () => BrowserWindow | null
): BrowserWindow | null {
  const senderWindow = BrowserWindow.fromWebContents(event.sender)
  return senderWindow && !senderWindow.isDestroyed() ? senderWindow : mainWindowGetter()
}

export async function selectVideo(parentWindow: BrowserWindow, title: string): Promise<MediaFile | null> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title,
    properties: ['openFile'],
    filters: [
      { name: 'Video files', extensions: ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  return { path: filePath, name: basename(filePath) }
}

export async function selectSubtitle(parentWindow: BrowserWindow): Promise<MediaFile | null> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Select movie subtitle file',
    properties: ['openFile'],
    filters: [
      { name: 'Subtitle files', extensions: ['srt', 'vtt'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  return isSupportedSubtitleFile(filePath) ? { path: filePath, name: basename(filePath) } : null
}

export async function selectMoviePoster(parentWindow: BrowserWindow): Promise<MoviePosterPickerResult> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Choose a movie poster',
    properties: ['openFile'],
    filters: [
      { name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' }

  const validation = validateMoviePosterPath(result.filePaths[0])
  if (!validation.ok) {
    return {
      status: 'rejected',
      reason: validation.reason,
      message: moviePosterRejectionMessage(validation.reason)
    }
  }

  return {
    status: 'selected',
    file: { path: validation.path, name: basename(validation.path) }
  }
}

function moviePosterRejectionMessage(reason: MoviePosterPathRejectionReason): string {
  switch (reason) {
    case 'unsupported-format':
      return 'Choose a JPG, JPEG, PNG, or WebP poster image.'
    case 'too-large':
      return `That poster is larger than ${MAX_MOVIE_POSTER_BYTES / (1024 * 1024)} MB. Choose a smaller image.`
    case 'not-file':
      return 'The selected poster is not a file. Choose a JPG, JPEG, PNG, or WebP image.'
    default:
      return 'WatchAlong could not read that poster file. Make sure its drive is connected and try again.'
  }
}

export function getMediaPath(session: LibrarySession | null, role: MediaRole): string | null {
  if (!session) return null
  return role === 'reaction' ? session.reactionPath : session.moviePath
}
