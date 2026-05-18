import { describe, expect, it } from 'vitest'
import { supersedeCommands } from './commandQueue'
import type { SyncCommand } from '@shared/types'

describe('supersedeCommands', () => {
  it('keeps only the newest pending seek-like command', () => {
    const queue: SyncCommand[] = [
      { type: 'seekReaction', time: 10 },
      { type: 'play' }
    ]

    expect(supersedeCommands(queue, { type: 'seekMovie', time: 40 })).toEqual([
      { type: 'play' },
      { type: 'seekMovie', time: 40 }
    ])
  })

  it('collapses contradictory play and pause commands', () => {
    const queue: SyncCommand[] = [{ type: 'play' }]

    expect(supersedeCommands(queue, { type: 'pause' })).toEqual([{ type: 'pause' }])
  })
})
