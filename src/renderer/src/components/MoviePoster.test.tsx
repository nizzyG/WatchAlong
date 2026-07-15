import { fireEvent, render } from '@testing-library/react'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession } from '@shared/types'
import { MoviePoster } from './MoviePoster'

describe('MoviePoster', () => {
  it('renders a single image when ambient artwork is enabled', () => {
    const { container } = render(<MoviePoster session={session()} title="Tombstone" ambient />)

    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('.movie-poster-ambient')).toBeInTheDocument()
  })

  it('keeps the title fallback and removes a broken image', () => {
    const { container } = render(<MoviePoster session={session()} title="Tombstone" />)
    const image = container.querySelector('img')

    expect(image).not.toBeNull()
    fireEvent.error(image as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.movie-poster-title')).toHaveTextContent('Tombstone')
  })

  it('recovers after the selected poster or session revision changes', () => {
    const original = session()
    const { container, rerender } = render(<MoviePoster session={original} title="Tombstone" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()

    const changedPoster = {
      ...original,
      moviePosterPath: 'C:\\Art\\tombstone-custom.jpg'
    }
    rerender(<MoviePoster session={changedPoster} title="Tombstone" />)
    expect(container.querySelector('img')).toHaveAttribute('src', posterUrl(changedPoster))

    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()

    const changedRevision = {
      ...changedPoster,
      updatedAt: '2026-07-14T13:30:00.000Z'
    }
    rerender(<MoviePoster session={changedRevision} title="Tombstone" />)
    expect(container.querySelector('img')).toHaveAttribute('src', posterUrl(changedRevision))
  })
})

function session(): LibrarySession {
  return createDefaultSession(new Date('2026-07-14T12:00:00.000Z'), {
    id: 'tombstone',
    title: 'Tombstone',
    moviePath: 'C:\\Movies\\Tombstone.mkv'
  })
}

function posterUrl(value: LibrarySession): string {
  return `watchalong://media/${encodeURIComponent(value.id)}/movie-poster?v=${encodeURIComponent(value.updatedAt)}`
}
