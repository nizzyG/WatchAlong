import { useCallback, useEffect, useRef, useState } from 'react'

export const PLAYER_OSD_HIDE_DELAY_MS = 3_000

interface UsePlayerOsdOptions {
  active: boolean
  suspended: boolean
  forceVisible?: boolean
}

/** Owns the player chrome's visibility and interaction locks. */
export function usePlayerOsd({
  active,
  suspended,
  forceVisible = false
}: UsePlayerOsdOptions) {
  const osdRef = useRef<HTMLElement>(null)
  const timerRef = useRef<number | null>(null)
  const previousSuspendedRef = useRef(suspended)
  const [visible, setVisible] = useState(false)
  const [osdTop, setOsdTop] = useState<number | null>(null)
  const [pointerWithin, setPointerWithin] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const locked = forceVisible || pointerWithin || focusWithin
  const displayed = active && !suspended && (visible || forceVisible)
  const contextRef = useRef({ active, suspended, locked })
  contextRef.current = { active, suspended, locked }

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback((): void => {
    clearTimer()
    const current = contextRef.current
    if (!current.active || current.suspended || current.locked) return

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      const latest = contextRef.current
      if (latest.active && !latest.suspended && !latest.locked) setVisible(false)
    }, PLAYER_OSD_HIDE_DELAY_MS)
  }, [clearTimer])

  const reveal = useCallback((): void => {
    const current = contextRef.current
    if (!current.active || current.suspended) return
    setVisible(true)
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => {
    clearTimer()
    if (!active || suspended) {
      setVisible(false)
      setPointerWithin(false)
      setFocusWithin(false)
      return
    }
    if (forceVisible) {
      setVisible(true)
      return
    }
    if (!visible || locked) return

    scheduleHide()
    return clearTimer
  }, [active, clearTimer, forceVisible, locked, scheduleHide, suspended, visible])

  useEffect(() => {
    if (!displayed) {
      setOsdTop(null)
      return
    }

    const element = osdRef.current
    if (!element) return

    const measure = (): void => {
      const offsetParent = element.offsetParent
      const parentTop = offsetParent instanceof HTMLElement
        ? offsetParent.getBoundingClientRect().top
        : 0
      const nextTop = parentTop + element.offsetTop
      setOsdTop((current) => current === nextTop ? current : nextTop)
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [displayed])

  useEffect(() => {
    const wasSuspended = previousSuspendedRef.current
    previousSuspendedRef.current = suspended
    if (active && wasSuspended && !suspended) reveal()
  }, [active, reveal, suspended])

  useEffect(() => {
    if (!active || suspended) return

    const markActive = (): void => reveal()
    const revealForFocus = (event: FocusEvent): void => {
      if (event.target instanceof Node && osdRef.current?.contains(event.target)) reveal()
    }

    window.addEventListener('pointermove', markActive)
    window.addEventListener('pointerdown', markActive)
    window.addEventListener('wheel', markActive, { passive: true })
    window.addEventListener('keydown', markActive)
    window.addEventListener('touchstart', markActive, { passive: true })
    window.addEventListener('focusin', revealForFocus)

    return () => {
      window.removeEventListener('pointermove', markActive)
      window.removeEventListener('pointerdown', markActive)
      window.removeEventListener('wheel', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('touchstart', markActive)
      window.removeEventListener('focusin', revealForFocus)
    }
  }, [active, reveal, suspended])

  useEffect(() => clearTimer, [clearTimer])

  return {
    osdRef,
    visible: displayed,
    osdTop,
    reveal,
    interactionProps: {
      onPointerEnter: () => setPointerWithin(true),
      onPointerLeave: () => setPointerWithin(false),
      onFocusCapture: () => setFocusWithin(true),
      onBlurCapture: (event: React.FocusEvent<HTMLElement>) => {
        const next = event.relatedTarget
        setFocusWithin(next instanceof Node && event.currentTarget.contains(next))
      }
    }
  }
}
