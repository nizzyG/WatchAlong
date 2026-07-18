import { useCallback, useRef } from 'react'
import type { LibrarySession, SessionLibrary } from '@shared/types'
import type { VideoAdapter } from '../sync/SyncController'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { DetachedMovieTransitionPolicy } from './useMovieWindow'

export type SessionTransitionPausePolicy = 'none' | 'controller' | 'all-media'
export type SessionTransitionPosition = 'preserve' | 'session' | 'zero'
export type SessionTransitionPresentation = 'always' | 'active-id-changed'
export type SessionTransitionDestination = 'library' | 'resolved'

export type SessionTransitionPreparation<T> =
  | { status: 'ready'; value: T }
  | { status: 'cancelled' }

export interface SessionTransitionResolution<TMetadata> {
  library: SessionLibrary
  metadata: TMetadata
}

export interface SessionTransitionPlan<TPrepared = void, TMetadata = undefined> {
  pause: SessionTransitionPausePolicy
  flushPosition: boolean
  prepare?: () => Promise<SessionTransitionPreparation<TPrepared>>
  detachedMovie: DetachedMovieTransitionPolicy
  afterDetached?: () => boolean | Promise<boolean>
  beforeResolve?: () => void | Promise<void>
  resolveLibrary?: (
    prepared: TPrepared
  ) => Promise<SessionTransitionResolution<TMetadata> | null>
  clearResolvedPopOut?: boolean
  afterResolved?: (
    session: LibrarySession | null,
    metadata: TMetadata
  ) => void | Promise<void>
  finalizeResolvedSession?: (
    session: LibrarySession,
    metadata: TMetadata
  ) => Promise<SessionLibrary | null>
  position: SessionTransitionPosition
  presentation: SessionTransitionPresentation
  destination: SessionTransitionDestination
  beforePresentation?: (
    session: LibrarySession | null,
    metadata: TMetadata
  ) => void | Promise<void>
  beforeViewChange?: (
    session: LibrarySession | null,
    metadata: TMetadata
  ) => void | Promise<void>
  afterViewChange?: (
    session: LibrarySession | null,
    metadata: TMetadata
  ) => void | Promise<void>
}

export type SessionTransitionResult<TMetadata = undefined> =
  | { status: 'cancelled' }
  | {
      status: 'completed'
      session: LibrarySession | null
      presented: boolean
      metadata: TMetadata
    }

export type TransitionToSession = <TPrepared = void, TMetadata = undefined>(
  intendedSessionId: string | null,
  plan: SessionTransitionPlan<TPrepared, TMetadata>
) => Promise<SessionTransitionResult<TMetadata>>

export interface SessionTransitionRuntime {
  getActiveSessionId: () => string | null
  pauseController: () => void
  pauseReaction: () => void
  pauseMovie: () => void
  flushCurrentSessionPosition: () => Promise<void>
  closeDetachedMovieForTransition: (policy: DetachedMovieTransitionPolicy) => Promise<void>
  activateSession: (sessionId: string) => Promise<SessionLibrary>
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  clearResolvedMoviePopOut: () => Promise<SessionLibrary>
  setPosition: (position: number) => void
  setMoviePosition: (position: number) => void
  setAppView: (view: 'library' | 'player') => void
  refreshMediaUrls: (sessionId: string | null) => Promise<void>
}

export async function runSessionTransition<TPrepared = void, TMetadata = undefined>(
  runtime: SessionTransitionRuntime,
  intendedSessionId: string | null,
  plan: SessionTransitionPlan<TPrepared, TMetadata>
): Promise<SessionTransitionResult<TMetadata>> {
  const previousSessionId = runtime.getActiveSessionId()
  const hasResolver = Boolean(plan.resolveLibrary) || intendedSessionId !== null
  validateTransitionPlan(plan, hasResolver)

  pausePlayback(runtime, plan.pause)
  if (plan.flushPosition) await runtime.flushCurrentSessionPosition()

  let prepared: TPrepared | undefined
  if (plan.prepare) {
    const preparation = await plan.prepare()
    if (preparation.status === 'cancelled') return { status: 'cancelled' }
    prepared = preparation.value
  }

  await runtime.closeDetachedMovieForTransition(plan.detachedMovie)
  if (plan.afterDetached && !(await plan.afterDetached())) return { status: 'cancelled' }

  if (hasResolver && plan.beforeResolve) await plan.beforeResolve()

  let nextSession: LibrarySession | null = null
  let metadata = undefined as TMetadata
  if (hasResolver) {
    let resolution: SessionTransitionResolution<TMetadata>
    if (plan.resolveLibrary) {
      const resolved = await plan.resolveLibrary(prepared as TPrepared)
      if (!resolved) return { status: 'cancelled' }
      resolution = resolved
    } else {
      resolution = {
        library: await runtime.activateSession(intendedSessionId as string),
        metadata
      }
    }
    metadata = resolution.metadata
    nextSession = runtime.commitLibrary(resolution.library)

    if (plan.clearResolvedPopOut && nextSession?.isMoviePoppedOut) {
      nextSession = runtime.commitLibrary(await runtime.clearResolvedMoviePopOut())
    }

    if (plan.afterResolved) await plan.afterResolved(nextSession, metadata)

    if (nextSession && plan.finalizeResolvedSession) {
      const finalizedLibrary = await plan.finalizeResolvedSession(nextSession, metadata)
      if (finalizedLibrary) nextSession = runtime.commitLibrary(finalizedLibrary)
    }
  }

  const finalSessionId = hasResolver ? nextSession?.id ?? null : previousSessionId
  const shouldPresent = plan.presentation === 'always' || finalSessionId !== previousSessionId
  if (!shouldPresent) {
    return { status: 'completed', session: nextSession, presented: false, metadata }
  }

  if (plan.beforePresentation) await plan.beforePresentation(nextSession, metadata)
  presentPosition(runtime, plan.position, nextSession)
  if (plan.beforeViewChange) await plan.beforeViewChange(nextSession, metadata)

  const nextView = plan.destination === 'library' || !nextSession ? 'library' : 'player'
  runtime.setAppView(nextView)
  if (plan.afterViewChange) await plan.afterViewChange(nextSession, metadata)
  await runtime.refreshMediaUrls(nextView === 'player' && nextSession ? nextSession.id : null)

  return { status: 'completed', session: nextSession, presented: true, metadata }
}

function validateTransitionPlan<TPrepared, TMetadata>(
  plan: SessionTransitionPlan<TPrepared, TMetadata>,
  hasResolver: boolean
): void {
  if (plan.destination === 'resolved' && !hasResolver) {
    throw new Error('A resolved session transition requires a session id or library resolver.')
  }
  if (!hasResolver && plan.position !== 'preserve') {
    throw new Error('A library-only transition cannot present a resolved session position.')
  }
  if (!hasResolver && plan.presentation !== 'always') {
    throw new Error('A library-only transition must always present the library destination.')
  }
}

interface UseSessionTransitionOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  flushCurrentSessionPosition: () => Promise<void>
  refreshMediaUrls: (sessionId: string | null) => Promise<void>
  getMovieAdapter: () => VideoAdapter | null
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  closeDetachedMovieForTransition: (policy: DetachedMovieTransitionPolicy) => Promise<void>
}

export function useSessionTransition(options: UseSessionTransitionOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const transitionToSession: TransitionToSession = useCallback(<TPrepared, TMetadata>(
    intendedSessionId: string | null,
    plan: SessionTransitionPlan<TPrepared, TMetadata>
  ): Promise<SessionTransitionResult<TMetadata>> => {
    const current = optionsRef.current
    return runSessionTransition(
      {
        getActiveSessionId: () => current.sessionState.activeSessionIdRef.current,
        pauseController: () => current.playback.controllerRef.current?.pause(),
        pauseReaction: () => current.playback.reactionVideoRef.current?.pause(),
        pauseMovie: () => current.getMovieAdapter()?.pause(),
        flushCurrentSessionPosition: current.flushCurrentSessionPosition,
        closeDetachedMovieForTransition: current.closeDetachedMovieForTransition,
        activateSession: (sessionId) => window.watchAlong.setActiveSession(sessionId),
        commitLibrary: current.commitLibrary,
        clearResolvedMoviePopOut: () => window.watchAlong.saveActiveSession({ isMoviePoppedOut: false }),
        setPosition: current.playback.setPosition,
        setMoviePosition: current.playback.setMoviePosition,
        setAppView: current.sessionState.setAppView,
        refreshMediaUrls: current.refreshMediaUrls
      },
      intendedSessionId,
      plan
    )
  }, [])

  return { transitionToSession }
}

function pausePlayback(runtime: SessionTransitionRuntime, policy: SessionTransitionPausePolicy): void {
  if (policy === 'none') return
  runtime.pauseController()
  if (policy === 'all-media') {
    runtime.pauseReaction()
    runtime.pauseMovie()
  }
}

function presentPosition(
  runtime: SessionTransitionRuntime,
  position: SessionTransitionPosition,
  session: LibrarySession | null
): void {
  if (position === 'preserve') return
  runtime.setPosition(position === 'session' ? session?.lastReactionTimeSeconds ?? 0 : 0)
  runtime.setMoviePosition(0)
}
