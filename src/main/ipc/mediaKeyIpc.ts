import { IPC_PREFIX } from '../constants'
import { MediaKeyController } from '../mediaKeyController'
import { handleTrustedIpc } from './security'

export function registerMediaKeyIpc({ mediaKeys }: { mediaKeys: MediaKeyController }): void {
  handleTrustedIpc(
    `${IPC_PREFIX}:set-media-play-pause-enabled`,
    ['main'],
    (event, enabled: unknown) => mediaKeys.setPlayPauseEnabled(event.sender, enabled)
  )
}
