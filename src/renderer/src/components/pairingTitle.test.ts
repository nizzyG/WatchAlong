import { describe, expect, it } from 'vitest'
import { buildSuggestedPairingTitle } from './pairingTitle'

describe('buildSuggestedPairingTitle', () => {
  it('combines a readable movie filename with sanitized creator metadata', () => {
    expect(buildSuggestedPairingTitle('C:\\Movies\\A.Goofy_Movie.mkv', "  Camilla's\n Corner  ")).toBe(
      "A Goofy Movie — Camilla's Corner"
    )
  })

  it('lets session creation keep its filename fallback when creator metadata is absent', () => {
    expect(buildSuggestedPairingTitle('C:\\Movies\\Aladdin.mp4')).toBeUndefined()
    expect(buildSuggestedPairingTitle('C:\\Movies\\Aladdin.mp4', '\u0000\n')).toBeUndefined()
  })
})
