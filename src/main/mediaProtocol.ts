import { protocol } from 'electron'
import { existsSync } from 'node:fs'
import type { MediaRole } from '@shared/types'
import { APP_NAME, MEDIA_SCHEME } from './constants'
import { createMediaResponse } from './mediaRange'
import { SessionStore } from './sessionStore'
import { getMediaPath } from './ipc/utils'

export function registerMediaProtocol(sessionStore: SessionStore): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const mediaRequest = parseMediaRequest(request.url)
    if (!mediaRequest) return new Response(`Invalid ${APP_NAME} media URL`, { status: 404 })
    const path = getMediaPath(sessionStore.getSession(mediaRequest.sessionId), mediaRequest.role)
    if (!path || !existsSync(path)) return new Response('Media file is missing', { status: 404 })
    try { return createMediaResponse(path, request.headers.get('range')) }
    catch (error) { console.error(error); return new Response('Could not read media file', { status: 500 }) }
  })
}

function parseMediaRequest(rawUrl: string): { sessionId: string; role: MediaRole } | null {
  const url = new URL(rawUrl)
  const [sessionId, role] = url.pathname.split('/').filter(Boolean)
  return url.hostname === 'media' && sessionId && (role === 'reaction' || role === 'movie')
    ? { sessionId: decodeURIComponent(sessionId), role }
    : null
}
