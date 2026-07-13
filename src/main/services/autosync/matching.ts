import { signatureDistance, type FrameSignature } from './signatures'

export interface TimedSignature {
  time: number
  signature: FrameSignature
}

export interface AutoSyncAnchor {
  reactionTime: number
  movieTime: number
  confidence: number
  score: number
  runnerUpScore: number
}

export interface MatchOptions {
  windowSize?: number
  minimumConfidence?: number
  minimumSequenceActivity?: number
  runnerUpExclusionFrames?: number
}

export function findSequenceAnchors(
  reaction: TimedSignature[],
  movie: TimedSignature[],
  probeTimes: number[],
  options: MatchOptions = {}
): AutoSyncAnchor[] {
  const windowSize = makeOdd(Math.max(3, options.windowSize ?? 5))
  const halfWindow = Math.floor(windowSize / 2)
  const minimumConfidence = options.minimumConfidence ?? 0.42
  const anchors: AutoSyncAnchor[] = []

  for (const probeTime of probeTimes) {
    const center = nearestIndex(reaction, probeTime)
    if (center < halfWindow || center + halfWindow >= reaction.length || movie.length < windowSize) continue
    const window = reaction.slice(center - halfWindow, center + halfWindow + 1)
    const activity = sequenceActivity(window)
    if (activity < (options.minimumSequenceActivity ?? 0.025)) continue
    const match = matchSequence(window, movie, {
      runnerUpExclusionFrames: options.runnerUpExclusionFrames ?? windowSize * 2
    })
    if (match && match.confidence >= minimumConfidence) anchors.push(match)
  }

  return dedupeAnchors(anchors, Math.max(1, windowSize))
}

export function matchSequence(
  reactionWindow: TimedSignature[],
  movie: TimedSignature[],
  options: Pick<MatchOptions, 'runnerUpExclusionFrames'> = {}
): AutoSyncAnchor | null {
  if (reactionWindow.length < 3 || movie.length < reactionWindow.length) return null
  const scores: Array<{ index: number; score: number }> = []
  for (let start = 0; start <= movie.length - reactionWindow.length; start += 1) {
    scores.push({ index: start, score: sequenceScore(reactionWindow, movie.slice(start, start + reactionWindow.length)) })
  }
  scores.sort((a, b) => a.score - b.score)
  const best = scores[0]
  if (!best) return null
  const exclusion = options.runnerUpExclusionFrames ?? reactionWindow.length * 2
  const runnerUp = scores.find((candidate) => Math.abs(candidate.index - best.index) > exclusion) ?? scores[1] ?? best
  const centerOffset = Math.floor(reactionWindow.length / 2)
  const similarity = clamp01(1 - best.score)
  const separation = clamp01((runnerUp.score - best.score) / Math.max(0.08, runnerUp.score))
  const confidence = clamp01(similarity * 0.58 + separation * 0.42)
  return {
    reactionTime: reactionWindow[centerOffset].time,
    movieTime: movie[best.index + centerOffset].time,
    confidence,
    score: best.score,
    runnerUpScore: runnerUp.score
  }
}

export function sequenceActivity(sequence: TimedSignature[]): number {
  if (sequence.length < 2) return 0
  let sum = 0
  for (let index = 1; index < sequence.length; index += 1) {
    sum += signatureDistance(sequence[index - 1].signature, sequence[index].signature)
  }
  return sum / (sequence.length - 1)
}

function sequenceScore(reaction: TimedSignature[], movie: TimedSignature[]): number {
  let spatial = 0
  let motion = 0
  let weightTotal = 0
  for (let index = 0; index < reaction.length; index += 1) {
    const frameDistance = signatureDistance(reaction[index].signature, movie[index].signature)
    const cutWeight = index === 0
      ? 1
      : 1 + Math.min(2.5, signatureDistance(reaction[index - 1].signature, reaction[index].signature) * 5)
    spatial += frameDistance * cutWeight
    weightTotal += cutWeight
    if (index > 0) {
      const reactionMotion = signatureDistance(reaction[index - 1].signature, reaction[index].signature)
      const movieMotion = signatureDistance(movie[index - 1].signature, movie[index].signature)
      motion += Math.min(1, Math.abs(reactionMotion - movieMotion) * 2.5)
    }
  }
  return clamp01((spatial / Math.max(1, weightTotal)) * 0.78 + (motion / Math.max(1, reaction.length - 1)) * 0.22)
}

function dedupeAnchors(anchors: AutoSyncAnchor[], timeTolerance: number): AutoSyncAnchor[] {
  return [...anchors]
    .sort((a, b) => b.confidence - a.confidence)
    .filter((anchor, index, all) => !all.slice(0, index).some((kept) =>
      Math.abs(kept.reactionTime - anchor.reactionTime) < timeTolerance ||
      Math.abs(kept.movieTime - anchor.movieTime) < timeTolerance
    ))
    .sort((a, b) => a.reactionTime - b.reactionTime)
}

function nearestIndex(values: TimedSignature[], time: number): number {
  let best = 0
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < values.length; index += 1) {
    const next = Math.abs(values[index].time - time)
    if (next < distance) { best = index; distance = next }
  }
  return best
}

function makeOdd(value: number): number {
  const rounded = Math.round(value)
  return rounded % 2 === 0 ? rounded + 1 : rounded
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
