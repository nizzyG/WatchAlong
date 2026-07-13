import { useRef, useState } from 'react'
import type { DownloadProgressEvent } from '@shared/types'

export function useDownloads() {
  const pausedForWizardRef = useRef(false)
  const downloadIndicatorTimerRef = useRef<number | null>(null)
  const [patreonStorageJobId, setPatreonStorageJobId] = useState<string | null>(null)
  const [downloadIndicator, setDownloadIndicator] = useState<DownloadProgressEvent | null>(null)
  const [downloadEvents, setDownloadEvents] = useState<DownloadProgressEvent[]>([])
  return {
    pausedForWizardRef, downloadIndicatorTimerRef, patreonStorageJobId, setPatreonStorageJobId,
    downloadIndicator, setDownloadIndicator, downloadEvents, setDownloadEvents
  }
}

export type DownloadsHook = ReturnType<typeof useDownloads>
