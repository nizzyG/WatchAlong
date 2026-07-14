export interface KeyboardShortcutHelpItem {
  keys: string[]
  label: string
  separator?: 'plus' | 'or'
}

export interface KeyboardShortcutHelpGroup {
  id: 'global' | 'player' | 'command-panel'
  label: string
  items: KeyboardShortcutHelpItem[]
}

/**
 * The user-facing shortcut catalog lives beside the keyboard matching helpers
 * so the Command Panel cannot silently drift away from the implemented keys.
 */
export const keyboardShortcutHelpGroups: KeyboardShortcutHelpGroup[] = [
  {
    id: 'global',
    label: 'Library or player',
    items: [
      { keys: ['Ctrl', 'Shift', 'P'], label: 'Open or close the Command Panel' }
    ]
  },
  {
    id: 'player',
    label: 'During playback',
    items: [
      { keys: ['Space'], label: 'Play or pause' },
      { keys: ['←', '→'], label: 'Seek back or forward 5 seconds', separator: 'or' },
      { keys: ['R'], label: 'Mute or unmute the reaction' },
      { keys: ['M'], label: 'Mute or unmute the movie' },
      { keys: ['P'], label: 'Show or hide the movie picture-in-picture' },
      { keys: ['F'], label: 'Enter or exit fullscreen' },
      { keys: ['[', ']'], label: 'Adjust sync by 0.1 seconds', separator: 'or' }
    ]
  },
  {
    id: 'command-panel',
    label: 'Inside the Command Panel',
    items: [
      { keys: ['↑', '↓'], label: 'Move to the next or previous control', separator: 'or' },
      { keys: ['Tab', 'Shift+Tab'], label: 'Move between controls without leaving the panel', separator: 'or' },
      { keys: ['Enter'], label: 'Use the focused control' },
      { keys: ['Esc'], label: 'Close the Command Panel' }
    ]
  }
]

export function isCommandPanelShortcut(event: KeyboardEvent): boolean {
  return event.code === 'KeyP'
    && event.ctrlKey
    && event.shiftKey
    && !event.altKey
    && !event.metaKey
}

export function hasPlaybackShortcutModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.shiftKey || event.altKey || event.metaKey
}

export function isRepeatedToggleShortcut(event: KeyboardEvent): boolean {
  return event.repeat && ['Space', 'KeyR', 'KeyM', 'KeyP', 'KeyF'].includes(event.code)
}

/**
 * Playback shortcuts should never steal keystrokes from something the user is
 * editing or operating. This deliberately includes contenteditable and ARIA
 * widgets in addition to native form controls.
 */
export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest([
    'input',
    'textarea',
    'select',
    'button',
    'summary',
    'a[href]',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="slider"]',
    '[role="textbox"]'
  ].join(', ')))
}
