import { describe, expect, it } from 'vitest'
import {
  hasPlaybackShortcutModifier,
  isCommandPanelShortcut,
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
    for (const code of ['Space', 'KeyR', 'KeyM', 'KeyP', 'KeyF']) {
      expect(isRepeatedToggleShortcut(new KeyboardEvent('keydown', { code, repeat: true }))).toBe(true)
    }
    for (const code of ['ArrowLeft', 'ArrowRight', 'BracketLeft', 'BracketRight']) {
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
      'Play or pause',
      'Seek back or forward 5 seconds',
      'Mute or unmute the reaction',
      'Mute or unmute the movie',
      'Show or hide the movie picture-in-picture',
      'Enter or exit fullscreen',
      'Adjust sync by 0.1 seconds',
      'Move to the next or previous control',
      'Move between controls without leaving the panel',
      'Use the focused control',
      'Close the Command Panel'
    ])
  })
})
