import { Check, Languages, LoaderCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type {
  AudioTrackPreference,
  MovieAudioTrackOption
} from '@shared/types'

interface AudioTrackSelectorProps {
  tracks: readonly MovieAudioTrackOption[]
  selected: AudioTrackPreference | null
  changing?: boolean
  disabled?: boolean
  onSelect(track: AudioTrackPreference): Promise<boolean>
}

export function AudioTrackSelector({
  tracks,
  selected,
  changing = false,
  disabled = false,
  onSelect
}: AudioTrackSelectorProps): JSX.Element | null {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const details = detailsRef.current
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  if (tracks.length <= 1) return null

  const current = tracks.find((track) => track.enabled) ??
    tracks.find((track) => samePreference(track, selected)) ?? tracks[0]

  const closeAndRestoreFocus = (): void => {
    if (detailsRef.current) detailsRef.current.open = false
    window.requestAnimationFrame(() => summaryRef.current?.focus())
  }

  return (
    <details
      ref={detailsRef}
      className="audio-track-selector"
      aria-busy={changing}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
        event.currentTarget.open = false
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        closeAndRestoreFocus()
      }}
    >
      <summary
        ref={summaryRef}
        className="audio-track-selector-summary"
        aria-label={`Movie audio: ${primaryLabel(current)}`}
        aria-disabled={disabled || changing}
        onClick={(event) => {
          if (disabled || changing) event.preventDefault()
        }}
      >
        {changing ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Languages size={16} aria-hidden />}
        <span className="audio-track-selector-copy">
          <small>Movie audio</small>
          <strong>{primaryLabel(current)}</strong>
        </span>
        <span className="audio-track-status" role="status" aria-live="polite" aria-atomic="true">
          {changing ? `Switching movie audio from ${primaryLabel(current)}` : `Movie audio set to ${primaryLabel(current)}`}
        </span>
      </summary>
      <div className="audio-track-menu" role="group" aria-label="Movie audio tracks">
        <header>
          <strong>Movie audio</strong>
          <span>Choose a playable track</span>
        </header>
        <div className="audio-track-options">
          {tracks.map((track) => {
            const active = track.enabled || samePreference(track, selected)
            const secondary = secondaryLabel(track)
            return (
              <button
                key={`${track.ordinal}-${track.label}-${track.language}`}
                type="button"
                className={active ? 'audio-track-option audio-track-option-active' : 'audio-track-option'}
                aria-pressed={active}
                disabled={disabled || changing}
                onClick={() => {
                  closeAndRestoreFocus()
                  if (!active) void onSelect(toPreference(track))
                }}
              >
                <span>
                  <strong>{primaryLabel(track)}</strong>
                  {secondary && <small>{secondary}</small>}
                </span>
                {active && <Check size={16} aria-hidden />}
              </button>
            )
          })}
        </div>
      </div>
    </details>
  )
}

function primaryLabel(track: MovieAudioTrackOption): string {
  return track.label.trim() || displayLanguage(track.language) || `Track ${track.ordinal + 1}`
}

function secondaryLabel(track: MovieAudioTrackOption): string | null {
  if (!track.label.trim() || !track.language.trim()) return null
  return displayLanguage(track.language)
}

function displayLanguage(language: string): string | null {
  const code = language.trim().replaceAll('_', '-')
  if (!code) return null
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

function samePreference(
  track: Pick<MovieAudioTrackOption, 'label' | 'language' | 'ordinal'>,
  selected: AudioTrackPreference | null
): boolean {
  return Boolean(selected && track.ordinal === selected.ordinal &&
    track.label === selected.label && track.language === selected.language)
}

function toPreference(track: MovieAudioTrackOption): AudioTrackPreference {
  return { label: track.label, language: track.language, ordinal: track.ordinal }
}
