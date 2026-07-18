import { useRef, useState } from 'react'
import type {
  DownloadProgressEvent,
  LibrarySession,
  MediaRole,
  ReplaceSessionMediaResult,
  SessionLibrary
} from '@shared/types'
import type { DownloadedReactionMetadata } from '../components/SmartReactionInput'
import { buildSuggestedPairingTitle } from '../components/pairingTitle'
import { isAutoSyncReady } from '../autoSyncReadiness'
import { TimelineMapping } from '../sync/timeline'
import type { useAutoSync } from './useAutoSync'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { TransitionToSession } from './useSessionTransition'

interface MediaReplacementResolution {
  library: SessionLibrary
  status: 'replaced' | 'missing' | 'conflict'
  replaced: boolean
}

interface DownloadAttachmentMetadata {
  shouldConsume: boolean
  autoSyncSessionId: string | null
  preserveMovieMoment: number | null
  resetPositionSessionId: string | null
}

interface UseMediaAttachmentOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  autoSync: ReturnType<typeof useAutoSync>
  activeSession: LibrarySession | null
  currentMovieMoment: (source: LibrarySession | null) => number | null
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  consumeDownloadJob: (jobId: string) => void
  transitionToSession: TransitionToSession
}

export function useMediaAttachment({
  playback,
  sessionState,
  autoSync,
  activeSession,
  currentMovieMoment,
  commitLibrary,
  consumeDownloadJob,
  transitionToSession
}: UseMediaAttachmentOptions) {
  const {
    controllerRef,
    setPosition,
    setError,
    setPendingSyncSetup
  } = playback
  const {
    activeSessionIdRef,
    resumeAfterRepairRef,
    setCommandPanelOpen
  } = sessionState
  const [autoSyncRollInSessionId, setAutoSyncRollInSessionId] = useState<string | null>(null)
  const [autoSyncRollInFinalizing, setAutoSyncRollInFinalizing] = useState(false)
  const autoSyncCompletionSettledRef = useRef(false)

  const resolveMediaReplacement = async (
    result: ReplaceSessionMediaResult
  ): Promise<MediaReplacementResolution> => {
    if (result.status === 'replaced') {
      return { library: result.library, status: 'replaced', replaced: true }
    }

    if (result.status === 'missing') {
      setError('That watchalong changed before the file could be attached. Nothing was replaced; try again from the library.')
      return { library: result.library, status: 'missing', replaced: false }
    }

    const existingLibrary = await window.watchAlong.setActiveSession(result.existingSessionId)
    setError('That exact pairing is already in your library, so WatchAlong opened the saved copy. Your current pairing was left unchanged.')
    return { library: existingLibrary, status: 'conflict', replaced: false }
  }

  const runAutoSyncAfterAttachment = async (
    sessionId: string,
    preserveMovieMoment: number | null = null
  ): Promise<void> => {
    setPendingSyncSetup(false)
    setAutoSyncRollInSessionId(sessionId)
    setAutoSyncRollInFinalizing(false)
    autoSyncCompletionSettledRef.current = false
    controllerRef.current?.pause()
    try {
      const result = await autoSync.start(sessionId, 'initial')
      autoSyncCompletionSettledRef.current = true
      setAutoSyncRollInFinalizing(true)
      let currentSession = commitLibrary(await window.watchAlong.getLibrary())
      if (currentSession?.id !== sessionId) return

      const readyToPlay = isAutoSyncReady(result)
      if (readyToPlay && preserveMovieMoment !== null) {
        const mappedPosition = new TimelineMapping({
          offsetSeconds: currentSession.offsetSeconds,
          movieRateCorrection: currentSession.movieRateCorrection
        }).movieToReaction(preserveMovieMoment)
        currentSession = commitLibrary(await window.watchAlong.saveSessionPosition(sessionId, mappedPosition))
        setPosition(currentSession?.lastReactionTimeSeconds ?? mappedPosition)
        controllerRef.current?.seekReaction(currentSession?.lastReactionTimeSeconds ?? mappedPosition)
      } else if (!readyToPlay) {
        setPendingSyncSetup(Boolean(currentSession.reactionPath && currentSession.moviePath))
      }
    } catch {
      if (activeSessionIdRef.current === sessionId) {
        setError('Automatic sync could not finish. Your files are safe; line them up manually to continue.')
        setPendingSyncSetup(true)
      }
    } finally {
      setAutoSyncRollInSessionId((current) => current === sessionId ? null : current)
      setAutoSyncRollInFinalizing(false)
      autoSyncCompletionSettledRef.current = false
    }
  }

  const useManualSyncDuringRollIn = async (): Promise<void> => {
    const sessionId = autoSyncRollInSessionId
    if (!sessionId || autoSyncCompletionSettledRef.current) return
    try {
      await autoSync.cancel()
    } catch {
      setError('WatchAlong could not stop the scan cleanly. You can still line up the videos manually.')
    }
    if (activeSessionIdRef.current === sessionId) setPendingSyncSetup(true)
    setAutoSyncRollInSessionId((current) => current === sessionId ? null : current)
  }

  const locateMissingMedia = async (role: MediaRole): Promise<void> => {
    const initiatingSession = activeSession
    if (!initiatingSession) return
    const initiatingSessionId = initiatingSession.id
    setError(null)
    const shouldResume = playback.syncState === 'playing'
    await transitionToSession(initiatingSessionId, {
      pause: 'controller',
      flushPosition: true,
      prepare: async () => {
        const media = role === 'movie'
          ? await window.watchAlong.selectMovieFile()
          : await window.watchAlong.selectReactionFile()
        return media && activeSessionIdRef.current === initiatingSessionId
          ? { status: 'ready', value: media }
          : { status: 'cancelled' }
      },
      detachedMovie: 'replace-media',
      afterDetached: () => activeSessionIdRef.current === initiatingSessionId,
      resolveLibrary: async (media) => {
        if (!media) return null
        const replacementRequest = role === 'reaction'
          ? window.watchAlong.replaceSessionMedia(
              initiatingSessionId,
              role,
              media.path,
              initiatingSession.reactionSource ?? 'local',
              undefined,
              initiatingSession.reactorName ?? undefined
            )
          : window.watchAlong.replaceSessionMedia(initiatingSessionId, role, media.path, undefined)
        const replacement = await resolveMediaReplacement(await replacementRequest)
        if (replacement.replaced && activeSessionIdRef.current !== initiatingSessionId) return null
        return { library: replacement.library, metadata: replacement.status }
      },
      position: 'session',
      presentation: 'always',
      destination: 'resolved',
      beforeViewChange: () => {
        resumeAfterRepairRef.current = shouldResume
      }
    })
  }

  const attachDownloadedReaction = async (event: DownloadProgressEvent): Promise<void> => {
    if (!event.filePath) return
    if (autoSync.runningSessionId) {
      setError('WatchAlong is already checking sync. Wait for it to finish before attaching another reaction.')
      return
    }

    setError(null)
    try {
      const initiatingSession = activeSession
      const initiatingSessionId = initiatingSession?.id ?? null
      const preservedMovieMoment = currentMovieMoment(initiatingSession)
      const downloadedPath = event.filePath
      const transition = await transitionToSession<void, DownloadAttachmentMetadata>(initiatingSessionId, {
        pause: 'controller',
        flushPosition: true,
        detachedMovie: 'replace-media',
        afterDetached: () => activeSessionIdRef.current === initiatingSessionId,
        resolveLibrary: async () => {
          if (initiatingSession?.moviePath) {
            const suggestedTitle = buildSuggestedPairingTitle(initiatingSession.moviePath, event.metadata?.reactorName)
            const replacement = await resolveMediaReplacement(await window.watchAlong.replaceSessionMedia(
              initiatingSession.id,
              'reaction',
              downloadedPath,
              event.source,
              suggestedTitle,
              event.metadata?.reactorName
            ))
            if (replacement.replaced && activeSessionIdRef.current !== initiatingSessionId) return null
            return {
              library: replacement.library,
              metadata: {
                shouldConsume: replacement.status !== 'missing',
                autoSyncSessionId: replacement.replaced ? initiatingSession.id : null,
                preserveMovieMoment: preservedMovieMoment,
                resetPositionSessionId: replacement.replaced ? initiatingSession.id : null
              }
            }
          }

          const movie = await window.watchAlong.selectMovieFile()
          if (!movie || activeSessionIdRef.current !== initiatingSessionId) return null
          const suggestedTitle = buildSuggestedPairingTitle(movie.path, event.metadata?.reactorName)
          const library = await window.watchAlong.createOrSwitchSessionFromPaths(
            downloadedPath,
            movie.path,
            event.source,
            suggestedTitle,
            event.metadata?.reactorName
          )
          if (activeSessionIdRef.current !== initiatingSessionId) return null
          return {
            library,
            metadata: {
              shouldConsume: Boolean(library.activeSessionId),
              autoSyncSessionId: library.activeSessionId,
              preserveMovieMoment: null,
              resetPositionSessionId: null
            }
          }
        },
        finalizeResolvedSession: async (_nextSession, metadata) => metadata.resetPositionSessionId
          ? window.watchAlong.saveSessionPosition(metadata.resetPositionSessionId, 0)
          : null,
        position: 'session',
        presentation: 'always',
        destination: 'resolved',
        beforeViewChange: () => {
          setPendingSyncSetup(false)
        },
        afterViewChange: () => {
          setCommandPanelOpen(false)
        }
      })
      if (transition.status === 'completed' && transition.metadata.shouldConsume) {
        consumeDownloadJob(event.jobId)
        if (transition.metadata.autoSyncSessionId && transition.session?.id === transition.metadata.autoSyncSessionId) {
          await runAutoSyncAfterAttachment(
            transition.metadata.autoSyncSessionId,
            transition.metadata.preserveMovieMoment
          )
        }
      }
    } catch {
      setError('The reaction is safely downloaded, but WatchAlong could not attach it. Try Attach again from Downloads.')
    }
  }

  const openLocalReaction = async (): Promise<void> => {
    const initiatingSessionId = activeSessionIdRef.current
    setError(null)
    await transitionToSession(initiatingSessionId, {
      pause: 'controller',
      flushPosition: true,
      prepare: async () => {
        const reaction = await window.watchAlong.selectReactionFile()
        return reaction && activeSessionIdRef.current === initiatingSessionId
          ? { status: 'ready', value: reaction }
          : { status: 'cancelled' }
      },
      detachedMovie: 'replace-media',
      afterDetached: () => activeSessionIdRef.current === initiatingSessionId,
      resolveLibrary: async (reaction) => reaction
        ? {
            library: await window.watchAlong.setSessionMedia('reaction', reaction.path, 'local'),
            metadata: undefined
          }
        : null,
      position: 'session',
      presentation: 'always',
      destination: 'resolved',
      beforeViewChange: () => {
        setPendingSyncSetup(true)
      }
    })
  }

  const handleDownloadedReaction = async (
    filePath: string,
    metadata: DownloadedReactionMetadata
  ): Promise<void> => {
    const initiatingSession = activeSession
    const initiatingSessionId = initiatingSession?.id ?? null
    if (!initiatingSessionId || !initiatingSession?.moviePath || autoSync.runningSessionId) return
    const transition = await transitionToSession<
      void,
      { replaced: boolean; shouldConsume: boolean; autoSyncSessionId: string | null }
    >(initiatingSessionId, {
      pause: 'none',
      flushPosition: true,
      detachedMovie: 'replace-media',
      afterDetached: () => activeSessionIdRef.current === initiatingSessionId,
      resolveLibrary: async () => {
        const suggestedTitle = buildSuggestedPairingTitle(initiatingSession.moviePath!, metadata.reactorName)
        const replacement = await resolveMediaReplacement(await window.watchAlong.replaceSessionMedia(
          initiatingSessionId,
          'reaction',
          filePath,
          metadata.source,
          suggestedTitle,
          metadata.reactorName
        ))
        if (replacement.replaced && activeSessionIdRef.current !== initiatingSessionId) return null
        return {
          library: replacement.replaced
            ? await window.watchAlong.saveSessionPosition(initiatingSessionId, 0)
            : replacement.library,
          metadata: {
            replaced: replacement.replaced,
            shouldConsume: replacement.status !== 'missing',
            autoSyncSessionId: replacement.replaced ? initiatingSessionId : null
          }
        }
      },
      position: 'session',
      presentation: 'always',
      destination: 'resolved',
      beforeViewChange: () => {
        setPendingSyncSetup(false)
      }
    })
    if (transition.status === 'completed' && transition.metadata.shouldConsume) {
      consumeDownloadJob(metadata.jobId)
      if (
        transition.metadata.replaced && transition.metadata.autoSyncSessionId &&
        transition.session?.id === transition.metadata.autoSyncSessionId
      ) {
        await runAutoSyncAfterAttachment(transition.metadata.autoSyncSessionId)
      }
    }
  }

  return {
    autoSyncRollInSessionId,
    autoSyncRollInFinalizing,
    locateMissingMedia,
    useManualSyncDuringRollIn,
    attachDownloadedReaction,
    openLocalReaction,
    handleDownloadedReaction
  }
}
