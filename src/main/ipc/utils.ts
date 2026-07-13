import { BrowserWindow, dialog } from 'electron'
import { basename } from 'node:path'
import type { LibrarySession, MediaFile, MediaRole } from '@shared/types'

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
      { name: 'Subtitle files', extensions: ['srt', 'vtt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  return { path: filePath, name: basename(filePath) }
}

export function getMediaPath(session: LibrarySession | null, role: MediaRole): string | null {
  if (!session) return null
  return role === 'reaction' ? session.reactionPath : session.moviePath
}
