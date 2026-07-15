import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioTrackPreference } from '@shared/types'
import {
  inspectAudioTracks,
  matchAudioTrackPreference,
  selectAudioTrack,
  toAudioTrackPreference,
  type BrowserAudioTrack,
  type BrowserAudioTrackList,
  type PlayableAudioTrack
} from './audioTrackCapability'

describe('audio track capability', () => {
  it('feature-detects an absent or malformed draft API without throwing', () => {
    expect(inspectAudioTracks(document.createElement('video'))).toEqual({
      supported: false,
      tracks: []
    })

    const malformed = mediaWith({ length: 2 })
    expect(inspectAudioTracks(malformed)).toEqual({ supported: false, tracks: [] })
  })

  it('enumerates serializable tracks using label, language, then ordinal fallbacks', () => {
    const list = new FakeAudioTrackList([
      track(true, '  Indonesian (5.1)  ', ' ind '),
      track(false, '', 'eng'),
      track(false)
    ])

    expect(inspectAudioTracks(mediaWith(list))).toEqual({
      supported: true,
      tracks: [
        {
          label: 'Indonesian (5.1)', language: 'ind', ordinal: 0,
          displayLabel: 'Indonesian (5.1)', enabled: true
        },
        {
          label: '', language: 'eng', ordinal: 1,
          displayLabel: 'eng', enabled: false
        },
        {
          label: '', language: '', ordinal: 2,
          displayLabel: 'Track 3', enabled: false
        }
      ]
    })
  })

  it('derives a persisted semantic preference without presentation state', () => {
    const option: PlayableAudioTrack = {
      label: 'Original score',
      language: 'ind',
      ordinal: 1,
      displayLabel: 'Original score',
      enabled: true
    }

    expect(toAudioTrackPreference(option)).toEqual({
      label: 'Original score',
      language: 'ind',
      ordinal: 1
    })
  })
})

describe('audio track preference matching', () => {
  const tracks: PlayableAudioTrack[] = [
    option('English dub', 'eng', 0),
    option('Original score', 'ind', 1),
    option('Alternate score', 'ind', 2),
    option('', '', 3)
  ]

  it('uses semantic metadata across a reordered media element', () => {
    const reordered = [
      { ...tracks[0], ordinal: 0 },
      { ...tracks[2], ordinal: 1 },
      { ...tracks[1], ordinal: 2 }
    ]

    expect(matchAudioTrackPreference(reordered, {
      label: ' Original Score ',
      language: 'IND',
      ordinal: 1
    })?.ordinal).toBe(2)
  })

  it('uses ordinal to disambiguate duplicate language metadata', () => {
    expect(matchAudioTrackPreference(tracks, {
      label: '',
      language: 'ind',
      ordinal: 2
    })).toEqual(tracks[2])
  })

  it('falls back to ordinal only for metadata-poor containers', () => {
    expect(matchAudioTrackPreference(tracks, {
      label: '',
      language: '',
      ordinal: 3
    })).toEqual(tracks[3])
  })

  it('does not select an unrelated ordinal when labeled metadata disappeared', () => {
    expect(matchAudioTrackPreference(tracks, {
      label: 'Label no longer exposed',
      language: 'und',
      ordinal: 3
    })).toBeNull()
  })

  it('returns null rather than guessing between ambiguous semantic matches', () => {
    expect(matchAudioTrackPreference(tracks, {
      label: '',
      language: 'ind',
      ordinal: 9
    })).toBeNull()
  })
})

describe('exclusive audio track selection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolves selected only after a change event confirms exclusive state', async () => {
    const list = new FakeAudioTrackList([
      track(true, 'English', 'eng'),
      track(false, 'Indonesian', 'ind')
    ])
    const media = mediaWith(list)
    const settled = vi.fn()

    const selection = selectAudioTrack(media, preference('Indonesian', 'ind', 1))
    void selection.then(settled)
    await Promise.resolve()

    expect(list.states()).toEqual([false, true])
    expect(settled).not.toHaveBeenCalled()

    list.dispatchEvent(new Event('change'))
    await expect(selection).resolves.toMatchObject({
      status: 'selected',
      track: { label: 'Indonesian', language: 'ind', ordinal: 1, enabled: true }
    })
  })

  it('restores a descriptor by semantics rather than a stale ordinal', async () => {
    const list = new FakeAudioTrackList([
      track(true, 'English', 'eng'),
      track(false, 'Alternate score', 'ind'),
      track(false, 'Original score', 'ind')
    ])
    const selection = selectAudioTrack(
      mediaWith(list),
      preference('Original score', 'ind', 1)
    )

    expect(list.states()).toEqual([false, false, true])
    list.dispatchEvent(new Event('change'))

    await expect(selection).resolves.toMatchObject({
      status: 'selected',
      track: { label: 'Original score', ordinal: 2 }
    })
  })

  it('waits for the complete exclusive mutation when setters emit synchronously', async () => {
    let list: FakeAudioTrackList
    const notify = (): void => {
      list.dispatchEvent(new Event('change'))
    }
    list = new FakeAudioTrackList([
      notifyingTrack(true, 'English', 'eng', notify),
      notifyingTrack(false, 'Indonesian', 'ind', notify)
    ])

    await expect(selectAudioTrack(
      mediaWith(list),
      preference('Indonesian', 'ind', 1)
    )).resolves.toMatchObject({ status: 'selected', track: { ordinal: 1 } })
    expect(list.states()).toEqual([false, true])
  })

  it('returns a distinct no-op result when the target is already exclusive', async () => {
    const list = new FakeAudioTrackList([
      track(false, 'English', 'eng'),
      track(true, 'Indonesian', 'ind')
    ])

    await expect(selectAudioTrack(
      mediaWith(list),
      preference('Indonesian', 'ind', 1)
    )).resolves.toMatchObject({ status: 'already-selected', track: { ordinal: 1 } })
  })

  it('times out and rolls back when Chromium does not emit change', async () => {
    const list = new FakeAudioTrackList([
      track(true, 'English', 'eng'),
      track(false, 'Indonesian', 'ind')
    ])
    const selection = selectAudioTrack(
      mediaWith(list),
      preference('Indonesian', 'ind', 1),
      { timeoutMs: 25 }
    )

    expect(list.states()).toEqual([false, true])
    await vi.advanceTimersByTimeAsync(25)

    await expect(selection).resolves.toMatchObject({ status: 'timeout' })
    expect(list.states()).toEqual([true, false])
  })

  it('rejects a change event whose resulting state is not exclusive and rolls back', async () => {
    const list = new FakeAudioTrackList([
      track(true, 'English', 'eng'),
      track(false, 'Indonesian', 'ind')
    ])
    const selection = selectAudioTrack(mediaWith(list), preference('Indonesian', 'ind', 1))

    list[0]!.enabled = true
    list.dispatchEvent(new Event('change'))

    await expect(selection).resolves.toMatchObject({ status: 'failed' })
    expect(list.states()).toEqual([true, false])
  })

  it('handles setter failures without leaking a partial exclusive state', async () => {
    const english = track(true, 'English', 'eng')
    const indonesian = throwingTrack(false, 'Indonesian', 'ind')
    const list = new FakeAudioTrackList([english, indonesian])

    await expect(selectAudioTrack(
      mediaWith(list),
      preference('Indonesian', 'ind', 1)
    )).resolves.toMatchObject({ status: 'failed' })
    expect(english.enabled).toBe(true)
    expect(indonesian.enabled).toBe(false)
  })

  it('reports unsupported and missing preferences gracefully', async () => {
    await expect(selectAudioTrack(
      document.createElement('video'),
      preference('Indonesian', 'ind', 1)
    )).resolves.toEqual({ status: 'unsupported', track: null })

    const list = new FakeAudioTrackList([track(true, 'English', 'eng')])
    await expect(selectAudioTrack(
      mediaWith(list),
      preference('Indonesian', 'ind', 3)
    )).resolves.toEqual({ status: 'not-found', track: null })
  })
})

class FakeAudioTrackList extends EventTarget implements BrowserAudioTrackList {
  readonly length: number
  readonly [index: number]: BrowserAudioTrack | undefined

  constructor(tracks: BrowserAudioTrack[]) {
    super()
    this.length = tracks.length
    tracks.forEach((item, index) => {
      Object.defineProperty(this, index, { value: item, enumerable: true })
    })
  }

  states(): boolean[] {
    return Array.from({ length: this.length }, (_, index) => this[index]!.enabled)
  }
}

function mediaWith(audioTracks: unknown): HTMLMediaElement {
  const media = document.createElement('video')
  Object.defineProperty(media, 'audioTracks', { value: audioTracks, configurable: true })
  return media
}

function track(
  enabled: boolean,
  label = '',
  language = ''
): BrowserAudioTrack {
  return { enabled, label, language }
}

function throwingTrack(
  initialEnabled: boolean,
  label: string,
  language: string
): BrowserAudioTrack {
  let enabled = initialEnabled
  return {
    label,
    language,
    get enabled() {
      return enabled
    },
    set enabled(value: boolean) {
      if (value) throw new Error('Native setter rejected selection')
      enabled = value
    }
  }
}

function notifyingTrack(
  initialEnabled: boolean,
  label: string,
  language: string,
  notify: () => void
): BrowserAudioTrack {
  let enabled = initialEnabled
  return {
    label,
    language,
    get enabled() {
      return enabled
    },
    set enabled(value: boolean) {
      if (enabled === value) return
      enabled = value
      notify()
    }
  }
}

function option(label: string, language: string, ordinal: number): PlayableAudioTrack {
  return {
    label,
    language,
    ordinal,
    displayLabel: label || language || `Track ${ordinal + 1}`,
    enabled: ordinal === 0
  }
}

function preference(label: string, language: string, ordinal: number): AudioTrackPreference {
  return { label, language, ordinal }
}
