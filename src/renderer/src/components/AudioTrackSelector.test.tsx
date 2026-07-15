import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AudioTrackSelector } from './AudioTrackSelector'

const tracks = [
  { label: 'English (5.1)', language: 'eng', ordinal: 0, displayLabel: 'English (5.1)', enabled: true },
  { label: '', language: 'ind', ordinal: 1, displayLabel: 'ind', enabled: false },
  { label: '', language: '', ordinal: 2, displayLabel: 'Track 3', enabled: false }
]

describe('AudioTrackSelector', () => {
  it('stays out of the way when Chromium exposes fewer than two tracks', () => {
    const { rerender } = render(
      <AudioTrackSelector tracks={[]} selected={null} onSelect={vi.fn()} />
    )
    expect(screen.queryByLabelText(/Movie audio:/)).not.toBeInTheDocument()

    rerender(<AudioTrackSelector tracks={[tracks[0]]} selected={null} onSelect={vi.fn()} />)
    expect(screen.queryByLabelText(/Movie audio:/)).not.toBeInTheDocument()
  })

  it('uses container labels, then language names, then a numbered fallback', () => {
    render(<AudioTrackSelector tracks={tracks} selected={null} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Movie audio: English (5.1)'))

    expect(screen.getByRole('button', { name: /English \(5\.1\).*English/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Indonesian' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Track 3' })).toBeInTheDocument()
  })

  it('closes and requests the semantic preference with one option click', () => {
    const onSelect = vi.fn(async () => true)
    const { container } = render(
      <AudioTrackSelector tracks={tracks} selected={null} onSelect={onSelect} />
    )
    fireEvent.click(screen.getByLabelText('Movie audio: English (5.1)'))
    fireEvent.click(screen.getByRole('button', { name: 'Indonesian' }))

    expect(onSelect).toHaveBeenCalledWith({ label: '', language: 'ind', ordinal: 1 })
    expect(container.querySelector('details')).not.toHaveAttribute('open')
  })
})
