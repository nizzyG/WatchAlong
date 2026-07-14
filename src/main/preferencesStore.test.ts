import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizePreferences, PreferencesStore } from './preferencesStore'

describe('preferences', () => {
  it('normalizes onboarding preferences', () => {
    const downloadDirectory = resolve('Downloads')
    expect(normalizePreferences(null)).toEqual({
      hasCompletedOnboarding: false,
      openLibraryOnLaunch: true,
      libraryView: 'grid',
      reactionDownloadDirectory: null,
      cabinetTheme: 'system'
    })
    expect(
      normalizePreferences({
        hasCompletedOnboarding: true,
        openLibraryOnLaunch: false,
        libraryView: 'list',
        reactionDownloadDirectory: downloadDirectory,
        cabinetTheme: 'oak'
      })
    ).toEqual({
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: false,
      libraryView: 'list',
      reactionDownloadDirectory: downloadDirectory,
      cabinetTheme: 'oak'
    })
    expect(normalizePreferences({ reactionDownloadDirectory: '..\\network-share' }).reactionDownloadDirectory).toBeNull()
    expect(normalizePreferences({ cabinetTheme: 'midnight' }).cabinetTheme).toBe('system')
  })

  it('persists an explicit cabinet while old preference files default to system', () => {
    const root = mkdtempSync(join(tmpdir(), 'watchalong-cabinet-preference-'))
    const path = join(root, 'preferences.json')
    try {
      const store = new PreferencesStore(path)
      expect(store.read().cabinetTheme).toBe('system')
      expect(store.setPreference('cabinetTheme', 'mahogany').cabinetTheme).toBe('mahogany')
      expect(new PreferencesStore(path).read().cabinetTheme).toBe('mahogany')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
