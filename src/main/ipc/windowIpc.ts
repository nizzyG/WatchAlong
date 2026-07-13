import { ipcMain } from 'electron'
import type { ImportWizardLaunchOptions, WizardOutcome } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { WindowManager } from '../WindowManager'

export function registerWindowIpc({ windowManager }: { windowManager: WindowManager }): void {
  ipcMain.handle(`${IPC_PREFIX}:open-onboarding-wizard`, () => windowManager.openOnboardingWizard({ mode: 'new' }))
  ipcMain.handle(`${IPC_PREFIX}:open-import-wizard`, (_event, options?: ImportWizardLaunchOptions) => windowManager.openOnboardingWizard(options))
  ipcMain.handle(`${IPC_PREFIX}:get-import-wizard-context`, () => windowManager.getImportWizardContext())
  ipcMain.handle(`${IPC_PREFIX}:finish-onboarding-wizard`, (_event, outcome: WizardOutcome) => windowManager.finishOnboardingWizard(outcome))
  ipcMain.handle(`${IPC_PREFIX}:confirm-main-window-close`, () => windowManager.confirmMainWindowClose())
}
