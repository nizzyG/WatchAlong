/**
 * AutoSync's named algorithm policy and numeric constants.
 *
 * These values intentionally mirror the established algorithm. Naming them is
 * a readability refactor only: change behavioral values with corpus-backed
 * evidence, and keep presentation/structural policy explicit at its call site.
 */

export const AUTO_SYNC_ALGORITHM_VERSION = 3

export const AUTO_SYNC_PROGRESS = {
  preparing: 3,
  findingInset: 10,
  scanning: 30,
  refining: 72,
  finishing: 94,
  bodyScanStart: 35,
  bodyScanRange: 32,
  anchorRefinementStart: 72,
  anchorRefinementRange: 18,
  maximum: 100
} as const

export const PARTIAL_OFFSET_AGREEMENT_SECONDS = 2
export const MIN_PARTIAL_ANCHORS = 3
export const MAX_PARTIAL_DEVIATION_SECONDS = 2
export const MIN_PARTIAL_GEOMETRY_CONFIDENCE = 0.5
export const PARTIAL_CONFIDENCE_CAP = 0.69

export const MIN_OPENING_ELIGIBLE_ANCHORS = 2
export const MAX_OPENING_ELIGIBLE_DEVIATION_SECONDS = 2.5
export const MIN_STRONG_OPENING_ANCHORS = 3
export const MAX_STRONG_OPENING_DEVIATION_SECONDS = 0.25
export const MIN_STRONG_OPENING_SPAN_SECONDS = 12
export const OPENING_CORROBORATION_TOLERANCE_SECONDS = 1.5
export const OPENING_PARTIAL_FLOOR = 0.45

export const RATE_BAND = { min: 0.9, max: 1.1 } as const
export const COARSE_RATE_BAND = { min: 0.88, max: 1.12 } as const

export const GEOMETRY_SCAN = {
  fps: 0.25,
  maximumReactionDurationSeconds: 480,
  maximumMovieDurationSeconds: 300,
  reactionWidth: 96,
  reactionHeight: 54,
  movieWidth: 64,
  movieHeight: 36,
  gridSize: 6,
  minimumConfidence: 0.4,
  openingCandidateMaximumWidth: 0.5,
  openingCandidateMaximumHeight: 0.45,
  refinedMinimumConfidence: 0.38
} as const

export const OPENING_PREFIX_SCAN = {
  timerReactionDurationSeconds: 160,
  timerMovieDurationSeconds: 120,
  timerReactionWidth: 192,
  timerReactionHeight: 108,
  timerMovieWidth: 128,
  timerMovieHeight: 72,
  timerGridSize: 8,
  prefixSeconds: [160, 240],
  prefixMovieMaximumSeconds: 180,
  prefixMovieLeadSeconds: 40,
  timerPrefixSeconds: 160,
  minimumConfidence: 0.35,
  minimumAnchors: 2,
  maximumOffsetDeviationSeconds: 2,
  maximumMotionDisagreementSeconds: 3
} as const

export const OPENING_SCAN = {
  fps: 8,
  maximumMovieDurationSeconds: 48,
  reactionPrerollSeconds: 3,
  reactionTailSeconds: 6,
  minimumReactionDurationSeconds: 12,
  reactionWidth: 256,
  reactionHeight: 144,
  movieWidth: 192,
  movieHeight: 108,
  gridSize: 16,
  probeEndMarginSeconds: 2,
  windowSize: 9,
  minimumSequenceActivity: 0.018,
  candidateExclusionFrames: 4,
  maximumCandidatesPerProbe: 80,
  minimumCandidateRawSimilarity: 0.68,
  candidateOffsetToleranceSeconds: 3,
  runnerUpExclusionFrames: 24,
  minimumAnchorConfidence: 0.42,
  minimumAnchorRawSimilarity: 0.72
} as const

export const OPENING_PROBE_TIMES = [3, 6, 9, 12, 16, 20, 28, 36, 44] as const

export const OPENING_MOTION_SCAN = {
  prerollSeconds: 4,
  durationSeconds: 8,
  fps: 8,
  width: 256,
  height: 144,
  gridSize: 16,
  resultDecimalPlaces: 3
} as const

export const BODY_SCAN = {
  pivotReactionFraction: 0.55,
  pivotEdgeMarginSeconds: 30,
  pivotMoviePaddingSeconds: 20,
  pivotMovieMinimumDurationSeconds: 1,
  pivotMovieFps: 0.5,
  pivotMovieWidth: 96,
  pivotMovieHeight: 54,
  pivotMovieGridSize: 10,
  pivotReactionHalfWindowSeconds: 14,
  pivotReactionDurationSeconds: 28,
  pivotReactionFps: 0.5,
  pivotReactionWidth: 128,
  pivotReactionHeight: 72,
  pivotReactionGridSize: 10,
  pivotRunnerUpExclusionFrames: 20,
  minimumPivotConfidence: 0.32,
  minimumPivotSeparationSeconds: 30,
  probeEdgeMarginSeconds: 20,
  probePivotExclusionSeconds: 20,
  reactionHalfWindowSeconds: 5,
  reactionDurationSeconds: 10,
  reactionFps: 2,
  reactionWidth: 128,
  reactionHeight: 72,
  reactionGridSize: 10,
  movieHalfWindowSeconds: 14,
  movieDurationSeconds: 28,
  movieFps: 2,
  movieWidth: 96,
  movieHeight: 54,
  movieGridSize: 10,
  houghOffsetBinSeconds: 0.5,
  houghInlierToleranceSeconds: 0.75,
  runnerUpExclusionFrames: 12,
  minimumAnchorConfidence: 0.35
} as const

export const PROBE_FRACTIONS = [0.08, 0.2, 0.38, 0.56, 0.74, 0.9] as const

export const REFINEMENT_SCAN = {
  maximumAnchors: 8,
  reactionHalfWindowSeconds: 5,
  reactionDurationSeconds: 10,
  reactionFps: 4,
  reactionWidth: 192,
  reactionHeight: 108,
  reactionGridSize: 12,
  movieHalfWindowSeconds: 7,
  movieDurationSeconds: 14,
  movieFps: 4,
  movieWidth: 128,
  movieHeight: 72,
  houghOffsetBinSeconds: 0.25,
  houghInlierToleranceSeconds: 0.5,
  runnerUpExclusionFrames: 20,
  minimumAnchorConfidence: 0.4
} as const

export const DEFAULT_SIGNATURE_GRID_SIZE = 12
export const OFFSET_DECIMAL_PLACES = 6

export const OPENING_EVIDENCE = {
  minimumWindowSize: 3,
  minimumAnchors: 3,
  clusterToleranceSeconds: 0.75,
  minimumSpanSeconds: 6,
  maximumDeviationSeconds: 0.75,
  offsetDecimalPlaces: 6,
  anchorDedupeToleranceSeconds: 1
} as const

export const OPENING_MOTION = {
  minimumSignatures: 12,
  searchBeforeSeconds: 3,
  searchAfterSeconds: 2,
  quietWindowSeconds: 0.75,
  movingWindowSeconds: 1,
  minimumQuietSamples: 3,
  minimumMovingSamples: 5,
  maximumQuietActivity: 0.012,
  minimumMovingActivity: 0.025,
  minimumActivityMultiplier: 3,
  minimumActivityDelta: 0.01,
  timeAdjustmentSeconds: 0.25,
  upperActivityFraction: 0.25
} as const

export const OPENING_CANDIDATE_VERTICAL_POSITIONS = [0.65, 0.75, 0.85] as const
export const OPENING_CANDIDATE_X_POSITIONS = [0.3, 0.32, 0.34, 0.36] as const
export const OPENING_CANDIDATE_Y_POSITIONS = [0.58, 0.61, 0.64, 0.67] as const
export const OPENING_CANDIDATE_WIDTHS = [0.32, 0.36, 0.4] as const
export const OPENING_CANDIDATE_HEIGHTS = [0.18, 0.21, 0.24] as const
export const GEOMETRY_KEY_DECIMAL_PLACES = 3

export const FIT_DEFAULTS = {
  minimumAnchors: 3,
  maximumRobustIterations: 5,
  minimumResidualThresholdSeconds: 0.3,
  minimumMadAllowanceSeconds: 0.15,
  madMultiplier: 3.5,
  minimumSpanFraction: 0.5,
  maximumMedianResidualSeconds: 0.35,
  maximumResidualSeconds: 0.75,
  qualityDenominatorFloor: 0.01,
  spanQualityRange: 0.35,
  offsetDecimalPlaces: 6,
  rateDecimalPlaces: 8
} as const

export const MIN_CONFIDENT_FIT = 0.5

/** Coefficients sum to 1; preserve their expression order in fitting.ts. */
export const CONSENSUS_FIT_CONFIDENCE_WEIGHTS = {
  meanSimilarity: 0.32,
  peakMargin: 0.18,
  supportFraction: 0.12,
  residualQuality: 0.2,
  maximumQuality: 0.1,
  spanQuality: 0.08
} as const

/** Coefficients sum to 1; preserve their expression order in fitting.ts. */
export const LEGACY_FIT_CONFIDENCE_WEIGHTS = {
  anchorConfidence: 0.55,
  residualQuality: 0.25,
  maximumQuality: 0.12,
  spanQuality: 0.08
} as const

export const RELIABLE_CONSENSUS = {
  minimumPeakMargin: 0.02,
  minimumMeanSimilarity: 0.35,
  minimumSupportFraction: 0.4,
  maximumMeanSeedResidualSeconds: 0.75,
  maximumSeedResidualSeconds: 0.8
} as const

export const FIT_NUMERICS = {
  varianceEpsilon: 1e-9,
  weightSumEpsilon: 1e-9,
  weightEpsilon: 1e-6,
  minimumConfidenceWeight: 0.05,
  confidenceWeightExponent: 2
} as const

export const RATE_SNAPPING = {
  maximumTolerance: 0.0015,
  minimumTolerance: 0.00003,
  standardErrorMultiplier: 2.5,
  improvementEpsilon: 1e-6,
  maximumResidualSlackSeconds: 0.1
} as const

export const MATCH_DEFAULTS = {
  minimumWindowSize: 3,
  windowSize: 5,
  minimumConfidence: 0.42,
  minimumSequenceActivity: 0.025,
  runnerUpWindowMultiplier: 2,
  minimumDedupeTolerance: 1,
  minimumCandidateCount: 2,
  maximumCandidatesPerProbe: 64,
  minimumReferenceTimeBinSeconds: 0.001,
  referenceTimeBinSeconds: 0.25,
  runnerUpDistanceFloor: 0.08,
  fitWeightEpsilon: 1e-6,
  burstFitWeightExponent: 2
} as const

/** Coefficients sum to 1 and are shared by direct and Hough-selected matches. */
export const MATCH_CONFIDENCE_WEIGHTS = {
  rawSimilarity: 0.58,
  separation: 0.42
} as const

export const SEQUENCE_SCORING = {
  maximumCutBoost: 2.5,
  cutBoostMultiplier: 5,
  maximumMotionDifference: 1,
  motionDifferenceMultiplier: 2.5
} as const

/** Coefficients sum to 1; preserve their expression order in matching.ts. */
export const SEQUENCE_SCORE_WEIGHTS = {
  spatial: 0.62,
  motion: 0.18,
  temporalOrdinal: 0.2
} as const

export const HOUGH_DEFAULTS = {
  minimumSupport: 3,
  minimumOffsetBinSeconds: 0.01,
  offsetBinSeconds: 0.25,
  inlierToleranceMultiplier: 2,
  minimumRunnerUpRidgeToleranceSeconds: 3,
  runnerUpRidgeToleranceMultiplier: 4,
  minimumReactionRadiusSeconds: 1,
  maximumSlopeStep: 0.001,
  slopeResolutionDivisor: 2,
  maximumSlopeBins: 5000,
  slopeStepEpsilon: 1e-7,
  peakScoreEpsilon: 1e-9,
  localScoreTieBreaker: 1e-6,
  minimumProximity: 0.05,
  fitWeightEpsilon: 1e-6,
  burstFitWeightExponent: 2,
  runnerUpDistanceFloor: 0.08,
  probeTimeDecimalPlaces: 6
} as const

/** Primary coefficients sum to 1; the tie breaker is deliberately separate. */
export const HOUGH_LOCAL_SCORE_WEIGHTS = {
  rawSimilarity: 0.85,
  burstSimilarity: 0.15
} as const

export const INSET_GEOMETRY = {
  commonPlayerAspectRatio: 16 / 9,
  minimumFrames: 7,
  probeCount: 11,
  minimumAnchors: 3,
  gridSize: 8,
  matchWindowSize: 5,
  minimumMatchConfidence: 0.28,
  minimumSequenceActivity: 0.018,
  offsetClusterToleranceSeconds: 14,
  maskBootstrapAnchors: 2,
  minimumConsistencyToleranceSeconds: 1.5,
  dispersionMultiplier: 3,
  consistencyScaleSeconds: 4,
  anchorSaturationCount: 4,
  runnerUpGeometryDistance: 0.08,
  finalSeparationWeight: 1.5,
  maximumAnchorConfidenceBonus: 0.15,
  confidenceBonusPerAnchor: 0.03,
  minimumConfidence: 0.44,
  probeFrameMargin: 3,
  flipDistancePenalty: 0.2,
  maskMinimumAnchors: 4,
  maskMinimumConfidenceImprovement: 0.08
} as const

/** Coefficients sum to 1; preserve their expression order in insetGeometry.ts. */
export const GEOMETRY_SCORE_WEIGHTS = {
  confidence: 0.7,
  consistency: 0.2,
  anchorCount: 0.1
} as const

export const GEOMETRY_FINAL_CONFIDENCE_WEIGHT = 0.7
export const GENERAL_GEOMETRY_WIDTHS = [0.32, 0.45, 0.6, 0.78] as const
export const COMPACT_GEOMETRY_WIDTHS = [0.2, 0.24, 0.28] as const
export const GEOMETRY_AXIS_POSITIONS = [0, 0.5, 1] as const
export const GEOMETRY_CORNER_POSITIONS = [0, 1] as const
export const GEOMETRY_REFINEMENT = {
  aspectRatioDenominatorFloor: 0.01,
  narrowWidthThreshold: 0.32,
  narrowMinimumWidth: 0.18,
  standardMinimumWidth: 0.32,
  widthDeltas: [-0.08, -0.04, 0, 0.04, 0.08],
  positionDeltas: [-0.05, 0, 0.05]
} as const

export const SIGNATURE_GRID = { minimum: 4, maximum: 32, default: 16 } as const
export const SIGNATURE_DISTANCE = {
  minimumLumaContrast: 0.04,
  maximumLumaError: 4,
  maximumChromaError: 1,
  retainedSpatialFraction: 0.82,
  retainedChromaFraction: 0.82,
  brightnessMultiplier: 2,
  contrastMultiplier: 3
} as const

/** Coefficients sum to 1; preserve their expression order in signatures.ts. */
export const SIGNATURE_DISTANCE_WEIGHTS = {
  spatial: 0.62,
  chroma: 0.16,
  brightness: 0.14,
  contrast: 0.08
} as const

export const TEMPORAL_MASK = {
  quietPercentile: 0.1,
  minimumMedianActivity: 0.006,
  maximumQuietToMedianRatio: 0.62,
  maximumSeedActivity: 0.025,
  seedMedianMultiplier: 0.5,
  maximumGrowActivity: 0.045,
  growMedianMultiplier: 0.75,
  minimumComponentSize: 2,
  maximumMaskedFraction: 0.5,
  maskedCellWeight: 0.06,
  minimumSignatures: 7,
  chromaActivityWeight: 0.2
} as const

export const NORMALIZED_RECT_MINIMUM_SIZE = 0.01
export const WEIGHT_EPSILON = 1e-6
