import { useEffect, useLayoutEffect, useState } from 'react'
import type { CabinetTheme, CabinetThemePreference } from '@shared/types'

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

export function useCabinetTheme(preference: CabinetThemePreference): CabinetTheme {
  const [systemTheme, setSystemTheme] = useState<CabinetTheme>(readSystemTheme)
  const resolvedTheme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const media = window.matchMedia(SYSTEM_THEME_QUERY)
    const updateSystemTheme = (): void => setSystemTheme(media.matches ? 'mahogany' : 'oak')
    updateSystemTheme()
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  useLayoutEffect(() => {
    const root = document.documentElement
    const colorScheme = resolvedTheme === 'mahogany' ? 'dark' : 'light'
    root.dataset.cabinet = resolvedTheme
    root.style.colorScheme = colorScheme

    return () => {
      if (root.dataset.cabinet === resolvedTheme) delete root.dataset.cabinet
      if (root.style.colorScheme === colorScheme) root.style.removeProperty('color-scheme')
    }
  }, [resolvedTheme])

  return resolvedTheme
}

export function useStoredCabinetTheme(): CabinetTheme {
  const [preference, setPreference] = useState<CabinetThemePreference>('system')
  const resolvedTheme = useCabinetTheme(preference)

  useEffect(() => {
    let mounted = true
    let receivedLivePreference = false
    const unsubscribe = window.watchAlong.onCabinetThemePreference((nextPreference) => {
      receivedLivePreference = true
      if (mounted) setPreference(nextPreference)
    })

    void window.watchAlong.getCabinetThemePreference()
      .then((storedPreference) => {
        if (mounted && !receivedLivePreference) setPreference(storedPreference)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return resolvedTheme
}

function readSystemTheme(): CabinetTheme {
  return typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_THEME_QUERY).matches
    ? 'mahogany'
    : 'oak'
}
