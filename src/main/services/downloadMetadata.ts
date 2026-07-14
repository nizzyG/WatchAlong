import type { DownloadedReactionMetadata } from '@shared/types'

export function compactMetadata<T extends DownloadedReactionMetadata & { channelUrl?: string }>(
  metadata: T
): T {
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([, value]) => typeof value === 'string' && value.trim().length > 0
    )
  ) as T
}

export function cleanMetadataValue(value: string | null | undefined): string | undefined {
  const clean = value?.replace(/\s+/g, ' ').trim()
  return clean && !/^(?:NA|null|none|unknown)$/i.test(clean) ? clean : undefined
}

export function cleanMediaFilename(value: string): string | undefined {
  return cleanMetadataValue(value.replace(/\s*\[[\w-]{6,}\]\s*$/, ''))
}
