import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeChildEnvironment } from './child-process-security.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const toolsRoot = resolve(repositoryRoot, 'resources', 'tools')
const installationRoot = resolve(toolsRoot, 'patreon-dl')
const packageRoot = resolve(installationRoot, 'node_modules', 'patreon-dl')
const nativePackageRoot = resolve(installationRoot, 'node_modules', 'better-sqlite3')
const targetPlatform = normalizePlatform(
  process.env.WATCHALONG_TARGET_PLATFORM ?? process.platform
)
const targetArch = normalizeArch(process.env.WATCHALONG_TARGET_ARCH ?? process.arch)
const targetNodeVersion =
  process.env.WATCHALONG_TARGET_NODE_VERSION ?? process.versions.node
if (!/^\d+\.\d+\.\d+$/.test(targetNodeVersion)) {
  throw new Error(`Unsupported Patreon tool Node target: ${targetNodeVersion}`)
}
const bundledNodeFilename = getBundledNodeFilename(targetPlatform, targetArch)
const bundledNodePath = bundledNodeFilename
  ? resolve(toolsRoot, 'node', bundledNodeFilename)
  : null
const nativeBindingPath = resolve(
  nativePackageRoot,
  'build',
  'Release',
  'better_sqlite3.node'
)
const requiredArtifacts = [
  ...(bundledNodePath ? [bundledNodePath] : []),
  resolve(packageRoot, 'package.json'),
  resolve(packageRoot, 'bin', 'patreon-dl.js'),
  resolve(packageRoot, 'dist', 'cli', 'index.js'),
  resolve(nativePackageRoot, 'package.json'),
  nativeBindingPath
]
const missingArtifacts = requiredArtifacts.filter((filePath) => !isNonEmptyFile(filePath))

if (missingArtifacts.length > 0) {
  throw new Error(
    `The Patreon downloader installation is incomplete. Missing: ${missingArtifacts
      .map(relativeToRepository)
      .join(', ')}`
  )
}

if (bundledNodePath) {
  assertBinaryArchitecture(bundledNodePath, targetPlatform, targetArch, 'bundled Node runtime')
}
assertBinaryArchitecture(nativeBindingPath, targetPlatform, targetArch, 'better-sqlite3 binding')

const canRunTarget = targetPlatform === process.platform && targetArch === process.arch
const staticOnly = process.argv.includes('--static-only')
if (canRunTarget && !staticOnly) {
  smokeTestNativeBinding()
} else {
  const reason = staticOnly
    ? 'static-only verification was requested'
    : `the build host is ${process.platform}-${process.arch}`
  console.log(`[WatchAlong] Skipped Patreon native runtime smoke test because ${reason}.`)
}

console.log(
  `[WatchAlong] Patreon downloader artifacts verified for ${targetPlatform}-${targetArch}.`
)

function smokeTestNativeBinding() {
  const runtimePath = bundledNodePath ?? process.execPath
  const smokeProgram = [
    'const Database = require(process.argv[1])',
    "const database = new Database(':memory:')",
    "const result = database.prepare('SELECT 1 AS ready').get()",
    'database.close()',
    "if (result.ready !== 1) throw new Error('SQLite smoke query failed')",
    "process.stdout.write(JSON.stringify({ node: process.versions.node, ready: true }))"
  ].join(';')
  const result = spawnSync(runtimePath, ['-e', smokeProgram, nativePackageRoot], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: sanitizeChildEnvironment(),
    windowsHide: true
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const details = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim()
    throw new Error(
      `The bundled Node runtime could not load better-sqlite3: ${details || `exit ${String(result.status)}`}`
    )
  }

  let smokeResult
  try {
    smokeResult = JSON.parse(result.stdout)
  } catch {
    throw new Error('The Patreon native runtime smoke test returned invalid output.')
  }
  if (smokeResult.ready !== true || smokeResult.node !== targetNodeVersion) {
    throw new Error(
      `The bundled Patreon runtime is Node ${String(smokeResult.node)}, expected ${targetNodeVersion}.`
    )
  }
}

function assertBinaryArchitecture(filePath, platform, arch, label) {
  const architectures = readBinaryArchitectures(filePath, platform)
  if (!architectures.has(arch)) {
    throw new Error(
      `The ${label} has architecture ${[...architectures].join(', ') || 'unknown'}, ` +
        `but ${arch} is required: ${relativeToRepository(filePath)}`
    )
  }
}

function readBinaryArchitectures(filePath, platform) {
  const header = readHeader(filePath)
  if (platform === 'win32') {
    if (header.toString('ascii', 0, 2) !== 'MZ') {
      return new Set()
    }
    const peOffset = header.readUInt32LE(0x3c)
    if (
      peOffset + 6 > header.length ||
      header.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0'
    ) {
      return new Set()
    }
    return new Set(
      [windowsMachineToArch(header.readUInt16LE(peOffset + 4))].filter(Boolean)
    )
  }

  if (platform === 'linux') {
    if (
      header[0] !== 0x7f ||
      header[1] !== 0x45 ||
      header[2] !== 0x4c ||
      header[3] !== 0x46
    ) {
      return new Set()
    }
    const machine = header[5] === 2 ? header.readUInt16BE(18) : header.readUInt16LE(18)
    return new Set([elfMachineToArch(machine)].filter(Boolean))
  }

  const magic = header.readUInt32BE(0)
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const entrySize = magic === 0xcafebabf ? 32 : 20
    const count = header.readUInt32BE(4)
    const architectures = new Set()
    for (let index = 0; index < count; index += 1) {
      const offset = 8 + index * entrySize
      if (offset + 4 > header.length) break
      const arch = machCpuToArch(header.readUInt32BE(offset))
      if (arch) architectures.add(arch)
    }
    return architectures
  }

  if (header.readUInt32LE(0) === 0xfeedfacf) {
    const arch = machCpuToArch(header.readUInt32LE(4))
    return new Set(arch ? [arch] : [])
  }
  return new Set()
}

function windowsMachineToArch(machine) {
  if (machine === 0x8664) return 'x64'
  if (machine === 0xaa64) return 'arm64'
  return null
}

function machCpuToArch(cpuType) {
  if (cpuType === 0x01000007) return 'x64'
  if (cpuType === 0x0100000c) return 'arm64'
  return null
}

function elfMachineToArch(machine) {
  if (machine === 62) return 'x64'
  if (machine === 183) return 'arm64'
  return null
}

function readHeader(filePath) {
  const file = openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(16 * 1024)
    const bytesRead = readSync(file, header, 0, header.length, 0)
    return header.subarray(0, bytesRead)
  } finally {
    closeSync(file)
  }
}

function isNonEmptyFile(filePath) {
  try {
    const stats = statSync(filePath)
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}

function relativeToRepository(filePath) {
  return filePath.slice(repositoryRoot.length + 1)
}

function getBundledNodeFilename(platform, arch) {
  if (platform === 'win32') {
    if (arch !== 'x64') {
      throw new Error(`WatchAlong does not bundle Node for Windows ${arch}.`)
    }
    return 'node.exe'
  }
  if (platform === 'linux') {
    return null
  }
  return `node-darwin-${arch}`
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
