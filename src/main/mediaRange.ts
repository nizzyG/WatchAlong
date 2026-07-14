import { closeSync, constants, createReadStream, fstatSync, openSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

export interface ByteRange {
  start: number
  end: number
}

export function createMediaResponse(
  filePath: string,
  rangeHeader: string | null,
  maxBytes?: number
): Response {
  const descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NONBLOCK)
  let streamOwnsDescriptor = false
  try {
    const fileStat = fstatSync(descriptor)
    if (!fileStat.isFile()) {
      throw new Error('Media path is not a regular file.')
    }
    const fileSize = fileStat.size
    const contentType = getContentType(filePath)
    const baseHeaders = {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff'
    }

    if (maxBytes !== undefined && fileSize > maxBytes) {
      return new Response('Media file is too large', { status: 413, headers: baseHeaders })
    }

    if (rangeHeader) {
      const range = parseRange(rangeHeader, fileSize)
      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes */${fileSize}`
          }
        })
      }

      const { start, end } = range
      const chunkSize = end - start + 1
      const stream = createReadStream(filePath, { fd: descriptor, autoClose: true, start, end })
      streamOwnsDescriptor = true
      return new Response(nodeStreamToBody(stream), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`
        }
      })
    }

    const stream = createReadStream(filePath, { fd: descriptor, autoClose: true })
    streamOwnsDescriptor = true
    return new Response(nodeStreamToBody(stream), {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(fileSize)
      }
    })
  } finally {
    if (!streamOwnsDescriptor) {
      try { closeSync(descriptor) } catch { /* response creation already failed */ }
    }
  }
}

export function parseRange(rangeHeader: string, fileSize: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
  if (!match || fileSize <= 0) {
    return null
  }

  const [, startPart, endPart] = match
  if (!startPart && !endPart) {
    return null
  }

  if (!startPart) {
    const suffix = parseRangeInteger(endPart)
    if (suffix === null || suffix <= 0) {
      return null
    }

    return {
      start: Math.max(0, fileSize - suffix),
      end: fileSize - 1
    }
  }

  const start = parseRangeInteger(startPart)
  const requestedEnd = endPart ? parseRangeInteger(endPart) : fileSize - 1
  if (start === null || requestedEnd === null) {
    return null
  }

  const end = Math.min(requestedEnd, fileSize - 1)
  if (start > end) {
    return null
  }

  return { start, end }
}

function parseRangeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function nodeStreamToBody(stream: Readable): BodyInit {
  return Readable.toWeb(stream) as unknown as BodyInit
}

export function getContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    case '.ogv':
    case '.ogg':
      return 'video/ogg'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}
