import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AppPreferences, LibraryViewPreference } from '@shared/types'

const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: false,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null
}

export class PreferencesStore {
  constructor(private readonly preferencesPath: string) {}

  read(): AppPreferences {
    try {
      const raw = readFileSync(this.preferencesPath, 'utf8')
      return normalizePreferences(JSON.parse(raw))
    } catch {
      return { ...defaultPreferences }
    }
  }

  update(patch: Partial<AppPreferences>): AppPreferences {
    const next = normalizePreferences({ ...this.read(), ...patch })
    this.write(next)
    return next
  }

  setPreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): AppPreferences {
    return this.update({ [key]: value } as Partial<AppPreferences>)
  }

  private write(preferences: AppPreferences): void {
    mkdirSync(dirname(this.preferencesPath), { recursive: true })
    const tempPath = `${this.preferencesPath}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8')
    renameSync(tempPath, this.preferencesPath)
  }
}

export function normalizePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object') {
    return { ...defaultPreferences }
  }

  const source = value as Partial<AppPreferences>
  return {
    hasCompletedOnboarding: Boolean(source.hasCompletedOnboarding),
    openLibraryOnLaunch:
      typeof source.openLibraryOnLaunch === 'boolean' ? source.openLibraryOnLaunch : defaultPreferences.openLibraryOnLaunch,
    libraryView: normalizeLibraryView(source.libraryView),
    reactionDownloadDirectory: stringOrNull(source.reactionDownloadDirectory)
  }
}

export function hasPreferencesFile(preferencesPath: string): boolean {
  return existsSync(preferencesPath)
}

function normalizeLibraryView(value: unknown): LibraryViewPreference {
  return value === 'list' || value === 'grid' ? value : defaultPreferences.libraryView
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
