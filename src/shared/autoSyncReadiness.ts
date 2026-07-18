import type { AutoSyncCompleteEvent } from './types'

export function isAutoSyncReady(result: AutoSyncCompleteEvent | null | undefined): boolean {
  return result?.outcome === 'confident' || (
    result?.outcome === 'partial' && result.readyToPlay === true
  )
}
