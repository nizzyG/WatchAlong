import { useEffect, type MutableRefObject } from 'react'
import {
  hasPlaybackShortcutModifier,
  isCommandPanelShortcut,
  isFullscreenShortcut,
  isInteractiveShortcutTarget,
  isRepeatedToggleShortcut
} from '../keyboardShortcuts'
import type { AppView } from './useSession'

export interface KeyboardShortcutContext {
  autoSyncRollInSessionId: string | null
  autoSyncRunningSessionId: string | null
  appView: AppView
  commandPanelOpen: boolean
  setupModeRef: MutableRefObject<boolean>
  toggleCommandPanel: (returnFocusTarget?: HTMLElement | null) => void
  closeCommandPanel: () => void
  movePanelFocus: (delta: number) => void
  toggleFullscreen: () => void
  toggleReactionMute: () => void
  toggleMovieMute: () => void
  togglePipVisibility: () => void
  togglePlayPause: () => void
  seekBy: (deltaSeconds: number) => void
  nudgeOffset: (deltaSeconds: number) => Promise<void>
}

/**
 * Registers application keyboard shortcuts against the latest render context.
 *
 * The caller deliberately supplies a getter rather than a snapshot. The effect
 * is re-registered after every render, matching the controller's original
 * behavior and avoiding stale playback, panel, and session callbacks.
 */
export function useKeyboardShortcuts(
  getContext: () => KeyboardShortcutContext
): void {
  // Intentionally no dependency array; see the contract above.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const {
        autoSyncRollInSessionId,
        autoSyncRunningSessionId,
        appView,
        commandPanelOpen,
        setupModeRef,
        toggleCommandPanel,
        closeCommandPanel,
        movePanelFocus,
        toggleFullscreen,
        toggleReactionMute,
        toggleMovieMute,
        togglePipVisibility,
        togglePlayPause,
        seekBy,
        nudgeOffset
      } = getContext()
      const target = event.target instanceof HTMLElement ? event.target : null
      const targetOwnsValueKeys = Boolean(target?.closest([
        'input',
        'textarea',
        'select',
        '[contenteditable]:not([contenteditable="false"])',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="slider"]',
        '[role="spinbutton"]',
        '[role="textbox"]'
      ].join(', ')))

      if (autoSyncRollInSessionId || autoSyncRunningSessionId) {
        if (target?.closest('.auto-sync-rollin-overlay')) {
          return
        }
        event.preventDefault()
        return
      }

      if (isCommandPanelShortcut(event) && (appView === 'library' || appView === 'player')) {
        event.preventDefault()
        if (event.repeat) return
        toggleCommandPanel(target)
        return
      }

      if (commandPanelOpen) {
        if (event.code === 'Escape') {
          event.preventDefault()
          closeCommandPanel()
          return
        }

        if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
          const panelContent = document.querySelector<HTMLElement>('.command-panel-content')
          if (panelContent && !targetOwnsValueKeys) {
            event.preventDefault()
            panelContent.scrollTop += event.code === 'ArrowDown' ? 64 : -64
          }
          return
        }

        if (event.code === 'Tab') {
          event.preventDefault()
          movePanelFocus(event.shiftKey ? -1 : 1)
          return
        }

        // Tab owns focus travel. Arrow keys scroll the panel unless the
        // focused control has its own arrow-key value or caret behavior.
        return
      }

      if (
        (appView === 'library' || appView === 'player') &&
        !targetOwnsValueKeys &&
        isFullscreenShortcut(event)
      ) {
        event.preventDefault()
        if (event.repeat) return
        toggleFullscreen()
        return
      }

      if (appView !== 'player' || isInteractiveShortcutTarget(event.target)) {
        return
      }

      if (hasPlaybackShortcutModifier(event) || isRepeatedToggleShortcut(event)) return

      if (event.code === 'KeyR') {
        event.preventDefault()
        toggleReactionMute()
        return
      } else if (event.code === 'KeyM') {
        event.preventDefault()
        toggleMovieMute()
        return
      } else if (event.code === 'KeyP') {
        event.preventDefault()
        togglePipVisibility()
        return
      }

      // Sync Setup owns Space, seek, and timing-nudge keys because its two
      // timelines move independently. Window-level controls remain available.
      if (setupModeRef.current) return

      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayPause()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        seekBy(-5)
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        seekBy(5)
      } else if (event.code === 'BracketLeft') {
        event.preventDefault()
        void nudgeOffset(-0.1)
      } else if (event.code === 'BracketRight') {
        event.preventDefault()
        void nudgeOffset(0.1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
}
