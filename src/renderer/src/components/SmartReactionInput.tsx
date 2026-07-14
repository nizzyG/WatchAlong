import { CirclePlay, FileVideo, Heart } from 'lucide-react'
import { useState } from 'react'
import { PatreonPanel } from './smart-reaction-input/PatreonPanel'
import { PatreonStorageOffer } from './smart-reaction-input/PatreonStorageOffer'
import { ReactionCard } from './smart-reaction-input/ReactionCard'
import { ReactionDownloadStatus } from './smart-reaction-input/ReactionDownloadStatus'
import { useReactionDownload } from './smart-reaction-input/useReactionDownload'

export type { DownloadedReactionMetadata } from './smart-reaction-input/types'
export { PatreonStorageOffer }
export { isValidPatreonPostUrl, isValidYouTubeUrl } from './smart-reaction-input/urlValidation'

import type { DownloadedReactionMetadata } from './smart-reaction-input/types'
import { YouTubePanel } from './smart-reaction-input/YouTubePanel'

type ActiveCard = 'local' | 'youtube' | 'patreon' | null

interface SmartReactionInputProps {
  movieReady: boolean
  onSelectLocal(): Promise<void>
  onDownloaded(filePath: string, metadata: DownloadedReactionMetadata): void | Promise<void>
}

export function SmartReactionInput({
  movieReady,
  onSelectLocal,
  onDownloaded
}: SmartReactionInputProps): JSX.Element {
  const [activeCard, setActiveCard] = useState<ActiveCard>(null)
  const controller = useReactionDownload({ onSelectLocal, onDownloaded })

  return (
    <section className="smart-input" aria-label="Add Reaction Video">
      <div className="smart-input-header">
        <h2>Add Reaction Video</h2>
        <p>{movieReady ? 'Choose the full-length reaction to sync with your movie.' : 'Load your movie first, then add a reaction.'}</p>
      </div>

      <div className="reaction-cards">
        <ReactionCard
          active={activeCard === 'local'}
          subdued={activeCard !== null && activeCard !== 'local'}
          disabled={controller.interactionBusy}
          icon={<FileVideo size={30} aria-hidden />}
          title="Local file"
          description="I already downloaded the reaction video. MP4 and WebM work best."
          onClick={() => {
            setActiveCard('local')
            void controller.selectLocalReaction()
          }}
        />

        <ReactionCard
          active={activeCard === 'youtube'}
          subdued={activeCard !== null && activeCard !== 'youtube'}
          disabled={controller.interactionBusy}
          icon={<CirclePlay size={31} aria-hidden />}
          title="YouTube link"
          description="The reactor shared an unlisted YouTube link."
          onClick={() => setActiveCard('youtube')}
        >
          <YouTubePanel controller={controller} />
        </ReactionCard>

        <ReactionCard
          active={activeCard === 'patreon'}
          subdued={activeCard !== null && activeCard !== 'patreon'}
          disabled={controller.interactionBusy}
          icon={<Heart size={31} aria-hidden />}
          title="Patreon post"
          description="The full-length watchalong is on their Patreon page."
          onClick={() => setActiveCard('patreon')}
        >
          <PatreonPanel controller={controller} />
        </ReactionCard>
      </div>

      {controller.error && <p className="fallback-reason smart-input-error" role="alert">{controller.error}</p>}
      <ReactionDownloadStatus controller={controller} />
    </section>
  )
}
