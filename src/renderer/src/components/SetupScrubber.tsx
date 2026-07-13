import { Pause, Play } from 'lucide-react'
import type { MediaRole } from '@shared/types'
import { formatTime } from './appFormat'

interface SetupScrubberProps {
  role: MediaRole
  label: string
  time: number
  duration: number
  playing: boolean
  onTogglePlay(): void
  onSeek(time: number): void
  onNudge(deltaSeconds: number): void
}

export function SetupScrubber({
  role,
  label,
  time,
  duration,
  playing,
  onTogglePlay,
  onSeek,
  onNudge
}: SetupScrubberProps): JSX.Element {
  return (
    <div className="setup-row" data-role={role}>
      <span className="setup-label">{label}</span>
      <button
        className="icon-button"
        type="button"
        title={playing ? `Pause ${role}` : `Play ${role}`}
        aria-label={playing ? `Pause ${role}` : `Play ${role}`}
        onClick={onTogglePlay}
      >
        {playing ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}
      </button>
      <button className="mini-button" type="button" onClick={() => onNudge(-5)}>
        -5s
      </button>
      <button className="mini-button" type="button" onClick={() => onNudge(-0.25)}>
        -0.25s
      </button>
      <input
        className="timeline"
        type="range"
        min={0}
        max={Math.max(0, duration)}
        step={0.05}
        value={Math.min(time, duration || 0)}
        aria-label={`${label} time`}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
      />
      <button className="mini-button" type="button" onClick={() => onNudge(0.25)}>
        +0.25s
      </button>
      <button className="mini-button" type="button" onClick={() => onNudge(5)}>
        +5s
      </button>
      <span className="setup-time">{formatTime(time)}</span>
    </div>
  )
}


