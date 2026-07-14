import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DownloadProgressEvent } from '@shared/types'
import { DownloadProgress, formatDownloadContext } from './DownloadProgress'

describe('DownloadProgress', () => {
  it('renders YouTube telemetry as a real determinate progress bar', () => {
    const event: DownloadProgressEvent = {
      jobId: 'youtube-1',
      source: 'youtube',
      state: 'downloading',
      message: 'Downloading reaction video…',
      percent: 47.2,
      speed: '4.2 MiB/s',
      eta: '02:00',
      fragmentIndex: 3,
      fragmentCount: 12
    }

    render(<DownloadProgress event={event} />)

    expect(screen.getByText('47% · 4.2 MiB/s · 2 min left · part 3 of 12')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '47')
  })

  it('renders Patreon work as honestly indeterminate without a fabricated value', () => {
    const event: DownloadProgressEvent = {
      jobId: 'patreon-1',
      source: 'patreon',
      state: 'downloading',
      message: 'Preparing the reaction video…',
      percent: null
    }

    const { container } = render(<DownloadProgress event={event} />)

    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(container.querySelector('.download-progress-indeterminate')).toBeInTheDocument()
    expect(formatDownloadContext(event)).toBe('')
  })
})
