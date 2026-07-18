import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultLibrary, createDefaultSession, getActiveSession } from '@shared/session'
import type { LibrarySession, SessionLibrary } from '@shared/types'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import {
  runSessionTransition,
  useSessionTransition,
  type SessionTransitionPlan,
  type SessionTransitionRuntime
} from './useSessionTransition'
import type { DetachedMovieTransitionPolicy } from './useMovieWindow'

describe('runSessionTransition', () => {
  it('runs every transition phase in a fixed order', async () => {
    const harness = createRuntime('old')
    const initial = createSession('target', 12, true)
    const cleared = createSession('target', 24)
    const finalized = createSession('target', 42)
    harness.runtime.clearResolvedMoviePopOut = async () => {
      harness.calls.push('clear-pop-out')
      return createLibrary(cleared)
    }

    const result = await runSessionTransition(harness.runtime, 'intended', {
      pause: 'all-media',
      flushPosition: true,
      prepare: async () => {
        harness.calls.push('prepare')
        return { status: 'ready', value: 'picked' }
      },
      detachedMovie: 'replace-media',
      afterDetached: () => {
        harness.calls.push('after-detached')
        return true
      },
      beforeResolve: () => {
        harness.calls.push('before-resolve')
      },
      resolveLibrary: async (prepared) => {
        harness.calls.push(`resolve:${prepared}`)
        return { library: createLibrary(initial), metadata: { source: 'replacement' } }
      },
      clearResolvedPopOut: true,
      afterResolved: (session, metadata) => {
        harness.calls.push(`after-resolved:${session?.id ?? 'none'}:${metadata.source}`)
      },
      finalizeResolvedSession: async (session, metadata) => {
        harness.calls.push(`finalize:${session.id}`)
        expect(session.isMoviePoppedOut).toBe(false)
        expect(metadata).toEqual({ source: 'replacement' })
        return createLibrary(finalized)
      },
      position: 'session',
      presentation: 'always',
      destination: 'resolved',
      beforePresentation: (session, metadata) => {
        harness.calls.push(`before-presentation:${session?.id ?? 'none'}:${metadata.source}`)
      },
      beforeViewChange: (session) => {
        harness.calls.push(`before-view:${session?.id ?? 'none'}`)
      },
      afterViewChange: (session) => {
        harness.calls.push(`after-view:${session?.id ?? 'none'}`)
      }
    })

    expect(result).toEqual({
      status: 'completed',
      session: finalized,
      presented: true,
      metadata: { source: 'replacement' }
    })
    expect(harness.calls).toEqual([
      'pause-controller',
      'pause-reaction',
      'pause-movie',
      'flush',
      'prepare',
      'detached:replace-media',
      'after-detached',
      'before-resolve',
      'resolve:picked',
      'commit:target',
      'clear-pop-out',
      'commit:target',
      'after-resolved:target:replacement',
      'finalize:target',
      'commit:target',
      'before-presentation:target:replacement',
      'position:42',
      'movie-position:0',
      'before-view:target',
      'view:player',
      'after-view:target',
      'refresh:target'
    ])
  })

  it('stops before detached teardown when preparation is cancelled', async () => {
    const harness = createRuntime('old')

    const result = await runSessionTransition(harness.runtime, 'target', {
      ...resolvedPlan(),
      pause: 'controller',
      flushPosition: true,
      prepare: async () => {
        harness.calls.push('prepare-cancelled')
        return { status: 'cancelled' }
      }
    })

    expect(result).toEqual({ status: 'cancelled' })
    expect(harness.calls).toEqual(['pause-controller', 'flush', 'prepare-cancelled'])
  })

  it.each([
    {
      name: 'resolved destination without a resolver',
      plan: { ...resolvedPlan(), pause: 'all-media' as const, flushPosition: true }
    },
    {
      name: 'resolved position in a library-only transition',
      plan: {
        pause: 'all-media' as const,
        flushPosition: true,
        detachedMovie: 'leave-session' as const,
        position: 'session' as const,
        presentation: 'always' as const,
        destination: 'library' as const
      }
    },
    {
      name: 'conditional presentation in a library-only transition',
      plan: {
        pause: 'all-media' as const,
        flushPosition: true,
        detachedMovie: 'leave-session' as const,
        position: 'preserve' as const,
        presentation: 'active-id-changed' as const,
        destination: 'library' as const
      }
    }
  ])('rejects $name before any transition side effect', async ({ plan }) => {
    const harness = createRuntime('old')

    await expect(runSessionTransition(harness.runtime, null, plan)).rejects.toThrow()

    expect(harness.calls).toEqual([])
  })

  it('stops after detached teardown when the initiating-session guard fails', async () => {
    const harness = createRuntime('old')

    const result = await runSessionTransition(harness.runtime, 'target', {
      ...resolvedPlan(),
      detachedMovie: 'replace-media',
      afterDetached: () => {
        harness.calls.push('stale-after-detached')
        return false
      }
    })

    expect(result).toEqual({ status: 'cancelled' })
    expect(harness.calls).toEqual(['detached:replace-media', 'stale-after-detached'])
  })

  it('refreshes the actual session returned by a custom resolver', async () => {
    const harness = createRuntime('old')
    const existing = createSession('existing', 73)

    const result = await runSessionTransition(harness.runtime, 'requested', {
      ...resolvedPlan<string>(),
      resolveLibrary: async () => ({ library: createLibrary(existing), metadata: 'conflict' })
    })

    expect(result).toEqual({
      status: 'completed',
      session: existing,
      presented: true,
      metadata: 'conflict'
    })
    expect(harness.calls).toContain('refresh:existing')
    expect(harness.calls).not.toContain('refresh:requested')
  })

  it.each([
    ['preserve', []],
    ['session', ['position:37.5', 'movie-position:0']],
    ['zero', ['position:0', 'movie-position:0']]
  ] as const)('presents the %s position mode', async (position, expected) => {
    const harness = createRuntime('old')
    const target = createSession('target', 37.5)

    await runSessionTransition(harness.runtime, 'target', {
      ...resolvedPlan(),
      resolveLibrary: async () => ({ library: createLibrary(target), metadata: undefined }),
      position
    })

    expect(harness.calls.filter((call) => call.startsWith('position:') || call.startsWith('movie-position:')))
      .toEqual(expected)
  })

  it('commits but skips presentation when the active identity is unchanged', async () => {
    const harness = createRuntime('same')
    const same = createSession('same', 18)
    const beforeViewChange = vi.fn()
    const afterViewChange = vi.fn()

    const result = await runSessionTransition(harness.runtime, 'same', {
      ...resolvedPlan(),
      resolveLibrary: async () => ({ library: createLibrary(same), metadata: undefined }),
      presentation: 'active-id-changed',
      beforeViewChange,
      afterViewChange
    })

    expect(result).toEqual({
      status: 'completed',
      session: same,
      presented: false,
      metadata: undefined
    })
    expect(harness.calls).toEqual(['detached:keep', 'commit:same'])
    expect(beforeViewChange).not.toHaveBeenCalled()
    expect(afterViewChange).not.toHaveBeenCalled()
  })

  it('runs post-resolution work when the resolved library has no active session', async () => {
    const harness = createRuntime('old')
    const afterResolved = vi.fn()

    const result = await runSessionTransition(harness.runtime, null, {
      ...resolvedPlan<{ preferencesLoaded: true }>(),
      resolveLibrary: async () => ({
        library: createLibrary(null),
        metadata: { preferencesLoaded: true as const }
      }),
      afterResolved
    })

    expect(afterResolved).toHaveBeenCalledWith(null, { preferencesLoaded: true })
    expect(result).toEqual({
      status: 'completed',
      session: null,
      presented: true,
      metadata: { preferencesLoaded: true }
    })
    expect(harness.calls).toContain('view:library')
    expect(harness.calls).toContain('refresh:none')
  })

  it.each<DetachedMovieTransitionPolicy>([
    'keep',
    'replace-media',
    'leave-session',
    'wizard-completed'
  ])('dispatches the %s detached-window policy', async (detachedMovie) => {
    const harness = createRuntime('old')

    await runSessionTransition(harness.runtime, null, {
      pause: 'none',
      flushPosition: false,
      detachedMovie,
      position: 'preserve',
      presentation: 'always',
      destination: 'library'
    })

    expect(harness.calls[0]).toBe(`detached:${detachedMovie}`)
  })
})

describe('useSessionTransition', () => {
  it('keeps transitionToSession stable while using the latest dependencies', async () => {
    const flushFirst = vi.fn(async () => undefined)
    const flushLatest = vi.fn(async () => undefined)
    const playback = {
      controllerRef: { current: null },
      reactionVideoRef: { current: null },
      setPosition: vi.fn(),
      setMoviePosition: vi.fn()
    } as unknown as PlaybackHook
    const sessionState = {
      activeSessionIdRef: { current: 'old' },
      setAppView: vi.fn()
    } as unknown as SessionHook
    const common = {
      playback,
      sessionState,
      refreshMediaUrls: vi.fn(async () => undefined),
      getMovieAdapter: vi.fn(() => null),
      commitLibrary: vi.fn(() => null),
      closeDetachedMovieForTransition: vi.fn(async () => undefined)
    }

    const { result, rerender } = renderHook(
      ({ flushCurrentSessionPosition }) => useSessionTransition({
        ...common,
        flushCurrentSessionPosition
      }),
      { initialProps: { flushCurrentSessionPosition: flushFirst } }
    )
    const firstIdentity = result.current.transitionToSession

    rerender({ flushCurrentSessionPosition: flushLatest })
    expect(result.current.transitionToSession).toBe(firstIdentity)

    await result.current.transitionToSession(null, {
      pause: 'none',
      flushPosition: true,
      detachedMovie: 'keep',
      position: 'preserve',
      presentation: 'always',
      destination: 'library'
    })

    expect(flushFirst).not.toHaveBeenCalled()
    expect(flushLatest).toHaveBeenCalledOnce()
  })
})

function resolvedPlan<TMetadata = undefined>(): SessionTransitionPlan<void, TMetadata> {
  return {
    pause: 'none',
    flushPosition: false,
    detachedMovie: 'keep',
    position: 'session',
    presentation: 'always',
    destination: 'resolved'
  }
}

function createSession(id: string, lastReactionTimeSeconds: number, isMoviePoppedOut = false): LibrarySession {
  return createDefaultSession(new Date('2026-07-17T00:00:00.000Z'), {
    id,
    title: id,
    reactionPath: `C:\\Reactions\\${id}.mp4`,
    moviePath: `C:\\Movies\\${id}.mp4`,
    lastReactionTimeSeconds,
    isMoviePoppedOut
  })
}

function createLibrary(session: LibrarySession | null): SessionLibrary {
  return {
    ...createDefaultLibrary(),
    activeSessionId: session?.id ?? null,
    sessions: session ? [session] : []
  }
}

function createRuntime(initialActiveSessionId: string | null): {
  runtime: SessionTransitionRuntime
  calls: string[]
} {
  const calls: string[] = []
  let activeSessionId = initialActiveSessionId
  const runtime: SessionTransitionRuntime = {
    getActiveSessionId: () => activeSessionId,
    pauseController: () => calls.push('pause-controller'),
    pauseReaction: () => calls.push('pause-reaction'),
    pauseMovie: () => calls.push('pause-movie'),
    flushCurrentSessionPosition: async () => { calls.push('flush') },
    closeDetachedMovieForTransition: async (policy) => { calls.push(`detached:${policy}`) },
    activateSession: async (sessionId) => {
      calls.push(`activate:${sessionId}`)
      return createLibrary(createSession(sessionId, 0))
    },
    commitLibrary: (next) => {
      const session = getActiveSession(next)
      activeSessionId = session?.id ?? null
      calls.push(`commit:${activeSessionId ?? 'none'}`)
      return session
    },
    clearResolvedMoviePopOut: async () => {
      calls.push('clear-pop-out')
      return createLibrary(activeSessionId ? createSession(activeSessionId, 0) : null)
    },
    setPosition: (position) => calls.push(`position:${position}`),
    setMoviePosition: (position) => calls.push(`movie-position:${position}`),
    setAppView: (view) => calls.push(`view:${view}`),
    refreshMediaUrls: async (sessionId) => { calls.push(`refresh:${sessionId ?? 'none'}`) }
  }
  return { runtime, calls }
}
