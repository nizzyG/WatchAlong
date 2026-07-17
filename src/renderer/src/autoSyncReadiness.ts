import type { AutoSyncCompleteEvent } from '@shared/types'

export function isAutoSyncReady(result: AutoSyncCompleteEvent | null | undefined): boolean {
  return result?.outcome === 'confident' || (
    result?.outcome === 'partial' && result.readyToPlay === true
  )
}
