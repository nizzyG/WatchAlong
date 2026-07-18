import type { LibrarySession, MediaRole } from '@shared/types'
import { TimelineMapping } from '../sync/timeline'
import type { VideoAdapter } from '../sync/SyncController'
import type { PlaybackHook } from './usePlayback'
import { roundSeconds } from './playerTiming'

interface UseSyncSetupOptions {
  playback: PlaybackHook
  session: LibrarySession
  canPlay: boolean
  getMovieAdapter: () => VideoAdapter | null
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
}

export function useSyncSetup({
  playback,
  session,
  canPlay,
  getMovieAdapter,
  persist
}: UseSyncSetupOptions) {
  const {
    reactionVideoRef,
    controllerRef,
    durations,
    position,
    setPosition,
    moviePosition,
    setMoviePosition,
    setupMode,
    setSetupMode,
    setupPositions,
    setSetupPositions,
    setupPlayingRole,
    setSetupPlayingRole
  } = playback

  const enterSyncSetup = (): void => {
    if (!canPlay) return
    controllerRef.current?.pause()
    reactionVideoRef.current?.pause()
    getMovieAdapter()?.pause()
    setSetupPlayingRole(null)
    setSetupPositions({
      reaction: reactionVideoRef.current?.currentTime ?? position,
      movie: getMovieAdapter()?.currentTime ?? moviePosition
    })
    setSetupMode(true)
  }

  const cancelSyncSetup = (): void => {
    reactionVideoRef.current?.pause()
    getMovieAdapter()?.pause()
    setSetupPlayingRole(null)
    setSetupMode(false)
    controllerRef.current?.setSetupMode(false)
    controllerRef.current?.loadSession(reactionVideoRef.current?.currentTime ?? position)
  }

  const saveSyncSetup = async (): Promise<void> => {
    const reaction = reactionVideoRef.current
    const movie = getMovieAdapter()
    if (!reaction || !movie) return
    reaction.pause()
    movie.pause()
    setSetupPlayingRole(null)
    const nextReactionTime = reaction.currentTime
    await persist({
      offsetSeconds: roundSeconds(TimelineMapping.calculateOffset(
        reaction.currentTime,
        movie.currentTime,
        session.movieRateCorrection
      )),
      lastReactionTimeSeconds: nextReactionTime
    })
    setPosition(nextReactionTime)
    setSetupMode(false)
    controllerRef.current?.setSetupMode(false)
    controllerRef.current?.loadSession(nextReactionTime)
  }

  const setIndependentSetupTime = (role: MediaRole, time: number): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : getMovieAdapter()
    const duration = role === 'reaction' ? durations.reaction : durations.movie
    const nextTime = Math.max(0, Math.min(Number.isFinite(duration) ? duration : Number.MAX_SAFE_INTEGER, time))
    if (element) element.currentTime = nextTime
    setSetupPositions((current) => ({ ...current, [role]: nextTime }))
    if (role === 'reaction') setPosition(nextTime)
    else setMoviePosition(nextTime)
  }

  const nudgeSetupTime = (role: MediaRole, deltaSeconds: number): void => {
    setIndependentSetupTime(role, setupPositions[role] + deltaSeconds)
  }

  const toggleSetupPreview = async (role: MediaRole): Promise<void> => {
    if (!setupMode) return
    const active = role === 'reaction' ? reactionVideoRef.current : getMovieAdapter()
    const other = role === 'reaction' ? getMovieAdapter() : reactionVideoRef.current
    if (!active) return
    if (setupPlayingRole === role && !active.paused) {
      active.pause()
      setSetupPlayingRole(null)
      return
    }
    other?.pause()
    active.playbackRate = role === 'movie' ? session.playbackRate * session.movieRateCorrection : session.playbackRate
    await active.play()
    setSetupPlayingRole(role)
  }

  return {
    enterSyncSetup,
    cancelSyncSetup,
    saveSyncSetup,
    setIndependentSetupTime,
    nudgeSetupTime,
    toggleSetupPreview
  }
}
