import { useEffect, useState } from 'react'
import type { LibrarySession } from '@shared/types'

export function MoviePoster({
  session,
  title,
  size = 'card'
}: {
  session: LibrarySession
  title: string
  size?: 'card' | 'group'
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [session.id, session.moviePosterPath, session.updatedAt])

  const imageUrl = `watchalong://media/${encodeURIComponent(session.id)}/movie-poster?v=${encodeURIComponent(session.updatedAt)}`

  return (
    <span className={`movie-poster movie-poster-${size}`} aria-hidden>
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
  )
}
