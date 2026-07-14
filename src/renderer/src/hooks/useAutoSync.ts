import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutoSyncCompleteEvent, AutoSyncIntent, AutoSyncProgressEvent } from '@shared/types'

interface PendingAutoSync {
  sessionId: string
  intent: AutoSyncIntent
  resolve: (event: AutoSyncCompleteEvent) => void
  promise: Promise<AutoSyncCompleteEvent>
}

const initialProgress: AutoSyncProgressEvent = {
  sessionId: '',
  phase: 'preparing',
  percent: 0,
  message: 'Getting ready…'
}

export function useAutoSync() {
  const pendingRef = useRef<PendingAutoSync | null>(null)
  const [progress, setProgress] = useState(initialProgress)
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null)

  useEffect(() => {
    const removeProgress = window.watchAlong.onAutoSyncProgress((event) => {
      if (pendingRef.current?.sessionId === event.sessionId) setProgress(event)
    })
    const removeComplete = window.watchAlong.onAutoSyncComplete((event) => {
      const pending = pendingRef.current
      if (!pending || pending.sessionId !== event.sessionId) return
      pendingRef.current = null
      setRunningSessionId(null)
      setProgress((current) => ({ ...current, percent: 100, message: event.message }))
      pending.resolve(event)
    })
    return () => {
      removeProgress()
      removeComplete()
      pendingRef.current = null
    }
  }, [])

  const start = useCallback(async (sessionId: string, intent: AutoSyncIntent): Promise<AutoSyncCompleteEvent> => {
    const existing = pendingRef.current
    if (existing) {
      if (existing.sessionId === sessionId && existing.intent === intent) return existing.promise
      return {
        sessionId,
        outcome: 'cancelled',
        message: 'Another automatic sync check is already running.'
      }
    }

    let resolveCompletion!: (event: AutoSyncCompleteEvent) => void
    const completion = new Promise<AutoSyncCompleteEvent>((resolve) => {
      resolveCompletion = resolve
    })
    // Set the ref before the first state update/await so two starts in the same
    // event turn cannot replace one another's resolver.
    pendingRef.current = { sessionId, intent, resolve: resolveCompletion, promise: completion }
    setRunningSessionId(sessionId)
    setProgress({ ...initialProgress, sessionId })
    let result
    try {
      result = await window.watchAlong.startSessionAutoSync(sessionId, intent)
    } catch {
      result = { started: false as const, reason: 'tools-unavailable' as const }
    }
    if (!result.started && result.reason !== 'already-running') {
      const event: AutoSyncCompleteEvent = {
        sessionId,
        outcome: 'fallback',
        message: result.reason === 'tools-unavailable'
          ? 'Automatic sync is unavailable on this installation. You can line it up manually.'
          : 'WatchAlong could not start automatic sync. You can line it up manually.'
      }
      const pending = pendingRef.current
      pendingRef.current = null
      setRunningSessionId(null)
      setProgress({ ...initialProgress, sessionId, percent: 100, message: event.message })
      pending?.resolve(event)
    }
    return completion
  }, [])

  const cancel = useCallback(async (): Promise<void> => {
    const sessionId = pendingRef.current?.sessionId
    if (sessionId) await window.watchAlong.cancelSessionAutoSync(sessionId)
  }, [])

  return { progress, runningSessionId, start, cancel }
}
