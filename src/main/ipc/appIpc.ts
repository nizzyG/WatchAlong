import { IPC_PREFIX } from '../constants'
import { handleTrustedIpc } from './security'

export function registerAppIpc({ getVersion }: { getVersion: () => string }): void {
  handleTrustedIpc(`${IPC_PREFIX}:get-app-version`, ['main'], () => getVersion())
}
