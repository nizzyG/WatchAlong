import { FileVideo, Heart, Youtube } from 'lucide-react'
import type { ReactionSource } from '@shared/types'

export function ReactionSourceIcon({ source }: { source: ReactionSource }): JSX.Element {
  if (source === 'youtube') {
    return <Youtube size={14} aria-hidden />
  }

  if (source === 'patreon') {
    return <Heart size={14} aria-hidden />
  }

  return <FileVideo size={14} aria-hidden />
}

export function reactionSourceLabel(source: ReactionSource): string {
  if (source === 'youtube') {
    return 'YouTube'
  }

  if (source === 'patreon') {
    return 'Patreon'
  }

  return 'Local file'
}

