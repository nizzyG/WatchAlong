import { UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LibrarySession } from '@shared/types'

export function ReactorAvatar({
  session,
  label,
  size = 'card'
}: {
  session: LibrarySession
  label: string
  size?: 'card' | 'group'
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retryTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setImageFailed(false)
    setAttempt(0)
    return () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [session.id, session.updatedAt])

  const initials = reactorInitials(label)
  const imageUrl = `watchalong://media/${encodeURIComponent(session.id)}/reactor-avatar?v=${encodeURIComponent(session.updatedAt)}-${attempt}`

  const retryImage = (): void => {
    if (retryTimerRef.current !== null) return
    setImageFailed(true)
    const retryDelays = [1_500, 4_000, 8_000]
    const delay = retryDelays[attempt]
    if (delay === undefined) {
      return
    }

    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      setAttempt((current) => current + 1)
      setImageFailed(false)
    }, delay)
  }

  return (
    <span className={`reactor-avatar reactor-avatar-${size}`} aria-hidden>
      <span className="reactor-avatar-fallback">
        {initials ? <span>{initials}</span> : <UserRound size={size === 'group' ? 30 : 34} />}
      </span>
      {!imageFailed && (
        <img
          alt=""
          loading="lazy"
          src={imageUrl}
          onError={retryImage}
        />
      )}
    </span>
  )
}

function reactorInitials(label: string): string {
  if (!label || label === 'Reactor not identified') {
    return ''
  }

  const words = label
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) {
    return ''
  }

  return `${words[0][0] ?? ''}${words.length > 1 ? words.at(-1)?.[0] ?? '' : ''}`.toLocaleUpperCase()
}
