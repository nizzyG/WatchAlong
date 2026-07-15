import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CabinetThemePreference, WatchAlongApi } from '@shared/types'
import { useCabinetTheme, useStoredCabinetTheme } from './useCabinetTheme'

describe('useCabinetTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.cabinet
    document.documentElement.style.removeProperty('color-scheme')
    Reflect.deleteProperty(window, 'watchAlong')
  })

  it('resolves system mode and follows live system appearance changes', () => {
    const media = createColorSchemeMedia(true)
    vi.stubGlobal('matchMedia', media.matchMedia)

    const { result } = renderHook(() => useCabinetTheme('system'))
    expect(result.current).toBe('mahogany')
    expect(document.documentElement).toHaveAttribute('data-cabinet', 'mahogany')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    act(() => media.setDark(false))
    expect(result.current).toBe('oak')
    expect(document.documentElement).toHaveAttribute('data-cabinet', 'oak')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('keeps a manual cabinet choice while tracking the latest system preference', () => {
    const media = createColorSchemeMedia(false)
    vi.stubGlobal('matchMedia', media.matchMedia)

    const { result, rerender } = renderHook(
      ({ preference }: { preference: CabinetThemePreference }) => useCabinetTheme(preference),
      { initialProps: { preference: 'mahogany' as CabinetThemePreference } }
    )
    expect(result.current).toBe('mahogany')

    act(() => media.setDark(true))
    expect(result.current).toBe('mahogany')

    rerender({ preference: 'system' })
    expect(result.current).toBe('mahogany')
    expect(document.documentElement).toHaveAttribute('data-cabinet', 'mahogany')
  })

  it('loads and follows cabinet preferences in auxiliary windows', async () => {
    const media = createColorSchemeMedia(true)
    const listeners = new Set<(preference: CabinetThemePreference) => void>()
    vi.stubGlobal('matchMedia', media.matchMedia)
    window.watchAlong = {
      getCabinetThemePreference: vi.fn(async () => 'oak'),
      onCabinetThemePreference: vi.fn((listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      })
    } as unknown as WatchAlongApi

    const { result } = renderHook(() => useStoredCabinetTheme())
    await waitFor(() => expect(result.current).toBe('oak'))
    expect(document.documentElement).toHaveAttribute('data-cabinet', 'oak')

    act(() => listeners.forEach((listener) => listener('mahogany')))
    expect(result.current).toBe('mahogany')
    expect(document.documentElement).toHaveAttribute('data-cabinet', 'mahogany')
  })
})

function createColorSchemeMedia(initialDark: boolean): {
  matchMedia: (query: string) => MediaQueryList
  setDark: (matches: boolean) => void
} {
  let matches = initialDark
  const listeners = new Set<() => void>()
  const media = {
    get matches() { return matches },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  } as unknown as MediaQueryList

  return {
    matchMedia: vi.fn(() => media),
    setDark(next) {
      matches = next
      listeners.forEach((listener) => listener())
    }
  }
}
