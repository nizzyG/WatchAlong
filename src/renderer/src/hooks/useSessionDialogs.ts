import type {
  LibrarySession,
  ReactorAssignmentRequest,
  SessionLibrary
} from '@shared/types'
import type { RenameSessionFocus } from '../components/RenameSessionDialog'
import type { DetachedMovieTransitionPolicy } from './useMovieWindow'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'

interface UseSessionDialogsOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  activeSession: LibrarySession | null
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  refreshMediaUrls: (sessionId: string | null) => Promise<void>
  closeDetachedMovieForTransition: (policy: DetachedMovieTransitionPolicy) => Promise<void>
}

export function useSessionDialogs({
  playback,
  sessionState,
  activeSession,
  commitLibrary,
  refreshMediaUrls,
  closeDetachedMovieForTransition
}: UseSessionDialogsOptions) {
  const {
    appShellRef,
    sessionDialogReturnFocusRef,
    library,
    appView,
    setAppView,
    renameTargetId,
    setRenameTargetId,
    setRenameInitialFocus,
    renameDraft,
    setRenameDraft,
    deleteTarget,
    setDeleteTarget
  } = sessionState

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
    playback.setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    playback.setMoviePosition(0)
    if (!nextSession || shouldReturnToLibrary) {
      setAppView('library')
      await refreshMediaUrls(null)
      return
    }
    if (appView === 'player') await refreshMediaUrls(nextSession.id)
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
    requestRenameSession,
    cancelRenameSession,
    confirmRenameSession,
    confirmReactorAssignment,
    requestDeleteSession,
    cancelDeleteSession,
    confirmDeleteSession
  }
}
