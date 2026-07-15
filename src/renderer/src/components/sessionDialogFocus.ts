import type { KeyboardEvent } from 'react'

export function keepFocusInDialog(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
    'input:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )]
  if (focusable.length === 0) return

  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
