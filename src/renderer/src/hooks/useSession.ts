import { useRef, useState } from 'react'
import { createDefaultLibrary, createDefaultSession } from '@shared/session'
import type { AppPreferences, LibrarySession, SavedPatreonSessionStatus, SessionLibrary } from '@shared/types'
import type { CommandPanelSection } from '../components/CommandPanel'
import type { RenameSessionFocus } from '../components/RenameSessionDialog'

export type AppView = 'loading' | 'startup-error' | 'library' | 'player'

export const DEFAULT_PREFERENCES: AppPreferences = {
  hasCompletedOnboarding: false,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null,
  cabinetTheme: 'system'
}

export function useSession() {
  const appShellRef = useRef<HTMLElement>(null)
  const sessionRef = useRef<LibrarySession>(createDefaultSession())
  const activeSessionIdRef = useRef<string | null>(null)
  const commandPanelButtonRef = useRef<HTMLButtonElement>(null)
  const commandPanelReturnFocusRef = useRef<HTMLElement | null>(null)
  const sessionDialogReturnFocusRef = useRef<HTMLElement | null>(null)
  const resumeAfterRepairRef = useRef(false)

  const [emptySession] = useState(() => createDefaultSession())
  const [library, setLibrary] = useState<SessionLibrary>(() => createDefaultLibrary())
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [appView, setAppView] = useState<AppView>('loading')
  const [startupError, setStartupError] = useState<string | null>(null)
  const [startupRecoveryAvailable, setStartupRecoveryAvailable] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [wizardDimmed, setWizardDimmed] = useState(false)
  const [commandPanelOpen, setCommandPanelOpen] = useState(false)
  const [expandedPanelSection, setExpandedPanelSection] = useState<CommandPanelSection>('now-playing')
  const [patreonStatus, setPatreonStatus] = useState<SavedPatreonSessionStatus>({ available: false, canEncrypt: false })
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const [renameInitialFocus, setRenameInitialFocus] = useState<RenameSessionFocus>('title')
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; returnToLibrary: boolean } | null>(null)

  return {
    appShellRef, sessionRef, activeSessionIdRef, commandPanelButtonRef, commandPanelReturnFocusRef,
    sessionDialogReturnFocusRef,
    resumeAfterRepairRef, emptySession, library, setLibrary, preferences, setPreferences, appView,
    setAppView, startupError, setStartupError, startupRecoveryAvailable, setStartupRecoveryAvailable,
    showWelcome, setShowWelcome, wizardDimmed,
    setWizardDimmed, commandPanelOpen, setCommandPanelOpen, expandedPanelSection,
    setExpandedPanelSection, patreonStatus, setPatreonStatus, renameTargetId, setRenameTargetId,
    renameInitialFocus, setRenameInitialFocus,
    renameDraft, setRenameDraft, deleteTarget, setDeleteTarget
  }
}

export type SessionHook = ReturnType<typeof useSession>
