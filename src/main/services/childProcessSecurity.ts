import type { ChildProcess } from 'node:child_process'

/**
 * Environment variables that can cause a child Node/Electron process to load
 * code before its entry point. Match case-insensitively because Windows
 * environment keys are case-insensitive.
 */
const UNSAFE_CHILD_ENVIRONMENT_KEY = /^(?:NODE_OPTIONS|NODE_PATH|NODE_REPL_.*|ELECTRON_RUN_AS_NODE)$/i

export interface SecureChildProcessOptions {
  windowsHide: true
  env: NodeJS.ProcessEnv
}

/** Returns a fresh environment without Node/Electron code-injection hooks. */
export function createSanitizedChildEnvironment(
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !UNSAFE_CHILD_ENVIRONMENT_KEY.test(key))
  )
}

/** Common options for every executable launched by WatchAlong. */
export function secureChildProcessOptions(
  source: NodeJS.ProcessEnv = process.env
): SecureChildProcessOptions {
  return {
    windowsHide: true,
    env: createSanitizedChildEnvironment(source)
  }
}

const YT_DLP_ISOLATION_ARGS = ['--ignore-config', '--no-plugin-dirs'] as const

/**
 * Prevents user-level yt-dlp configuration and plugins from changing the
 * behavior of WatchAlong-owned invocations.
 */
export function secureYtDlpArgs(args: readonly string[]): string[] {
  const isolationArgs = new Set<string>(YT_DLP_ISOLATION_ARGS)
  return [
    ...YT_DLP_ISOLATION_ARGS,
    ...args.filter((argument) => !isolationArgs.has(argument))
  ]
}

const CHILD_TERMINATION_GRACE_MS = 1_000
const CHILD_TERMINATION_FALLBACK_MS = 3_000

/** Terminates a child and resolves only after process exit/close is confirmed. */
export function terminateChildProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    let escalationTimer: ReturnType<typeof setTimeout> | undefined
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (): void => {
      if (settled) return
      settled = true
      if (escalationTimer) clearTimeout(escalationTimer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      child.removeListener('close', finish)
      child.removeListener('exit', finish)
      resolve()
    }

    child.once('close', finish)
    child.once('exit', finish)
    if (isChildConfirmedStopped(child)) {
      finish()
      return
    }
    try {
      const signalled = child.kill()
      if (!signalled && isChildConfirmedStopped(child)) finish()
    } catch {
      if (isChildConfirmedStopped(child)) finish()
    }
    if (settled) return

    escalationTimer = setTimeout(() => {
      try {
        const signalled = child.kill('SIGKILL')
        if (!signalled && isChildConfirmedStopped(child)) finish()
      } catch {
        if (isChildConfirmedStopped(child)) finish()
      }
    }, CHILD_TERMINATION_GRACE_MS)
    escalationTimer.unref?.()

    fallbackTimer = setTimeout(() => {
      // A final force-kill is the bounded fallback action. Do not claim that
      // credential cleanup is safe until Node confirms process exit/close.
      try {
        const signalled = child.kill('SIGKILL')
        if (!signalled && isChildConfirmedStopped(child)) finish()
      } catch {
        if (isChildConfirmedStopped(child)) finish()
      }
    }, CHILD_TERMINATION_FALLBACK_MS)
    fallbackTimer.unref?.()
  })
}

function isChildConfirmedStopped(child: ChildProcess): boolean {
  if (child.exitCode !== null && child.exitCode !== undefined) return true
  if (child.signalCode !== null && child.signalCode !== undefined) return true
  if (child.pid === undefined) return false

  try {
    process.kill(child.pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}
