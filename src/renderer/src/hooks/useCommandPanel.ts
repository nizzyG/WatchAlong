import { useEffect } from 'react'
import type { SessionHook } from './useSession'

const COMMAND_PANEL_FOCUSABLE_SELECTOR = [
  '.command-panel button:not(:disabled)',
  '.command-panel input:not(:disabled)',
  '.command-panel select:not(:disabled)',
  '.command-panel textarea:not(:disabled)',
  '.command-panel summary',
  '.command-panel a[href]',
  '.command-panel [tabindex="0"]'
].join(', ')

interface UseCommandPanelOptions {
  sessionState: SessionHook
}

export function useCommandPanel({ sessionState }: UseCommandPanelOptions) {
  const {
    appShellRef,
    commandPanelButtonRef,
    commandPanelReturnFocusRef,
    commandPanelOpen,
    setCommandPanelOpen
  } = sessionState

  useEffect(() => {
    if (!commandPanelOpen) return

    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-command-panel-close]')?.focus()
    })
  }, [commandPanelOpen])

  const focusPlayerFallback = (): void => {
    if (commandPanelButtonRef.current?.isConnected) commandPanelButtonRef.current.focus()
    else appShellRef.current?.focus()
  }

  const openCommandPanel = (returnFocusTarget?: HTMLElement | null): void => {
    commandPanelReturnFocusRef.current = returnFocusTarget ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : commandPanelButtonRef.current
    )
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
    const currentIndex = document.activeElement instanceof HTMLElement
      ? focusable.indexOf(document.activeElement)
      : -1
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + delta + focusable.length) % focusable.length
    focusable[nextIndex]?.focus()
  }

  return {
    closeCommandPanel,
    toggleCommandPanel,
    movePanelFocus
  }
}

function isVisibleCommandPanelControl(element: HTMLElement): boolean {
  const closedDetails = element.closest<HTMLDetailsElement>('details:not([open])')
  if (!closedDetails) return true
  return element.tagName === 'SUMMARY' && element.parentElement === closedDetails
}
