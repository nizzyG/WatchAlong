import type { AudioTrackPreference } from '@shared/types'

/**
 * Chromium exposes these objects only when its non-standard AudioVideoTracks
 * implementation is enabled. Keep the model local and deliberately narrower
 * than the draft browser API so builds whose lib.dom omits it still compile.
 */
export interface BrowserAudioTrack {
  readonly label?: string
  readonly language?: string
  enabled: boolean
}

export interface BrowserAudioTrackList {
  readonly length: number
  readonly [index: number]: BrowserAudioTrack | undefined
  addEventListener(type: 'change', listener: EventListener): void
  removeEventListener(type: 'change', listener: EventListener): void
}

/** Serializable state safe to use in the embedded player or movie window. */
export interface PlayableAudioTrack extends AudioTrackPreference {
  displayLabel: string
  enabled: boolean
}

export interface AudioTrackCapability {
  supported: boolean
  tracks: PlayableAudioTrack[]
}

export type AudioTrackSelectionStatus =
  | 'selected'
  | 'already-selected'
  | 'unsupported'
  | 'not-found'
  | 'timeout'
  | 'failed'

export interface AudioTrackSelectionResult {
  status: AudioTrackSelectionStatus
  track: PlayableAudioTrack | null
}

export interface AudioTrackSelectionOptions {
  timeoutMs?: number
}

export const AUDIO_TRACK_CHANGE_TIMEOUT_MS = 1_000

interface NativeTrackEntry {
  ordinal: number
  track: BrowserAudioTrack
  option: PlayableAudioTrack
}

/** Feature-detects the native list and returns renderer/IPC-safe track state. */
export function inspectAudioTracks(media: HTMLMediaElement): AudioTrackCapability {
  const list = readAudioTrackList(media)
  return list
    ? { supported: true, tracks: readTrackEntries(list).map((entry) => entry.option) }
    : { supported: false, tracks: [] }
}

/** Removes presentation state before a selection is persisted or sent remotely. */
export function toAudioTrackPreference(track: PlayableAudioTrack): AudioTrackPreference {
  return {
    label: track.label,
    language: track.language,
    ordinal: track.ordinal
  }
}

/**
 * Restores by semantic metadata first because native track ids are generated
 * and can change between the embedded and detached media elements. Ordinal is
 * a deterministic tie-breaker and final fallback for metadata-poor files.
 */
export function matchAudioTrackPreference(
  tracks: readonly PlayableAudioTrack[],
  preference: AudioTrackPreference
): PlayableAudioTrack | null {
  const label = normalizeForMatch(preference.label)
  const language = normalizeForMatch(preference.language)

  if (label && language) {
    const exact = tracks.filter((track) =>
      normalizeForMatch(track.label) === label && normalizeForMatch(track.language) === language)
    if (exact.length > 0) return chooseSemanticMatch(exact, preference.ordinal)
  }

  if (label) {
    const sameLabel = tracks.filter((track) => normalizeForMatch(track.label) === label)
    if (sameLabel.length > 0) return chooseSemanticMatch(sameLabel, preference.ordinal)
  }

  if (language) {
    const sameLanguage = tracks.filter((track) => normalizeForMatch(track.language) === language)
    if (sameLanguage.length > 0) return chooseSemanticMatch(sameLanguage, preference.ordinal)
  }

  // Ordinal alone is safe only when the container supplied no semantic
  // metadata. If labeled metadata no longer matches, the file or its playable
  // stream set changed; keep Chromium's default instead of selecting an
  // unrelated track that happens to occupy the old position.
  return !label && !language
    ? tracks.find((track) => track.ordinal === preference.ordinal) ?? null
    : null
}

/**
 * Exclusively enables a restored track. A mutation is reported as selected
 * only after the live AudioTrackList emits `change` and the exclusive state is
 * observable. Unconfirmed or failed mutations are rolled back best-effort.
 */
export function selectAudioTrack(
  media: HTMLMediaElement,
  preference: AudioTrackPreference,
  options: AudioTrackSelectionOptions = {}
): Promise<AudioTrackSelectionResult> {
  const list = readAudioTrackList(media)
  if (!list) return Promise.resolve({ status: 'unsupported', track: null })

  const entries = readTrackEntries(list)
  const targetOption = matchAudioTrackPreference(entries.map((entry) => entry.option), preference)
  const target = targetOption
    ? entries.find((entry) => entry.ordinal === targetOption.ordinal) ?? null
    : null
  if (!target) return Promise.resolve({ status: 'not-found', track: null })

  if (isExclusiveSelection(entries, target.ordinal)) {
    return Promise.resolve({ status: 'already-selected', track: target.option })
  }

  const originalEnabled = entries.map((entry) => ({ track: entry.track, enabled: entry.track.enabled }))
  const timeoutMs = normalizedTimeout(options.timeoutMs)

  return new Promise((resolve) => {
    let settled = false
    let mutationComplete = false
    let changeObserved = false
    let confirmationQueued = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const currentTarget = (): PlayableAudioTrack | null =>
      inspectAudioTracks(media).tracks.find((track) => track.ordinal === target.ordinal) ?? null

    const rollback = (): void => {
      for (const original of originalEnabled) {
        try {
          original.track.enabled = original.enabled
        } catch {
          // The source may have been replaced or a draft implementation may
          // expose a read-only setter. Selection failure remains non-fatal.
        }
      }
    }

    const finish = (status: AudioTrackSelectionStatus, shouldRollback = false): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try {
        list.removeEventListener('change', onChange)
      } catch {
        // A disappearing draft API should still resolve gracefully.
      }
      if (shouldRollback) rollback()
      resolve({ status, track: currentTarget() ?? target.option })
    }

    const confirmAfterMutation = (): void => {
      if (!mutationComplete || !changeObserved || confirmationQueued || settled) return
      confirmationQueued = true
      queueMicrotask(() => {
        confirmationQueued = false
        if (settled) return
        const currentList = readAudioTrackList(media)
        const currentEntries = currentList === list ? readTrackEntries(list) : []
        if (currentEntries.length > 0 && isExclusiveSelection(currentEntries, target.ordinal)) {
          finish('selected')
        } else {
          finish('failed', true)
        }
      })
    }

    const onChange: EventListener = () => {
      changeObserved = true
      confirmAfterMutation()
    }

    try {
      list.addEventListener('change', onChange)
      timer = setTimeout(() => finish('timeout', true), timeoutMs)

      // Disable other tracks before enabling the target. Some implementations
      // fire synchronously for each setter, so confirmation waits until the
      // complete exclusive mutation has finished.
      for (const entry of entries) {
        if (entry.ordinal !== target.ordinal) entry.track.enabled = false
      }
      target.track.enabled = true
      mutationComplete = true
      confirmAfterMutation()
    } catch {
      mutationComplete = true
      finish('failed', true)
    }
  })
}

function readAudioTrackList(media: HTMLMediaElement): BrowserAudioTrackList | null {
  try {
    const candidate = (media as unknown as { audioTracks?: unknown }).audioTracks
    if (!candidate || typeof candidate !== 'object') return null

    const list = candidate as Partial<BrowserAudioTrackList>
    return Number.isSafeInteger(list.length) && (list.length ?? -1) >= 0 &&
      typeof list.addEventListener === 'function' && typeof list.removeEventListener === 'function'
      ? list as BrowserAudioTrackList
      : null
  } catch {
    return null
  }
}

function readTrackEntries(list: BrowserAudioTrackList): NativeTrackEntry[] {
  const entries: NativeTrackEntry[] = []
  for (let ordinal = 0; ordinal < list.length; ordinal += 1) {
    let track: BrowserAudioTrack | undefined
    try {
      track = list[ordinal]
    } catch {
      continue
    }
    if (!track || typeof track !== 'object' || typeof track.enabled !== 'boolean') continue

    const label = cleanMetadata(track.label)
    const language = cleanMetadata(track.language)
    entries.push({
      ordinal,
      track,
      option: {
        label,
        language,
        ordinal,
        displayLabel: label || language || `Track ${ordinal + 1}`,
        enabled: track.enabled
      }
    })
  }
  return entries
}

function isExclusiveSelection(entries: readonly NativeTrackEntry[], targetOrdinal: number): boolean {
  return entries.every((entry) => entry.track.enabled === (entry.ordinal === targetOrdinal))
}

function chooseSemanticMatch(
  matches: readonly PlayableAudioTrack[],
  ordinal: number
): PlayableAudioTrack | null {
  if (matches.length === 1) return matches[0]
  return matches.find((track) => track.ordinal === ordinal) ?? null
}

function cleanMetadata(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replaceAll('_', '-')
}

function normalizedTimeout(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : AUDIO_TRACK_CHANGE_TIMEOUT_MS
}
