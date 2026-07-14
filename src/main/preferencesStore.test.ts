import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { normalizePreferences } from './preferencesStore'

describe('preferences', () => {
  it('normalizes onboarding preferences', () => {
    const downloadDirectory = resolve('Downloads')
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
        reactionDownloadDirectory: downloadDirectory
      })
    ).toEqual({
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: false,
      libraryView: 'list',
      reactionDownloadDirectory: downloadDirectory
    })
    expect(normalizePreferences({ reactionDownloadDirectory: '..\\network-share' }).reactionDownloadDirectory).toBeNull()
  })
})
