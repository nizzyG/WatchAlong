import type { ImportWizardLaunchOptions, WizardOutcome } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { WindowManager } from '../WindowManager'
import { handleTrustedIpc } from './security'

export function registerWindowIpc({ windowManager }: { windowManager: WindowManager }): void {
  handleTrustedIpc(`${IPC_PREFIX}:open-onboarding-wizard`, ['main'], () => windowManager.openOnboardingWizard({ mode: 'new' }))
  handleTrustedIpc(`${IPC_PREFIX}:open-import-wizard`, ['main'], (_event, options?: ImportWizardLaunchOptions) => windowManager.openOnboardingWizard(options))
  handleTrustedIpc(`${IPC_PREFIX}:get-import-wizard-context`, ['wizard'], () => windowManager.getImportWizardContext())
  handleTrustedIpc(`${IPC_PREFIX}:finish-onboarding-wizard`, ['wizard'], (_event, outcome: WizardOutcome) => windowManager.finishOnboardingWizard(outcome))
  handleTrustedIpc(`${IPC_PREFIX}:confirm-main-window-close`, ['main'], () => windowManager.confirmMainWindowClose())
}
