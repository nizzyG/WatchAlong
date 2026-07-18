import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LibrarySession } from '@shared/types'

export function useLibraryDetailNavigation(
  sessions: readonly LibrarySession[],
  focusScopeKey: string
) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const cardButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const returnSessionIdRef = useRef<string | null>(null)
  const lastFocusedSessionIdRef = useRef<string | null>(null)
  const lastFocusedCardIndexRef = useRef(0)
  const detailBackButtonRef = useRef<HTMLButtonElement>(null)
  const emptyActionRef = useRef<HTMLButtonElement>(null)
  const appliedFocusScopeRef = useRef<string | null>(null)
  const sessionIdsKey = useMemo(() => sessions.map((session) => session.id).join('\u0000'), [sessions])
  const previousSessionIdsKeyRef = useRef(sessionIdsKey)
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  )

  const registerCardButton = useCallback((sessionId: string, button: HTMLButtonElement | null): void => {
    if (button) cardButtonsRef.current.set(sessionId, button)
    else cardButtonsRef.current.delete(sessionId)
  }, [])

  const openDetail = useCallback((sessionId: string): void => {
    returnSessionIdRef.current = sessionId
    setSelectedSessionId(sessionId)
  }, [])

  const noteCardFocus = useCallback((sessionId: string): void => {
    lastFocusedSessionIdRef.current = sessionId
    const button = cardButtonsRef.current.get(sessionId)
    const cardIndex = button ? registeredButtonsInDomOrder(cardButtonsRef.current).indexOf(button) : -1
    if (cardIndex >= 0) lastFocusedCardIndexRef.current = cardIndex
  }, [])

  const closeDetail = useCallback((restoreFocus = true): void => {
    const returnSessionId = returnSessionIdRef.current
    setSelectedSessionId(null)
    if (!restoreFocus || !returnSessionId) return
    window.requestAnimationFrame(() => cardButtonsRef.current.get(returnSessionId)?.focus())
  }, [])

  useEffect(() => {
    if (!selectedSessionId || selectedSession) return
    closeDetail(false)
  }, [closeDetail, selectedSession, selectedSessionId])

  useEffect(() => {
    if (!selectedSession) return
    window.requestAnimationFrame(() => detailBackButtonRef.current?.focus())
  }, [selectedSession])

  useEffect(() => {
    if (selectedSession || appliedFocusScopeRef.current === focusScopeKey) return
    const rememberedSessionId = lastFocusedSessionIdRef.current
    const focusSessionId = rememberedSessionId && sessionIdsKey.split('\u0000').includes(rememberedSessionId)
      ? rememberedSessionId
      : null
    const restoringRememberedFocus = appliedFocusScopeRef.current !== null && focusSessionId !== null

    // Claim the scope before the animation frame. A library mutation can
    // otherwise schedule a second focus pass while the first is pending and
    // steal focus from a menu or dialog that the user has already opened.
    appliedFocusScopeRef.current = focusScopeKey
    const activeElementAtSchedule = document.activeElement
    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement
      const focusMovedWhileWaiting = activeElement !== activeElementAtSchedule
      const focusIsInsideOverlay = activeElement instanceof HTMLElement
        && activeElement.closest('[role="menu"], [role="dialog"]') !== null
      if (focusIsInsideOverlay || (focusMovedWhileWaiting && hasIntentionalDocumentFocus())) return

      // The session array is storage order, not necessarily the order rendered
      // by the active sort/grouping. Ref registration follows the visible card
      // order, so its first button is the safe no-scroll entry point.
      const target = focusSessionId
        ? cardButtonsRef.current.get(focusSessionId)
        : registeredButtonsInDomOrder(cardButtonsRef.current)[0] ?? emptyActionRef.current
      if (!target) return
      target.focus({ preventScroll: true })
      if (restoringRememberedFocus) revealFocusedCard(target)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusScopeKey, selectedSession, sessionIdsKey])

  useEffect(() => {
    const previousSessionIdsKey = previousSessionIdsKeyRef.current
    previousSessionIdsKeyRef.current = sessionIdsKey
    if (previousSessionIdsKey === sessionIdsKey || selectedSession) return

    // Dialog focus restoration is also scheduled on the next frame. Recover
    // one frame later so a deleted return target cannot leave focus on the app
    // shell, while a still-open menu or dialog remains untouched.
    let recoveryFrame = 0
    const settleFrame = window.requestAnimationFrame(() => {
      recoveryFrame = window.requestAnimationFrame(() => {
        if (hasIntentionalDocumentFocus()) return
        const buttons = registeredButtonsInDomOrder(cardButtonsRef.current)
        const targetIndex = Math.min(lastFocusedCardIndexRef.current, Math.max(0, buttons.length - 1))
        const target = buttons[targetIndex] ?? buttons[0] ?? emptyActionRef.current
        if (!target) return
        target.focus({ preventScroll: true })
        revealFocusedCard(target)
      })
    })

    return () => {
      window.cancelAnimationFrame(settleFrame)
      if (recoveryFrame) window.cancelAnimationFrame(recoveryFrame)
    }
  }, [selectedSession, sessionIdsKey])

  return {
    selectedSession,
    detailBackButtonRef,
    emptyActionRef,
    registerCardButton,
    noteCardFocus,
    openDetail,
    closeDetail
  }
}

function registeredButtonsInDomOrder(
  buttonsBySession: ReadonlyMap<string, HTMLButtonElement>
): HTMLButtonElement[] {
  return [...buttonsBySession.values()]
    .filter((button) => button.isConnected)
    .sort((left, right) => {
      const position = left.compareDocumentPosition(right)
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
}

function revealFocusedCard(target: HTMLElement): void {
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function hasIntentionalDocumentFocus(): boolean {
  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement) || !activeElement.isConnected) return false
  if (activeElement === document.body || activeElement === document.documentElement) return false
  return !activeElement.classList.contains('app-shell')
}
