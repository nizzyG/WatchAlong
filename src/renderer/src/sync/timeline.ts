export interface TimelineMappingOptions {
  offsetSeconds: number
  movieRateCorrection?: number
  reactionDuration?: number
  movieDuration?: number
}

export class TimelineMapping {
  constructor(private readonly options: TimelineMappingOptions) {}

  /**
   * WatchAlong uses the reaction video as the canonical timeline. The movie is a
   * secondary source that may need a tiny source-rate trim for 24.000 vs 23.976
   * masters, so the mapping is movieTime = reactionTime * rate + userOffset.
   */
  reactionToMovie(reactionTime: number): number {
    return clampToDuration(this.rawReactionToMovie(reactionTime), this.options.movieDuration)
  }

  movieToReaction(movieTime: number): number {
    return clampToDuration((finiteOr(movieTime, 0) - this.options.offsetSeconds) / this.movieRateCorrection(), this.options.reactionDuration)
  }

  clampReaction(reactionTime: number): number {
    return clampToDuration(reactionTime, this.options.reactionDuration)
  }

  clampMovie(movieTime: number): number {
    return clampToDuration(movieTime, this.options.movieDuration)
  }

  effectiveOffsetAt(reactionTime: number): number {
    return this.rawReactionToMovie(reactionTime) - finiteOr(reactionTime, 0)
  }

  rawReactionToMovie(reactionTime: number): number {
    return finiteOr(reactionTime, 0) * this.movieRateCorrection() + this.options.offsetSeconds
  }

  movieRateCorrection(): number {
    return finiteOr(this.options.movieRateCorrection, 1) || 1
  }

  static calculateOffset(reactionTime: number, movieTime: number, movieRateCorrection = 1): number {
    return finiteOr(movieTime, 0) - finiteOr(reactionTime, 0) * (finiteOr(movieRateCorrection, 1) || 1)
  }
}

export function clampToDuration(value: number, duration?: number): number {
  const safeValue = Math.max(0, finiteOr(value, 0))
  return Number.isFinite(duration) && duration !== undefined ? Math.min(safeValue, Math.max(0, duration)) : safeValue
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
