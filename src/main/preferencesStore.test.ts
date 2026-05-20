import { describe, expect, it } from 'vitest'
import { normalizePreferences } from './preferencesStore'

describe('preferences', () => {
  it('normalizes onboarding preferences', () => {
    expect(normalizePreferences(null)).toEqual({
      hasCompletedOnboarding: false,
      openLibraryOnLaunch: true,
      libraryView: 'grid',
      reactionDownloadDirectory: null
    })
    expect(
      normalizePreferences({
        hasCompletedOnboarding: true,
        openLibraryOnLaunch: false,
        libraryView: 'list',
        reactionDownloadDirectory: 'C:\\Downloads'
      })
    ).toEqual({
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: false,
      libraryView: 'list',
      reactionDownloadDirectory: 'C:\\Downloads'
    })
  })
})
