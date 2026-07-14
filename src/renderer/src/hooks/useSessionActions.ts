import { useRef, useState, type MutableRefObject } from 'react'
import type {
  AppPreferences,
  DownloadProgressEvent,
  ImportWizardLaunchOptions,
  LibrarySession,
  MediaRole,
  ReplaceSessionMediaResult,
  SessionLibrary
} from '@shared/types'
import type { DownloadedReactionMetadata } from '../components/SmartReactionInput'
import type { RenameSessionFocus } from '../components/RenameSessionDialog'
import { deriveReactorIdentity } from '../components/libraryPresentation'
import { buildSuggestedPairingTitle } from '../components/pairingTitle'
import type { MoviePosterActionResult } from '../moviePosterActions'
import { TimelineMapping } from '../sync/timeline'
import type { VideoAdapter } from '../sync/SyncController'
import type { DownloadsHook } from './useDownloads'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { SubtitlesHook } from './useSubtitles'
import type { useAutoSync } from './useAutoSync'

const VIEW_FADE_MS = 300

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
  getMovieAdapter: () => VideoAdapter | null
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  consumeDownloadJob: (jobId: string) => void
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
  closeMovieWindowForModeChange: () => Promise<void>
  stopDetachedMovie: () => Promise<void>
  destroyRemoteMovieAdapter: () => void
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
  getMovieAdapter,
  commitLibrary,
  consumeDownloadJob,
  persist,
  closeMovieWindowForModeChange,
  stopDetachedMovie,
  destroyRemoteMovieAdapter
}: UseSessionActionsOptions) {
  const {
    reactionVideoRef,
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
    setViewTransitioning,
    movieWindowActive,
    setMovieWindowActive
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
    renameReactorDraft,
    setRenameReactorDraft,
    deleteTarget,
    setDeleteTarget
  } = sessionState
  const { setSubtitleCues } = subtitles
  const [autoSyncRollInSessionId, setAutoSyncRollInSessionId] = useState<string | null>(null)
  const [autoSyncRollInFinalizing, setAutoSyncRollInFinalizing] = useState(false)
  const autoSyncCompletionSettledRef = useRef(false)

  const resolveMediaReplacement = async (
    result: ReplaceSessionMediaResult
  ): Promise<{ library: SessionLibrary; replaced: boolean } | null> => {
    if (result.status === 'replaced') {
      return { library: result.library, replaced: true }
    }

    if (result.status === 'missing') {
      commitLibrary(result.library)
      setError('That watchalong changed before the file could be attached. Nothing was replaced; try again from the library.')
      return null
    }

    const existingLibrary = await window.watchAlong.setActiveSession(result.existingSessionId)
    setError('That exact pairing is already in your library, so WatchAlong opened the saved copy. Your current pairing was left unchanged.')
    return { library: existingLibrary, replaced: false }
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
    controllerRef.current?.pause()
    reactionVideoRef.current?.pause()
    getMovieAdapter()?.pause()
    await flushCurrentSessionPosition()
    if (movieWindowActive) {
      await closeMovieWindowForModeChange()
      destroyRemoteMovieAdapter()
      setMovieWindowActive(false)
      await persist({ isMoviePoppedOut: false })
    }
    setSetupMode(false)
    setSetupPlayingRole(null)
    setCommandPanelOpen(false)
    setSyncState('paused')
    setAppView('library')
    await refreshMediaUrls(null)
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
    if (!activeSession) return
    setError(null)
    const shouldResume = playback.syncState === 'playing'
    controllerRef.current?.pause()
    await flushCurrentSessionPosition()
    const media = role === 'movie'
      ? await window.watchAlong.selectMovieFile()
      : await window.watchAlong.selectReactionFile()
    if (!media) return

    await stopDetachedMovie()
    const replacementRequest = role === 'reaction'
      ? window.watchAlong.replaceSessionMedia(
          activeSession.id,
          role,
          media.path,
          activeSession.reactionSource ?? 'local',
          undefined,
          activeSession.reactorName ?? undefined
        )
      : window.watchAlong.replaceSessionMedia(activeSession.id, role, media.path, undefined)
    const replacement = await resolveMediaReplacement(await replacementRequest)
    if (!replacement) return
    const nextSession = commitLibrary(replacement.library)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    resumeAfterRepairRef.current = shouldResume
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
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

      if (result.outcome === 'confident' && preserveMovieMoment !== null) {
        const mappedPosition = new TimelineMapping({
          offsetSeconds: currentSession.offsetSeconds,
          movieRateCorrection: currentSession.movieRateCorrection
        }).movieToReaction(preserveMovieMoment)
        currentSession = commitLibrary(await window.watchAlong.saveSessionPosition(sessionId, mappedPosition))
        setPosition(currentSession?.lastReactionTimeSeconds ?? mappedPosition)
        controllerRef.current?.seekReaction(currentSession?.lastReactionTimeSeconds ?? mappedPosition)
      } else if (result.outcome !== 'confident') {
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
      const preservedMovieMoment = currentMovieMoment(activeSession)
      controllerRef.current?.pause()
      await flushCurrentSessionPosition()
      await stopDetachedMovie()
      if (activeSession?.moviePath) {
        const suggestedTitle = buildSuggestedPairingTitle(activeSession.moviePath, event.metadata?.reactorName)
        const replacement = await resolveMediaReplacement(await window.watchAlong.replaceSessionMedia(
          activeSession.id, 'reaction', event.filePath, event.source, suggestedTitle, event.metadata?.reactorName
        ))
        if (!replacement) return
        let nextSession = commitLibrary(replacement.library)
        if (replacement.replaced && nextSession) {
          nextSession = commitLibrary(await window.watchAlong.saveSessionPosition(nextSession.id, 0))
        }
        setPosition(replacement.replaced ? 0 : nextSession?.lastReactionTimeSeconds ?? 0)
        setMoviePosition(0)
        setPendingSyncSetup(false)
        setAppView('player')
        setCommandPanelOpen(false)
        await refreshMediaUrls(nextSession?.id ?? null)
        if (nextSession?.id) {
          consumeDownloadJob(event.jobId)
          if (replacement.replaced) {
            await runAutoSyncAfterAttachment(nextSession.id, preservedMovieMoment)
          }
        }
        return
      }

      const movie = await window.watchAlong.selectMovieFile()
      if (!movie) return
      const suggestedTitle = buildSuggestedPairingTitle(movie.path, event.metadata?.reactorName)
      const next = await window.watchAlong.createOrSwitchSessionFromPaths(
        event.filePath,
        movie.path,
        event.source,
        suggestedTitle,
        event.metadata?.reactorName
      )
      const nextSession = commitLibrary(next)
      setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
      setMoviePosition(0)
      setPendingSyncSetup(false)
      setAppView(nextSession ? 'player' : 'library')
      setCommandPanelOpen(false)
      await refreshMediaUrls(nextSession?.id ?? null)
      if (nextSession?.id) {
        consumeDownloadJob(event.jobId)
        await runAutoSyncAfterAttachment(nextSession.id)
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
      '.command-panel button:not(:disabled), .command-panel input:not(:disabled), .command-panel select:not(:disabled), .command-panel textarea:not(:disabled), .command-panel a[href], .command-panel [tabindex="0"]'
    ))
    if (focusable.length === 0) return
    const currentIndex = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + focusable.length) % focusable.length
    focusable[nextIndex]?.focus()
  }

  const openLocalReaction = async (): Promise<void> => {
    setError(null)
    controllerRef.current?.pause()
    await flushCurrentSessionPosition()
    const reaction = await window.watchAlong.selectReactionFile()
    if (!reaction) return
    await stopDetachedMovie()
    const nextSession = commitLibrary(await window.watchAlong.setSessionMedia('reaction', reaction.path, 'local'))
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setPendingSyncSetup(true)
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const handleDownloadedReaction = async (
    filePath: string,
    metadata: DownloadedReactionMetadata
  ): Promise<void> => {
    const initiatingSession = activeSession
    const initiatingSessionId = initiatingSession?.id ?? null
    if (!initiatingSessionId || !initiatingSession?.moviePath || autoSync.runningSessionId) return
    await flushCurrentSessionPosition()
    await stopDetachedMovie()
    if (activeSessionIdRef.current !== initiatingSessionId) return

    const suggestedTitle = buildSuggestedPairingTitle(initiatingSession.moviePath, metadata.reactorName)
    const replacement = await resolveMediaReplacement(await window.watchAlong.replaceSessionMedia(
      initiatingSessionId, 'reaction', filePath, metadata.source, suggestedTitle, metadata.reactorName
    ))
    if (!replacement) return
    if (replacement.replaced && activeSessionIdRef.current !== initiatingSessionId) return
    const next = replacement.replaced
      ? await window.watchAlong.saveSessionPosition(initiatingSessionId, 0)
      : replacement.library
    const nextSession = commitLibrary(next)
    setPosition(replacement.replaced ? 0 : nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setPendingSyncSetup(false)
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
    if (nextSession?.id) {
      consumeDownloadJob(metadata.jobId)
      if (replacement.replaced) {
        await runAutoSyncAfterAttachment(nextSession.id)
      }
    }
  }

  const switchSession = async (sessionId: string): Promise<void> => {
    if (sessionId === activeSession?.id && appView === 'player') return
    controllerRef.current?.pause()
    await flushCurrentSessionPosition()
    if (movieWindowActive) {
      await closeMovieWindowForModeChange()
      destroyRemoteMovieAdapter()
      setMovieWindowActive(false)
      await persist({ isMoviePoppedOut: false })
    }
    setSyncState('paused')
    let nextSession = commitLibrary(await window.watchAlong.setActiveSession(sessionId))
    if (nextSession?.isMoviePoppedOut) {
      nextSession = commitLibrary(await window.watchAlong.saveActiveSession({ isMoviePoppedOut: false }))
    }
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setSetupMode(false)
    setCommandPanelOpen(false)
    setAppView(nextSession ? 'player' : 'library')
    if (nextSession) finishViewTransition()
    await refreshMediaUrls(nextSession?.id ?? null)
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
    const currentReactor = current ? deriveReactorIdentity(current) : null
    setRenameTargetId(sessionId)
    setRenameInitialFocus(initialFocus)
    setRenameDraft(current?.title ?? '')
    setRenameReactorDraft(current?.reactorName ?? (currentReactor?.known ? currentReactor.label : ''))
  }

  const cancelRenameSession = (): void => {
    setRenameTargetId(null)
    setRenameInitialFocus('title')
    setRenameDraft('')
    setRenameReactorDraft('')
    restoreSessionDialogFocus()
  }

  const confirmRenameSession = async (): Promise<void> => {
    if (!renameTargetId || !renameDraft.trim()) return
    const current = library.sessions.find((item) => item.id === renameTargetId)
    const currentReactor = current ? deriveReactorIdentity(current) : null
    const reactorDraft = renameReactorDraft.trim()
    const reactorUpdate = current?.reactorName == null && currentReactor?.known &&
      normalizeReactorDraft(reactorDraft) === normalizeReactorDraft(currentReactor.label)
      ? undefined
      : reactorDraft
    commitLibrary(await window.watchAlong.renameSession(
      renameTargetId,
      renameDraft.trim(),
      reactorUpdate
    ))
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
    if (movieWindowActive && deleteTarget.sessionId === activeSession?.id) await stopDetachedMovie()
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
    requestDeleteSession,
    cancelDeleteSession,
    confirmDeleteSession,
    openSubtitle,
    clearSubtitle
  }
}

function normalizeReactorDraft(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}
