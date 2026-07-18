import type { MutableRefObject } from 'react'
import type {
  AppPreferences,
  ImportWizardLaunchOptions,
  LibrarySession,
  SessionLibrary
} from '@shared/types'
import type { MoviePosterActionResult } from '../moviePosterActions'
import type { DownloadsHook } from './useDownloads'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { TransitionToSession } from './useSessionTransition'
import type { DetachedMovieTransitionPolicy } from './useMovieWindow'
import type { SubtitlesHook } from './useSubtitles'
import type { useAutoSync } from './useAutoSync'
import { useCommandPanel } from './useCommandPanel'
import { useMediaAttachment } from './useMediaAttachment'
import { useSessionDialogs } from './useSessionDialogs'

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
    setSetupMode,
    setSetupPlayingRole,
    setSyncState,
    setError,
    setViewTransitioning
  } = playback
  const {
    setPreferences,
    appView,
    setAppView,
    setStartupError,
    setShowWelcome,
    setCommandPanelOpen,
    setPatreonStatus
  } = sessionState

  const mediaAttachment = useMediaAttachment({
    playback,
    sessionState,
    autoSync,
    activeSession,
    currentMovieMoment,
    commitLibrary,
    consumeDownloadJob,
    transitionToSession
  })
  const commandPanel = useCommandPanel({ playback, sessionState })
  const sessionDialogs = useSessionDialogs({
    playback,
    sessionState,
    activeSession,
    commitLibrary,
    refreshMediaUrls,
    closeDetachedMovieForTransition
  })

  const openImportWizard = async (options?: ImportWizardLaunchOptions): Promise<void> => {
    setCommandPanelOpen(false)
    playback.setControlsIdle(false)
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

  const updatePreference = async <K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K]
  ): Promise<void> => {
    setPreferences(await window.watchAlong.setPreference(key, value))
  }

  const chooseDownloadDirectory = async (): Promise<void> => {
    const nextPreferences = await window.watchAlong.selectDownloadDirectory()
    if (nextPreferences) setPreferences(nextPreferences)
  }

  const forgetPatreonSession = async (): Promise<void> => {
    setPatreonStatus(await window.watchAlong.forgetPatreonSession())
  }

  const finishViewTransition = (): void => {
    setViewTransitioning(true)
    window.setTimeout(() => setViewTransitioning(false), VIEW_FADE_MS)
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

  const openSubtitle = async (): Promise<void> => {
    setError(null)
    const next = await window.watchAlong.openSubtitle()
    if (next) commitLibrary(next)
  }

  const clearSubtitle = async (): Promise<void> => {
    commitLibrary(await window.watchAlong.clearSubtitle())
    subtitles.setSubtitleCues([])
  }

  return {
    autoSyncRollInSessionId: mediaAttachment.autoSyncRollInSessionId,
    autoSyncRollInFinalizing: mediaAttachment.autoSyncRollInFinalizing,
    openImportWizard,
    navigateToLibrary,
    openStartupLibrary,
    startWelcomeImport,
    locateMissingMedia: mediaAttachment.locateMissingMedia,
    updatePreference,
    chooseDownloadDirectory,
    forgetPatreonSession,
    useManualSyncDuringRollIn: mediaAttachment.useManualSyncDuringRollIn,
    attachDownloadedReaction: mediaAttachment.attachDownloadedReaction,
    closeCommandPanel: commandPanel.closeCommandPanel,
    toggleCommandPanel: commandPanel.toggleCommandPanel,
    movePanelFocus: commandPanel.movePanelFocus,
    openLocalReaction: mediaAttachment.openLocalReaction,
    handleDownloadedReaction: mediaAttachment.handleDownloadedReaction,
    switchSession,
    chooseMoviePoster,
    clearMoviePoster,
    requestRenameSession: sessionDialogs.requestRenameSession,
    cancelRenameSession: sessionDialogs.cancelRenameSession,
    confirmRenameSession: sessionDialogs.confirmRenameSession,
    confirmReactorAssignment: sessionDialogs.confirmReactorAssignment,
    requestDeleteSession: sessionDialogs.requestDeleteSession,
    cancelDeleteSession: sessionDialogs.cancelDeleteSession,
    confirmDeleteSession: sessionDialogs.confirmDeleteSession,
    openSubtitle,
    clearSubtitle
  }
}
