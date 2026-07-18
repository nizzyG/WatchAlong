import { useCallback, useEffect } from 'react'
import { createDefaultLibrary } from '@shared/session'
import type { AppPreferences, LibrarySession, SessionLibrary } from '@shared/types'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'

const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: false,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null,
  cabinetTheme: 'system'
}

interface UseAppBootstrapOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  refreshMediaUrls: (sessionId: string | null) => Promise<void>
}

export function useAppBootstrap({
  playback,
  sessionState,
  commitLibrary,
  refreshMediaUrls
}: UseAppBootstrapOptions) {
  const { setPosition, setMoviePosition, setError } = playback
  const {
    setPreferences,
    setShowWelcome,
    setAppView,
    setStartupError,
    setStartupRecoveryAvailable
  } = sessionState

  const loadInitialState = useCallback(async (): Promise<void> => {
    setStartupError(null)
    setStartupRecoveryAvailable(false)
    setAppView('loading')
    setError(null)

    const [libraryResult, preferencesResult] = await Promise.allSettled([
      window.watchAlong.getLibrary(),
      window.watchAlong.getPreferences()
    ])

    const loadedLibrary = libraryResult.status === 'fulfilled' ? libraryResult.value : createDefaultLibrary()
    const loadedPreferences = preferencesResult.status === 'fulfilled' ? preferencesResult.value : defaultPreferences
    const loadedSession = commitLibrary(loadedLibrary)
    setPreferences(loadedPreferences)
    setShowWelcome(!loadedPreferences.hasCompletedOnboarding)
    setPosition(loadedSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)

    if (libraryResult.status === 'rejected' || preferencesResult.status === 'rejected') {
      const damagedLibrary = libraryResult.status === 'rejected' &&
        libraryResult.reason instanceof Error &&
        (libraryResult.reason.message.includes('damaged library') ||
          libraryResult.reason.message.includes('recovery file'))
      const libraryMessage = damagedLibrary
        ? 'WatchAlong moved a damaged library to a recovery file so it cannot be overwritten.'
        : 'WatchAlong could not safely open your library. No files were changed.'
      if (damagedLibrary) {
        const recovery = await window.watchAlong.getLibraryRecoveryStatus().catch(() => ({ available: false }))
        setStartupRecoveryAvailable(recovery.available)
      }
      setStartupError(libraryMessage)
      setAppView('startup-error')
      await refreshMediaUrls(null)
      return
    }

    const shouldOpenPlayer = !loadedPreferences.openLibraryOnLaunch && Boolean(loadedSession)
    setAppView(shouldOpenPlayer ? 'player' : 'library')
    await refreshMediaUrls(shouldOpenPlayer ? loadedSession?.id ?? null : null)
  }, [commitLibrary, refreshMediaUrls])

  const revealLibraryRecoveryFile = useCallback(async (): Promise<void> => {
    try {
      const revealed = await window.watchAlong.revealLibraryRecoveryFile()
      if (!revealed) setStartupError('WatchAlong could not find the recovery file. Try Retry once more.')
    } catch {
      setStartupError('WatchAlong could not open the recovery folder. The recovery file is still safe.')
    }
  }, [])

  const startFreshLibraryAfterRecovery = useCallback(async (): Promise<void> => {
    try {
      await window.watchAlong.startFreshLibraryAfterRecovery()
      await loadInitialState()
    } catch {
      setStartupError('WatchAlong could not start a new library. The recovery file is still safe.')
    }
  }, [loadInitialState])

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!mounted) {
        return
      }
      await loadInitialState()
    })()

    return () => {
      mounted = false
    }
  }, [loadInitialState])

  return {
    loadInitialState,
    revealLibraryRecoveryFile,
    startFreshLibraryAfterRecovery
  }
}
