import { Lock, X } from 'lucide-react'
import { useState } from 'react'
import type { SavedPatreonSessionStatus } from '@shared/types'

interface PatreonStorageOfferProps {
  jobId: string
  onDismiss(): void
}

export function PatreonStorageOffer({ jobId, onDismiss }: PatreonStorageOfferProps): JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [learnMore, setLearnMore] = useState(false)
  const [status, setStatus] = useState<SavedPatreonSessionStatus | null>(null)

  const toggle = async (): Promise<void> => {
    if (!enabled) {
      const nextStatus = await window.watchAlong.saveLastPatreonSession(jobId)
      setStatus(nextStatus)
      setEnabled(nextStatus.available)
    } else {
      const nextStatus = await window.watchAlong.forgetPatreonSession()
      setStatus(nextStatus)
      setEnabled(false)
    }
  }

  const dismiss = async (): Promise<void> => {
    try {
      await window.watchAlong.discardLastPatreonSession(jobId)
    } finally {
      onDismiss()
    }
  }

  return (
    <aside className="patreon-storage-offer" aria-label="Save Patreon session">
      <div className="offer-lock">
        <Lock size={18} aria-hidden />
      </div>
      <div>
        <strong>Want to skip this step next time?</strong>
        <p>We can securely save your Patreon session on this device, encrypted with your OS keychain.</p>
        {learnMore && (
          <p className="learn-more-text">
            WatchAlong uses Electron safeStorage for device-local encryption. The session can be deleted from this app at any time.
          </p>
        )}
        {status && !status.canEncrypt && <p className="learn-more-text">Secure storage is not available on this device.</p>}
      </div>
      <label className="storage-toggle">
        <input type="checkbox" checked={enabled} onChange={() => void toggle()} />
        <span>Save</span>
      </label>
      <button className="link-button" type="button" onClick={() => setLearnMore((current) => !current)}>
        Learn more
      </button>
      <button className="icon-button" type="button" title="Dismiss" aria-label="Dismiss" onClick={() => void dismiss()}>
        <X size={16} aria-hidden />
      </button>
    </aside>
  )
}
