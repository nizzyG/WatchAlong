import type {
  DownloadedReactionMetadata as ReactionMetadata,
  ReactionDownloadSource
} from '@shared/types'

export interface DownloadedReactionMetadata extends ReactionMetadata {
  jobId: string
  source: ReactionDownloadSource
}
