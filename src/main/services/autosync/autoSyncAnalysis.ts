import { isTimingSnapshotCurrent, type TimingSnapshot } from '@shared/sessionTiming'
import type {
  AutoSyncCompleteEvent,
  AutoSyncIntent,
  AutoSyncProgressEvent,
  LibrarySession
} from '@shared/types'
import { fallback, stale, type AutoSyncEvents } from './autoSyncEvents'
import {
  AUTO_SYNC_PROGRESS,
  MAX_OPENING_ELIGIBLE_DEVIATION_SECONDS,
  MAX_PARTIAL_DEVIATION_SECONDS,
  MAX_STRONG_OPENING_DEVIATION_SECONDS,
  MIN_OPENING_ELIGIBLE_ANCHORS,
  MIN_PARTIAL_ANCHORS,
  MIN_PARTIAL_GEOMETRY_CONFIDENCE,
  MIN_STRONG_OPENING_ANCHORS,
  MIN_STRONG_OPENING_SPAN_SECONDS,
  OPENING_CORROBORATION_TOLERANCE_SECONDS,
  OPENING_PARTIAL_FLOOR,
  PARTIAL_CONFIDENCE_CAP,
  PARTIAL_OFFSET_AGREEMENT_SECONDS
} from './constants'
import { choosePreferredFit, fitMatchSet, type AnchorMatchSet } from './fitResolution'
import { isConfidentFit, type AutoSyncFit } from './fitting'
import type { AutoSyncMediaBackend, MediaInfo } from './ffmpegBackend'
import type { InsetGeometry } from './insetGeometry'
import type { AutoSyncAnchor } from './matching'
import {
  openingEvidenceStats,
  offsetStatsForRate,
  type DetectedInset
} from './openingFallback'
import type { SignatureCellMask } from './signatures'

export interface TimelineScanResult extends AnchorMatchSet {
  geometry: InsetGeometry
  mask: SignatureCellMask | null
}

export interface PrimaryPhasePorts {
  progress(
    sessionId: string,
    phase: AutoSyncProgressEvent['phase'],
    percent: number,
    message: string
  ): void
  probe: AutoSyncMediaBackend['probe']
  findGeometry(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    signal: AbortSignal
  ): Promise<DetectedInset | null>
  scanTimelines(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<TimelineScanResult>
  refineAnchors(
    session: LibrarySession,
    anchors: AutoSyncAnchor[],
    geometry: InsetGeometry,
    mask: SignatureCellMask | null,
    signal: AbortSignal,
    reportProgress?: boolean
  ): Promise<AnchorMatchSet>
}

export type PrimaryPhaseResult =
  | { kind: 'geometry-missing' }
  | {
      kind: 'complete'
      movieInfo: MediaInfo
      reactionInfo: MediaInfo
      intro: DetectedInset
      refined: AnchorMatchSet
      fit: AutoSyncFit | null
    }

export interface AutoSyncAnalysisContext {
  sessionId: string
  intent: AutoSyncIntent
  session: LibrarySession
  timingSnapshot: TimingSnapshot
  signal: AbortSignal
}

export interface AutoSyncAnalysisPorts extends PrimaryPhasePorts {
  getSession(sessionId: string): LibrarySession | null
  scanOpeningTimelines(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<AnchorMatchSet>
  findOpeningMotionOffset(
    session: LibrarySession,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<number | null>
  events: AutoSyncEvents
}

export interface PartialOutcomeCandidate {
  offsetSeconds: number
  movieRateCorrection: number
  confidence: number
  anchorCount: number
}

export interface OpeningOutcomeCandidate {
  offsetSeconds: number
  confidence: number
  anchorCount: number
}

export async function runPrimaryPhases(
  sessionId: string,
  session: LibrarySession,
  signal: AbortSignal,
  ports: PrimaryPhasePorts
): Promise<PrimaryPhaseResult> {
  ports.progress(sessionId, 'preparing', AUTO_SYNC_PROGRESS.preparing, 'Checking both videos…')
  const [movieInfo, reactionInfo] = await Promise.all([
    ports.probe(session.moviePath!, signal),
    ports.probe(session.reactionPath!, signal)
  ])

  ports.progress(sessionId, 'finding-inset', AUTO_SYNC_PROGRESS.findingInset, 'Finding the movie inside the reaction…')
  const intro = await ports.findGeometry(session, movieInfo, reactionInfo, signal)
  if (!intro) return { kind: 'geometry-missing' }

  ports.progress(sessionId, 'scanning', AUTO_SYNC_PROGRESS.scanning, 'Comparing moments across the watchalong…')
  const scan: TimelineScanResult = intro.openingOnly
    ? { anchors: [], consensus: null, geometry: intro.geometry, mask: intro.mask }
    : await ports.scanTimelines(session, movieInfo, reactionInfo, intro, signal)
  const coarse = scan.anchors
  ports.progress(sessionId, 'refining', AUTO_SYNC_PROGRESS.refining, 'Double-checking the best matches…')
  const refined = await ports.refineAnchors(session, coarse, scan.geometry, scan.mask, signal)
  const refinedFit = fitMatchSet(refined, movieInfo.duration)
  const coarseFit = fitMatchSet({ anchors: coarse, consensus: scan.consensus }, movieInfo.duration)
  // A refinement is only better when its complete evidence is stronger.
  // This also prevents a marginal refined pass from hiding a valid coarse fit.
  const fit = choosePreferredFit(refinedFit, coarseFit)
  return { kind: 'complete', movieInfo, reactionInfo, intro, refined, fit }
}

export function decideConfidentOutcome(fit: AutoSyncFit | null): AutoSyncFit | null {
  return fit && isConfidentFit(fit) ? fit : null
}

export function decidePartialOutcome(input: {
  intro: DetectedInset
  refinedIntro: AnchorMatchSet
  refinedBody: AnchorMatchSet
  fit: AutoSyncFit | null
  movieRateCorrection: number
}): PartialOutcomeCandidate | null {
  const introOffset = offsetStatsForRate(input.refinedIntro.anchors, input.movieRateCorrection)
  const bodyOffset = offsetStatsForRate(input.refinedBody.anchors, input.movieRateCorrection)
  const partialOffset = introOffset && bodyOffset &&
    Math.abs(bodyOffset.offsetSeconds - introOffset.offsetSeconds) <= PARTIAL_OFFSET_AGREEMENT_SECONDS
    ? bodyOffset.offsetSeconds
    : introOffset?.offsetSeconds
  const introOffsetIsReliable = Boolean(
    introOffset && introOffset.count >= MIN_PARTIAL_ANCHORS &&
    introOffset.maximumDeviation <= MAX_PARTIAL_DEVIATION_SECONDS
  )
  if (!input.intro.openingOnly && input.intro.confidence >= MIN_PARTIAL_GEOMETRY_CONFIDENCE &&
    introOffsetIsReliable && partialOffset !== undefined && Number.isFinite(partialOffset)) {
    return {
      offsetSeconds: partialOffset,
      movieRateCorrection: input.movieRateCorrection,
      confidence: Math.min(PARTIAL_CONFIDENCE_CAP, input.fit?.confidence ?? input.intro.confidence),
      anchorCount: introOffset!.count
    }
  }
  return null
}

export async function decideOpeningOutcome(input: {
  intro: DetectedInset
  movieRateCorrection: number
  scanOpening: () => Promise<AnchorMatchSet>
  findMotionOffset: () => Promise<number | null>
}): Promise<OpeningOutcomeCandidate | null> {
  const coarseIntroOffset = offsetStatsForRate(input.intro.anchors, input.movieRateCorrection)
  const openingEligible = Boolean(
    coarseIntroOffset &&
    coarseIntroOffset.count >= MIN_OPENING_ELIGIBLE_ANCHORS &&
    coarseIntroOffset.maximumDeviation <= MAX_OPENING_ELIGIBLE_DEVIATION_SECONDS
  )
  if (!openingEligible) return null

  const opening = await input.scanOpening()
  const independentOpeningOffset = openingEvidenceStats(opening.anchors, input.movieRateCorrection)
  const openingOffset = independentOpeningOffset ?? (
    input.intro.openingOnly && opening.anchors.length >= MIN_OPENING_ELIGIBLE_ANCHORS
      ? openingEvidenceStats([...input.intro.anchors, ...opening.anchors], input.movieRateCorrection)
      : null
  )
  const strongIndependentVisualEvidence = Boolean(
    independentOpeningOffset &&
    independentOpeningOffset.count >= MIN_STRONG_OPENING_ANCHORS &&
    independentOpeningOffset.maximumDeviation <= MAX_STRONG_OPENING_DEVIATION_SECONDS &&
    independentOpeningOffset.spanSeconds >= MIN_STRONG_OPENING_SPAN_SECONDS
  )
  const openingMotionOffset = strongIndependentVisualEvidence
    ? null
    : input.intro.openingMotionOffset ?? await input.findMotionOffset()
  const hasRequiredCorroboration = strongIndependentVisualEvidence || (
    openingMotionOffset !== null && openingOffset !== null &&
    Math.abs(openingMotionOffset - openingOffset.offsetSeconds) <= OPENING_CORROBORATION_TOLERANCE_SECONDS
  )
  if (!openingOffset || !hasRequiredCorroboration) return null
  return {
    offsetSeconds: openingOffset.offsetSeconds,
    confidence: Math.min(PARTIAL_CONFIDENCE_CAP, Math.max(input.intro.confidence, OPENING_PARTIAL_FLOOR)),
    anchorCount: openingOffset.count
  }
}

export async function runAutoSyncAnalysis(
  context: AutoSyncAnalysisContext,
  ports: AutoSyncAnalysisPorts
): Promise<AutoSyncCompleteEvent> {
  const { sessionId, intent, session, timingSnapshot, signal } = context
  const primary = await runPrimaryPhases(sessionId, session, signal, ports)
  if (primary.kind === 'geometry-missing') {
    return fallback(sessionId, 'WatchAlong couldn’t clearly see the movie in this reaction. You can line it up manually.')
  }

  const current = ports.getSession(sessionId)
  if (!isTimingSnapshotCurrent(current, timingSnapshot)) return stale(sessionId)

  ports.progress(sessionId, 'finishing', AUTO_SYNC_PROGRESS.finishing, 'Finishing the timing…')
  const confident = decideConfidentOutcome(primary.fit)
  if (confident) return ports.events.completeFromFit(sessionId, confident, primary.movieInfo.frameRate)

  const refinedIntro = await ports.refineAnchors(
    session,
    primary.intro.anchors,
    primary.intro.geometry,
    primary.intro.mask,
    signal,
    false
  )
  const latest = ports.getSession(sessionId)
  if (!isTimingSnapshotCurrent(latest, timingSnapshot)) return stale(sessionId)

  const partial = decidePartialOutcome({
    intro: primary.intro,
    refinedIntro,
    refinedBody: primary.refined,
    fit: primary.fit,
    movieRateCorrection: latest.movieRateCorrection
  })
  if (partial) {
    return ports.events.completePartial(
      sessionId,
      intent,
      partial.offsetSeconds,
      partial.movieRateCorrection,
      partial.confidence,
      partial.anchorCount,
      primary.movieInfo.frameRate
    )
  }

  const opening = await decideOpeningOutcome({
    intro: primary.intro,
    movieRateCorrection: latest.movieRateCorrection,
    scanOpening: () => ports.scanOpeningTimelines(
      session,
      primary.movieInfo,
      primary.reactionInfo,
      primary.intro,
      signal
    ),
    findMotionOffset: () => ports.findOpeningMotionOffset(session, primary.intro, signal)
  })
  if (opening) {
    const currentAfterOpening = ports.getSession(sessionId)
    if (!isTimingSnapshotCurrent(currentAfterOpening, timingSnapshot)) return stale(sessionId)
    return ports.events.completeReadyOpeningPartial(
      sessionId,
      opening.offsetSeconds,
      currentAfterOpening.movieRateCorrection,
      opening.confidence,
      opening.anchorCount,
      primary.movieInfo.frameRate
    )
  }

  return fallback(sessionId, 'WatchAlong wasn’t certain enough to change your timing. You can line it up manually.')
}
