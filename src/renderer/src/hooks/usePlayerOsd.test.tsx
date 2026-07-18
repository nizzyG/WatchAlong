import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAYER_OSD_HIDE_DELAY_MS, usePlayerOsd } from './usePlayerOsd'

describe('usePlayerOsd', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts hidden, reveals on activity, and hides after inactivity even while paused', () => {
    const { result } = renderHook(() => usePlayerOsd({ active: true, suspended: false }))
    expect(result.current.visible).toBe(false)

    act(() => window.dispatchEvent(new MouseEvent('pointermove')))
    expect(result.current.visible).toBe(true)

    act(() => vi.advanceTimersByTime(PLAYER_OSD_HIDE_DELAY_MS))
    expect(result.current.visible).toBe(false)
  })

  it('resets the idle deadline without rerendering on every pointer move', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return usePlayerOsd({ active: true, suspended: false })
    })

    act(() => window.dispatchEvent(new MouseEvent('pointermove')))
    expect(result.current.visible).toBe(true)
    const rendersAfterReveal = renders

    act(() => {
      for (let index = 0; index < 20; index += 1) {
        window.dispatchEvent(new MouseEvent('pointermove'))
      }
    })
    expect(renders).toBe(rendersAfterReveal)

    act(() => vi.advanceTimersByTime(PLAYER_OSD_HIDE_DELAY_MS))
    expect(result.current.visible).toBe(false)
  })

  it('keeps controls visible while the OSD owns pointer or keyboard focus', () => {
    const { result } = renderHook(() => usePlayerOsd({ active: true, suspended: false }))
    act(() => result.current.reveal())
    act(() => result.current.interactionProps.onPointerEnter())
    act(() => vi.advanceTimersByTime(PLAYER_OSD_HIDE_DELAY_MS * 2))
    expect(result.current.visible).toBe(true)

    act(() => result.current.interactionProps.onPointerLeave())
    act(() => vi.advanceTimersByTime(PLAYER_OSD_HIDE_DELAY_MS))
    expect(result.current.visible).toBe(false)
  })

  it('pins setup controls and suppresses chrome behind the control panel', () => {
    const { result, rerender } = renderHook(
      ({ suspended, forceVisible }) => usePlayerOsd({ active: true, suspended, forceVisible }),
      { initialProps: { suspended: false, forceVisible: true } }
    )

    expect(result.current.visible).toBe(true)
    rerender({ suspended: true, forceVisible: true })
    expect(result.current.visible).toBe(false)
    rerender({ suspended: false, forceVisible: false })
    expect(result.current.visible).toBe(true)
  })

  it('reports a measured safe-area edge only while the OSD is visible', () => {
    let readOsd = (): ReturnType<typeof usePlayerOsd> => {
      throw new Error('OSD harness has not rendered')
    }
    const Harness = (): JSX.Element => {
      const osd = usePlayerOsd({ active: true, suspended: false })
      readOsd = () => osd
      return <section ref={osd.osdRef} data-testid="osd" />
    }

    render(<Harness />)
    Object.defineProperty(screen.getByTestId('osd'), 'offsetTop', {
      configurable: true,
      value: 512
    })
    expect(readOsd().osdTop).toBeNull()

    act(() => window.dispatchEvent(new MouseEvent('pointermove')))
    expect(readOsd().osdTop).toBe(512)

    act(() => vi.advanceTimersByTime(PLAYER_OSD_HIDE_DELAY_MS))
    expect(readOsd().osdTop).toBeNull()
  })
})
