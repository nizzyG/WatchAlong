import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeChildEnvironment } from './child-process-security.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = resolve(repositoryRoot, 'resources', 'tools', 'patreon-dl')
const verifierPath = resolve(repositoryRoot, 'scripts', 'verify-patreon-tools.mjs')
const targetPlatform = normalizePlatform(
  process.env.WATCHALONG_TARGET_PLATFORM ?? process.platform
)
const targetArch = normalizeArch(process.env.WATCHALONG_TARGET_ARCH ?? process.arch)
const targetNodeVersion =
  process.env.WATCHALONG_TARGET_NODE_VERSION ?? process.versions.node
const dryRun = process.argv.includes('--dry-run')

if (!/^\d+\.\d+\.\d+$/.test(targetNodeVersion)) {
  throw new Error(`Unsupported Patreon tool Node target: ${targetNodeVersion}`)
}

const installEnvironment = {
  ...sanitizeChildEnvironment(),
  WATCHALONG_TARGET_PLATFORM: targetPlatform,
  WATCHALONG_TARGET_ARCH: targetArch,
  WATCHALONG_TARGET_NODE_VERSION: targetNodeVersion,
  // Standard WatchAlong downloads use patreon-dl's cookie-backed HTTP path.
  // Puppeteer's optional browser is cached outside packaged resources, so a
  // CI download would never ship to users or provide its runtime fallback.
  // Skip that unshipped download to keep release builds deterministic.
  PUPPETEER_SKIP_DOWNLOAD: 'true',
  // Native installers such as prebuild-install and node-gyp consume these
  // values. This lets an x64 CI host install an arm64 binding for an arm64 DMG.
  npm_config_platform: targetPlatform,
  npm_config_arch: targetArch,
  npm_config_target: targetNodeVersion
}
const npmArguments = ['ci', '--omit=dev', '--prefix', packageRoot]

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        command: npmCommandDescription(),
        arguments: npmArguments,
        target: {
          platform: targetPlatform,
          arch: targetArch,
          node: targetNodeVersion
        },
        installPolicy: {
          puppeteerBrowserDownloads: installEnvironment.PUPPETEER_SKIP_DOWNLOAD !== 'true'
        }
      },
      null,
      2
    )
  )
  process.exit(0)
}

console.log(
  `[WatchAlong] Installing Patreon tools for ${targetPlatform}-${targetArch} ` +
    `(Node ${targetNodeVersion})...`
)
runNpm(npmArguments, installEnvironment)
runProcess(process.execPath, [verifierPath], installEnvironment)

function runNpm(args, environment) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath) {
    runProcess(process.execPath, [npmExecPath, ...args], environment)
    return
  }

  runProcess(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, environment)
}

function npmCommandDescription() {
  return process.env.npm_execpath
    ? `${process.execPath} ${process.env.npm_execpath}`
    : process.platform === 'win32'
      ? 'npm.cmd'
      : 'npm'
}

function runProcess(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${String(result.status)}`)
  }
}

function normalizePlatform(value) {
  const normalized = value.toLowerCase()
  if (normalized === 'win32' || normalized === 'darwin' || normalized === 'linux') {
    return normalized
  }
  throw new Error(`Unsupported Patreon tool platform: ${value}`)
}

function normalizeArch(value) {
  const normalized = value.toLowerCase()
  if (normalized === 'x64' || normalized === 'amd64') {
    return 'x64'
  }
  if (normalized === 'arm64' || normalized === 'aarch64') {
    return 'arm64'
  }
  throw new Error(`Unsupported Patreon tool architecture: ${value}`)
}
