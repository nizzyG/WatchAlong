import { useRef, useState, type MutableRefObject } from 'react'
import type {
  AppPreferences,
  DownloadProgressEvent,
  ImportWizardLaunchOptions,
  LibrarySession,
  MediaRole,
  ReactorAssignmentRequest,
  ReplaceSessionMediaResult,
  SessionLibrary
} from '@shared/types'
import type { DownloadedReactionMetadata } from '../components/SmartReactionInput'
import type { RenameSessionFocus } from '../components/RenameSessionDialog'
import { buildSuggestedPairingTitle } from '../components/pairingTitle'
import { isAutoSyncReady } from '../autoSyncReadiness'
import type { MoviePosterActionResult } from '../moviePosterActions'
import { TimelineMapping } from '../sync/timeline'
import type { DownloadsHook } from './useDownloads'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { TransitionToSession } from './useSessionTransition'
import type { DetachedMovieTransitionPolicy } from './useMovieWindow'
import type { SubtitlesHook } from './useSubtitles'
import type { useAutoSync } from './useAutoSync'

const VIEW_FADE_MS = 300
const COMMAND_PANEL_FOCUSABLE_SELECTOR = [
  '.command-panel button:not(:disabled)',
  '.command-panel input:not(:disabled)',
  '.command-panel select:not(:disabled)',
  '.command-panel textarea:not(:disabled)',
  '.command-panel summary',
  '.command-panel a[href]',
  '.command-panel [tabindex="0"]'
].join(', ')

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

interface UseSessionActionsOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  subtitles: SubtitlesHook
  downloads: DownloadsHook
  autoSync: ReturnType<typeof useAutoSync>
  activeSession: LibrarySession | null
  wizardSwapMovieMomentRef: MutableRefObject<number | null>
  currentMovieMoment: (source: LibrarySession | null) => number | null
  flushCurrentSessionPosition: () => Promise<void>
  refreshMediaUrls: (sessionId: string | null) => Promise<void>
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  consumeDownloadJob: (jobId: string) => void
  closeDetachedMovieForTransition: (policy: DetachedMovieTransitionPolicy) => Promise<void>
  transitionToSession: TransitionToSession
}

export function useSessionActions({
  playback,
  sessionState,
  subtitles,
  downloads,
  autoSync,
  activeSession,
  wizardSwapMovieMomentRef,
  currentMovieMoment,
  flushCurrentSessionPosition,
  refreshMediaUrls,
  commitLibrary,
  consumeDownloadJob,
  closeDetachedMovieForTransition,
  transitionToSession
}: UseSessionActionsOptions) {
  const {
    controllerRef,
    canPlayRef,
    isPlayingRef,
    setPosition,
    setMoviePosition,
    setSetupMode,
    setSetupPlayingRole,
    setControlsIdle,
    setSyncState,
    setError,
    setPendingSyncSetup,
    setViewTransitioning
  } = playback
  const {
    appShellRef,
    activeSessionIdRef,
    commandPanelButtonRef,
    commandPanelReturnFocusRef,
    sessionDialogReturnFocusRef,
    resumeAfterRepairRef,
    library,
    setPreferences,
    appView,
    setAppView,
    setStartupError,
    setShowWelcome,
    commandPanelOpen,
    setCommandPanelOpen,
    setPatreonStatus,
    renameTargetId,
    setRenameTargetId,
    setRenameInitialFocus,
    renameDraft,
    setRenameDraft,
    deleteTarget,
    setDeleteTarget
  } = sessionState
  const { setSubtitleCues } = subtitles
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

  const openImportWizard = async (options?: ImportWizardLaunchOptions): Promise<void> => {
    setCommandPanelOpen(false)
    setControlsIdle(false)
    downloads.pausedForWizardRef.current = canPlayRef.current && isPlayingRef.current
    wizardSwapMovieMomentRef.current = options?.mode === 'swap-reaction'
      ? currentMovieMoment(activeSession)
      : null
    controllerRef.current?.pause()
    await flushCurrentSessionPosition()
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
    }
    await window.watchAlong.openImportWizard(options)
  }

  const navigateToLibrary = async (): Promise<void> => {
    await transitionToSession(null, {
      pause: 'all-media',
      flushPosition: true,
      detachedMovie: 'leave-session',
      position: 'preserve',
      presentation: 'always',
      destination: 'library',
      beforeViewChange: () => {
        setSetupMode(false)
        setSetupPlayingRole(null)
        setCommandPanelOpen(false)
        setSyncState('paused')
      }
    })
  }

  const openStartupLibrary = async (): Promise<void> => {
    setStartupError(null)
    setAppView('library')
    setShowWelcome(false)
    await refreshMediaUrls(null)
  }

  const startWelcomeImport = (): void => {
    setShowWelcome(false)
    void openImportWizard({ mode: 'new' })
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

  const updatePreference = async <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): Promise<void> => {
    setPreferences(await window.watchAlong.setPreference(key, value))
  }

  const chooseDownloadDirectory = async (): Promise<void> => {
    const nextPreferences = await window.watchAlong.selectDownloadDirectory()
    if (nextPreferences) setPreferences(nextPreferences)
  }

  const forgetPatreonSession = async (): Promise<void> => {
    setPatreonStatus(await window.watchAlong.forgetPatreonSession())
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

  const finishViewTransition = (): void => {
    setViewTransitioning(true)
    window.setTimeout(() => setViewTransitioning(false), VIEW_FADE_MS)
  }

  const focusPlayerFallback = (): void => {
    if (commandPanelButtonRef.current && !playback.controlsIdle) commandPanelButtonRef.current.focus()
    else appShellRef.current?.focus()
  }

  const openCommandPanel = (returnFocusTarget?: HTMLElement | null): void => {
    commandPanelReturnFocusRef.current = returnFocusTarget ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : commandPanelButtonRef.current
    )
    setControlsIdle(false)
    setCommandPanelOpen(true)
  }

  const closeCommandPanel = (): void => {
    setCommandPanelOpen(false)
    window.requestAnimationFrame(() => {
      const target = commandPanelReturnFocusRef.current
      commandPanelReturnFocusRef.current = null
      if (target && target.isConnected && !target.closest('.command-panel')) {
        target.focus()
        return
      }
      focusPlayerFallback()
    })
  }

  const toggleCommandPanel = (returnFocusTarget?: HTMLElement | null): void => {
    if (commandPanelOpen) closeCommandPanel()
    else openCommandPanel(returnFocusTarget)
  }

  const movePanelFocus = (delta: number): void => {
    const focusable = Array.from(document.querySelectorAll<HTMLElement>(
      COMMAND_PANEL_FOCUSABLE_SELECTOR
    )).filter(isVisibleCommandPanelControl)
    if (focusable.length === 0) return
    const currentIndex = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + focusable.length) % focusable.length
    focusable[nextIndex]?.focus()
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

  const switchSession = async (sessionId: string): Promise<void> => {
    if (sessionId === activeSession?.id && appView === 'player') return
    await transitionToSession(sessionId, {
      pause: 'controller',
      flushPosition: true,
      detachedMovie: 'leave-session',
      beforeResolve: () => {
        setSyncState('paused')
      },
      clearResolvedPopOut: true,
      position: 'session',
      presentation: 'always',
      destination: 'resolved',
      beforeViewChange: () => {
        setSetupMode(false)
        setCommandPanelOpen(false)
      },
      afterViewChange: (nextSession) => {
        if (nextSession) finishViewTransition()
      }
    })
  }

  const chooseMoviePoster = async (sessionId: string): Promise<MoviePosterActionResult> => {
    try {
      const next = await window.watchAlong.chooseMoviePoster(sessionId)
      if (!next) return { status: 'cancelled' }
      commitLibrary(next)
      return { status: 'chosen' }
    } catch (error) {
      console.error('Could not choose a movie poster.', error)
      return { status: 'error', action: 'choose' }
    }
  }

  const clearMoviePoster = async (sessionId: string): Promise<MoviePosterActionResult> => {
    try {
      commitLibrary(await window.watchAlong.clearMoviePoster(sessionId))
      return { status: 'cleared' }
    } catch (error) {
      console.error('Could not restore automatic movie art.', error)
      return { status: 'error', action: 'clear' }
    }
  }

  const requestRenameSession = (
    sessionId: string,
    initialFocus: RenameSessionFocus = 'title',
    returnFocusTarget: HTMLElement | null = null
  ): void => {
    rememberSessionDialogReturnFocus(returnFocusTarget)
    const current = library.sessions.find((item) => item.id === sessionId)
    setRenameTargetId(sessionId)
    setRenameInitialFocus(initialFocus)
    setRenameDraft(current?.title ?? '')
  }

  const cancelRenameSession = (): void => {
    setRenameTargetId(null)
    setRenameInitialFocus('title')
    setRenameDraft('')
    restoreSessionDialogFocus()
  }

  const confirmRenameSession = async (): Promise<void> => {
    if (!renameTargetId || !renameDraft.trim()) return
    commitLibrary(await window.watchAlong.renameSession(
      renameTargetId,
      renameDraft.trim()
    ))
    cancelRenameSession()
  }

  const confirmReactorAssignment = async (assignment: ReactorAssignmentRequest): Promise<void> => {
    if (!renameTargetId) return
    commitLibrary(await window.watchAlong.assignSessionReactor(renameTargetId, assignment))
    cancelRenameSession()
  }

  const requestDeleteSession = (
    sessionId: string,
    returnToLibrary = false,
    returnFocusTarget: HTMLElement | null = null
  ): void => {
    rememberSessionDialogReturnFocus(returnFocusTarget)
    setDeleteTarget({ sessionId, returnToLibrary })
  }

  const cancelDeleteSession = (): void => {
    setDeleteTarget(null)
    restoreSessionDialogFocus()
  }

  const confirmDeleteSession = async (): Promise<void> => {
    if (!deleteTarget) return
    const shouldReturnToLibrary = deleteTarget.returnToLibrary
    if (deleteTarget.sessionId === activeSession?.id) {
      await closeDetachedMovieForTransition('replace-media')
    }
    const nextSession = commitLibrary(await window.watchAlong.deleteSession(deleteTarget.sessionId))
    setDeleteTarget(null)
    restoreSessionDialogFocus()
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    if (!nextSession || shouldReturnToLibrary) {
      setAppView('library')
      await refreshMediaUrls(null)
      return
    }
    if (appView === 'player') await refreshMediaUrls(nextSession.id)
  }

  const openSubtitle = async (): Promise<void> => {
    setError(null)
    const next = await window.watchAlong.openSubtitle()
    if (next) commitLibrary(next)
  }

  const clearSubtitle = async (): Promise<void> => {
    commitLibrary(await window.watchAlong.clearSubtitle())
    setSubtitleCues([])
  }

  function rememberSessionDialogReturnFocus(explicitTarget: HTMLElement | null): void {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sessionDialogReturnFocusRef.current = explicitTarget ?? activeElement
  }

  function restoreSessionDialogFocus(): void {
    window.requestAnimationFrame(() => {
      const target = sessionDialogReturnFocusRef.current
      sessionDialogReturnFocusRef.current = null
      if (target?.isConnected) target.focus()
      else appShellRef.current?.focus()
    })
  }

  return {
    autoSyncRollInSessionId,
    autoSyncRollInFinalizing,
    openImportWizard,
    navigateToLibrary,
    openStartupLibrary,
    startWelcomeImport,
    locateMissingMedia,
    updatePreference,
    chooseDownloadDirectory,
    forgetPatreonSession,
    useManualSyncDuringRollIn,
    attachDownloadedReaction,
    closeCommandPanel,
    toggleCommandPanel,
    movePanelFocus,
    openLocalReaction,
    handleDownloadedReaction,
    switchSession,
    chooseMoviePoster,
    clearMoviePoster,
    requestRenameSession,
    cancelRenameSession,
    confirmRenameSession,
    confirmReactorAssignment,
    requestDeleteSession,
    cancelDeleteSession,
    confirmDeleteSession,
    openSubtitle,
    clearSubtitle
  }
}

function isVisibleCommandPanelControl(element: HTMLElement): boolean {
  const closedDetails = element.closest<HTMLDetailsElement>('details:not([open])')
  if (!closedDetails) return true
  return element instanceof HTMLElement
    && element.tagName === 'SUMMARY'
    && element.parentElement === closedDetails
}
