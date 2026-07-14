import { describe, expect, it } from 'vitest'
import {
  hasPlaybackShortcutModifier,
  isCommandPanelShortcut,
  isFullscreenShortcut,
  isInteractiveShortcutTarget,
  isRepeatedToggleShortcut,
  keyboardShortcutHelpGroups
} from './keyboardShortcuts'

describe('keyboard shortcuts', () => {
  it('matches only the exact Command Panel chord', () => {
    expect(isCommandPanelShortcut(new KeyboardEvent('keydown', {
      code: 'KeyP',
      ctrlKey: true,
      shiftKey: true
    }))).toBe(true)
    expect(isCommandPanelShortcut(new KeyboardEvent('keydown', {
      code: 'KeyP',
      ctrlKey: true,
      shiftKey: true,
      altKey: true
    }))).toBe(false)
    expect(isCommandPanelShortcut(new KeyboardEvent('keydown', {
      code: 'KeyP',
      metaKey: true,
      shiftKey: true
    }))).toBe(false)
  })

  it('matches only the exact Alt+Enter fullscreen chord', () => {
    expect(isFullscreenShortcut(new KeyboardEvent('keydown', {
      code: 'Enter',
      altKey: true
    }))).toBe(true)
    expect(isFullscreenShortcut(new KeyboardEvent('keydown', {
      code: 'KeyF'
    }))).toBe(false)

    for (const modifier of ['ctrlKey', 'shiftKey', 'metaKey'] as const) {
      expect(isFullscreenShortcut(new KeyboardEvent('keydown', {
        code: 'Enter',
        altKey: true,
        [modifier]: true
      }))).toBe(false)
    }
  })

  it('recognizes every modifier that should suppress a playback key', () => {
    for (const modifier of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey'] as const) {
      expect(hasPlaybackShortcutModifier(new KeyboardEvent('keydown', {
        code: 'KeyM',
        [modifier]: true
      }))).toBe(true)
    }
    expect(hasPlaybackShortcutModifier(new KeyboardEvent('keydown', { code: 'KeyM' }))).toBe(false)
  })

  it('suppresses key-repeat for toggles but keeps repeatable seek and sync keys', () => {
    for (const code of ['Space', 'KeyR', 'KeyM', 'KeyP']) {
      expect(isRepeatedToggleShortcut(new KeyboardEvent('keydown', { code, repeat: true }))).toBe(true)
    }
    expect(isRepeatedToggleShortcut(new KeyboardEvent('keydown', {
      code: 'Enter',
      altKey: true,
      repeat: true
    }))).toBe(true)
    for (const code of ['ArrowLeft', 'ArrowRight', 'BracketLeft', 'BracketRight', 'Enter', 'KeyF']) {
      expect(isRepeatedToggleShortcut(new KeyboardEvent('keydown', { code, repeat: true }))).toBe(false)
    }
  })

  it('protects native controls, ARIA widgets, links, and editors', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    const fixtures = [
      document.createElement('input'),
      document.createElement('button'),
      document.createElement('summary'),
      Object.assign(document.createElement('a'), { href: '#help' }),
      editor,
      slider
    ]

    for (const fixture of fixtures) {
      document.body.appendChild(fixture)
      expect(isInteractiveShortcutTarget(fixture)).toBe(true)
      fixture.remove()
    }

    expect(isInteractiveShortcutTarget(document.createElement('div'))).toBe(false)
  })

  it('keeps every supported binding in the published catalog', () => {
    expect(keyboardShortcutHelpGroups.flatMap((group) => group.items.map((item) => item.label))).toEqual([
      'Open or close the Command Panel',
      'Enter or exit fullscreen',
      'Play or pause',
      'Seek back or forward 5 seconds',
      'Mute or unmute the reaction',
      'Mute or unmute the movie',
      'Show or hide the movie picture-in-picture',
      'Adjust sync by 0.1 seconds',
      'Scroll through panel content',
      'Move between controls without leaving the panel',
      'Use the focused control',
      'Close the Command Panel'
    ])

    expect(keyboardShortcutHelpGroups
      .flatMap((group) => group.items)
      .find((item) => item.label === 'Enter or exit fullscreen')?.keys
    ).toEqual(['Alt', 'Enter'])
    expect(keyboardShortcutHelpGroups
      .find((group) => group.id === 'global')?.items
      .some((item) => item.label === 'Enter or exit fullscreen')
    ).toBe(true)
  })
})
