import { protocol } from 'electron'
import { createReadStream, realpathSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { APP_NAME, RENDERER_SCHEME } from './constants'
import {
  isPathInside,
  parseRendererAssetRequest,
  resolveRendererAssetPath
} from './rendererProtocolPolicy'

const RENDERER_CSP = "default-src 'self'; media-src 'self' watchalong: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: watchalong:;"

export function registerRendererProtocol(rendererRoot: string): void {
  protocol.handle(RENDERER_SCHEME, (request) => {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET' }
      })
    }

    const assetRequest = parseRendererAssetRequest(request.url)
    const candidatePath = assetRequest
      ? resolveRendererAssetPath(rendererRoot, assetRequest.relativePath)
      : null
    if (!assetRequest || !candidatePath) {
      return notFoundResponse()
    }

    try {
      const realRoot = realpathSync(rendererRoot)
      const realAssetPath = realpathSync(candidatePath)
      if (!isPathInside(realRoot, realAssetPath) || !statSync(realAssetPath).isFile()) {
        return notFoundResponse()
      }

      return createAssetResponse(realAssetPath, assetRequest.relativePath === 'index.html')
    } catch {
      return notFoundResponse()
    }
  })
}

function createAssetResponse(filePath: string, isEntryDocument: boolean): Response {
  const fileSize = statSync(filePath).size
  const headers: Record<string, string> = {
    'Cache-Control': isEntryDocument ? 'no-store' : 'public, max-age=31536000, immutable',
    'Content-Length': String(fileSize),
    'Content-Type': getRendererContentType(filePath),
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  }
  if (isEntryDocument) {
    headers['Content-Security-Policy'] = RENDERER_CSP
  }

  return new Response(Readable.toWeb(createReadStream(filePath)) as unknown as BodyInit, {
    status: 200,
    headers
  })
}

function notFoundResponse(): Response {
  return new Response(`Invalid ${APP_NAME} renderer URL`, {
    status: 404,
    headers: { 'X-Content-Type-Options': 'nosniff' }
  })
}

function getRendererContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.json':
    case '.map': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.avif': return 'image/avif'
    case '.ico': return 'image/x-icon'
    case '.woff': return 'font/woff'
    case '.woff2': return 'font/woff2'
    case '.ttf': return 'font/ttf'
    case '.otf': return 'font/otf'
    case '.wasm': return 'application/wasm'
    default: return 'application/octet-stream'
  }
}
