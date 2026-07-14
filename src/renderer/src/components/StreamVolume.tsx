import { Volume2, VolumeX } from 'lucide-react'

interface StreamVolumeProps {
  label: string
  volume: number
  muted: boolean
  disabled?: boolean
  onVolume(value: number): void
  onMute(): void
}

export function StreamVolume({ label, volume, muted, disabled, onVolume, onMute }: StreamVolumeProps): JSX.Element {
  const muteAction = muted ? `Unmute ${label}` : `Mute ${label}`

  return (
    <label className="volume-control">
      <button
        className="icon-button volume-mute"
        type="button"
        title={muteAction}
        aria-label={muteAction}
        aria-pressed={muted}
        disabled={disabled}
        onClick={onMute}
      >
        {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
      </button>
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        disabled={disabled}
        aria-label={`${label} volume`}
        onChange={(event) => onVolume(Number(event.currentTarget.value))}
      />
    </label>
  )
}

