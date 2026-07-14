import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession } from '@shared/types'
import { ReactorAvatar } from './ReactorAvatar'

describe('ReactorAvatar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('immediately replaces a broken image with the fallback', () => {
    const { container } = render(<ReactorAvatar session={session()} label="Addie Counts" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.reactor-avatar-fallback')).toHaveTextContent('AC')
  })

  it('retries the image after the first delay', () => {
    const value = session()
    const { container } = render(<ReactorAvatar session={value} label="Addie Counts" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    act(() => vi.advanceTimersByTime(1_499))
    expect(container.querySelector('img')).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(container.querySelector('img')).toHaveAttribute('src', avatarUrl(value, 1))
  })

  it('clears a pending retry so a changed session can start its own retry cycle', () => {
    const first = session()
    const second = session({
      id: 'second-reactor',
      updatedAt: '2026-07-14T13:00:00.000Z'
    })
    const { container, rerender } = render(<ReactorAvatar session={first} label="Addie Counts" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(vi.getTimerCount()).toBe(1)

    rerender(<ReactorAvatar session={second} label="Second Reactor" />)
    expect(vi.getTimerCount()).toBe(0)
    expect(container.querySelector('img')).toHaveAttribute('src', avatarUrl(second, 0))

    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(1_500))
    expect(container.querySelector('img')).toHaveAttribute('src', avatarUrl(second, 1))
  })
})

function session(patch: Partial<LibrarySession> = {}): LibrarySession {
  return {
    ...createDefaultSession(new Date('2026-07-14T12:00:00.000Z'), {
      id: 'addie-counts',
      title: 'Tombstone — Addie Counts',
      reactionPath: 'C:\\Reactions\\addie-counts.mp4'
    }),
    ...patch
  }
}

function avatarUrl(value: LibrarySession, attempt: number): string {
  return `watchalong://media/${encodeURIComponent(value.id)}/reactor-avatar?v=${encodeURIComponent(value.updatedAt)}-${attempt}`
}
