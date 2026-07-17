import { FIT_DEFAULTS } from './constants'
import {
  fitAnchors,
  isConfidentFit,
  isReliableConsensusEvidence,
  type AutoSyncFit,
  type FitConsensusEvidence
} from './fitting'
import {
  voteForTemporalConsensus,
  type HoughConsensus,
  type HoughVotingOptions
} from './houghVoting'
import {
  applyBurstinessReweighting,
  selectBurstWeightedMatches,
  type AutoSyncAnchor,
  type SequenceMatchCandidate
} from './matching'

export interface AnchorMatchSet {
  anchors: AutoSyncAnchor[]
  consensus: HoughConsensus | null
}

export function resolveCandidateGroups(
  candidateGroups: SequenceMatchCandidate[][],
  houghOptions: HoughVotingOptions,
  runnerUpExclusionFrames: number,
  minimumConfidence: number
): AnchorMatchSet {
  const weighted = applyBurstinessReweighting(candidateGroups)
  const consensus = voteForTemporalConsensus(weighted, houghOptions)
  if (consensus && isReliableConsensusEvidence(consensusEvidence(consensus))) {
    return { anchors: consensus.anchors, consensus }
  }
  return {
    anchors: selectBurstWeightedMatches(candidateGroups, { runnerUpExclusionFrames })
      .filter((match) => match.confidence >= minimumConfidence),
    consensus: null
  }
}

export function fitMatchSet(matched: AnchorMatchSet, movieDuration: number): AutoSyncFit | null {
  if (!matched.consensus || matched.anchors.length < FIT_DEFAULTS.minimumAnchors) return null
  return fitAnchors(matched.anchors, {
    movieDuration,
    seedAnchors: matched.consensus.anchors,
    consensusEvidence: consensusEvidence(matched.consensus)
  })
}

export function consensusEvidence(consensus: HoughConsensus): FitConsensusEvidence {
  return {
    peakMargin: consensus.peakMargin,
    supportFraction: consensus.supportFraction,
    meanSimilarity: consensus.meanSimilarity,
    meanSeedResidual: consensus.meanSeedResidual,
    maximumSeedResidual: consensus.maximumSeedResidual
  }
}

export function choosePreferredFit(...fits: Array<AutoSyncFit | null>): AutoSyncFit | null {
  return fits.filter((fit): fit is AutoSyncFit => Boolean(fit)).sort((a, b) =>
    Number(isConfidentFit(b)) - Number(isConfidentFit(a)) ||
    b.confidence - a.confidence
  )[0] ?? null
}
