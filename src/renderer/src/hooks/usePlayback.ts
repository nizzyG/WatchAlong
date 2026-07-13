import { useRef, useState } from 'react'
import type { MediaRole, OverlayGeometry, SyncState } from '@shared/types'
import { SyncController } from '../sync/SyncController'
import { RemoteVideoAdapter } from '../sync/RemoteVideoAdapter'

type MediaUrls = Record<MediaRole, string | null>
type MetadataReady = Record<MediaRole, boolean>
type Durations = Record<MediaRole, number>

export function usePlayback() {
  const reactionVideoRef = useRef<HTMLVideoElement>(null)
  const movieVideoRef = useRef<HTMLVideoElement>(null)
  const controllerRef = useRef<SyncController | null>(null)
  const remoteMovieAdapterRef = useRef<RemoteVideoAdapter | null>(null)
  const setupModeRef = useRef(false)
  const lastPositionSaveRef = useRef(0)
  const positionRef = useRef(0)
  const restoredPopOutSessionRef = useRef<string | null>(null)
  const pendingMovieWindowGeometryRef = useRef<OverlayGeometry | null>(null)
  const movieWindowGeometryTimerRef = useRef<number | null>(null)
  const closingMovieWindowRef = useRef(false)
  const canPlayRef = useRef(false)
  const isPlayingRef = useRef(false)
  const movieFrameRateDetectionKeyRef = useRef<string | null>(null)

  const [mediaUrls, setMediaUrls] = useState<MediaUrls>({ reaction: null, movie: null })
  const [metadataReady, setMetadataReady] = useState<MetadataReady>({ reaction: false, movie: false })
  const [durations, setDurations] = useState<Durations>({ reaction: Number.NaN, movie: Number.NaN })
  const [position, setPosition] = useState(0)
  const [moviePosition, setMoviePosition] = useState(0)
  const [setupMode, setSetupMode] = useState(false)
  const [setupPositions, setSetupPositions] = useState<Record<MediaRole, number>>({ reaction: 0, movie: 0 })
  const [setupPlayingRole, setSetupPlayingRole] = useState<MediaRole | null>(null)
  const [controlsIdle, setControlsIdle] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('empty')
  const [error, setError] = useState<string | null>(null)
  const [restoreToken, setRestoreToken] = useState<string | null>(null)
  const [pendingSyncSetup, setPendingSyncSetup] = useState(false)
  const [viewTransitioning, setViewTransitioning] = useState(false)
  const [movieWindowActive, setMovieWindowActive] = useState(false)

  return {
    reactionVideoRef, movieVideoRef, controllerRef, remoteMovieAdapterRef, setupModeRef,
    lastPositionSaveRef, positionRef, restoredPopOutSessionRef, pendingMovieWindowGeometryRef,
    movieWindowGeometryTimerRef, closingMovieWindowRef, canPlayRef, isPlayingRef,
    movieFrameRateDetectionKeyRef, mediaUrls, setMediaUrls, metadataReady, setMetadataReady,
    durations, setDurations, position, setPosition, moviePosition, setMoviePosition, setupMode,
    setSetupMode, setupPositions, setSetupPositions, setupPlayingRole, setSetupPlayingRole,
    controlsIdle, setControlsIdle, syncState, setSyncState, error, setError, restoreToken,
    setRestoreToken, pendingSyncSetup, setPendingSyncSetup, viewTransitioning,
    setViewTransitioning, movieWindowActive, setMovieWindowActive
  }
}

export type PlaybackHook = ReturnType<typeof usePlayback>
