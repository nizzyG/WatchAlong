import { useEffect, useState } from 'react'
import type { LibrarySession } from '@shared/types'

export function MoviePoster({
  session,
  title,
  size = 'card',
  ambient = false
}: {
  session: LibrarySession
  title: string
  size?: 'card' | 'group'
  ambient?: boolean
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [session.id, session.moviePosterPath, session.updatedAt])

  const imageUrl = `watchalong://media/${encodeURIComponent(session.id)}/movie-poster?v=${encodeURIComponent(session.updatedAt)}`

  return (
    <span className={`movie-poster movie-poster-${size} ${ambient ? 'movie-poster-with-ambient' : ''}`} aria-hidden>
      {ambient && <span className="movie-poster-ambient" />}
      <span className="movie-poster-frame">
        <span className="movie-poster-fallback">
          <strong className="movie-poster-title">{title}</strong>
        </span>
        {!imageFailed && (
          <img
            alt=""
            draggable={false}
            loading="lazy"
            src={imageUrl}
            onError={() => setImageFailed(true)}
          />
        )}
      </span>
    </span>
  )
}
