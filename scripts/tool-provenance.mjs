import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

const MANIFEST_START = '<!-- tool-integrity-manifest:start -->'
const MANIFEST_END = '<!-- tool-integrity-manifest:end -->'
const MANAGED_TOOL_DIRECTORIES = [
  'resources/tools/yt-dlp',
  'resources/tools/ffmpeg',
  'resources/tools/node'
]
const LEGACY_TOOL_PATHS = []

export function parseToolProvenance(markdown) {
  const start = markdown.indexOf(MANIFEST_START)
  const end = markdown.indexOf(MANIFEST_END)
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('TOOL_PROVENANCE.md is missing its integrity manifest markers.')
  }

  const manifest = markdown.slice(start + MANIFEST_START.length, end)
  const rowPattern = /^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| \[([^\]]+)\]\((https:\/\/[^)\s]+)\) \| `([a-f0-9]{64})` \|$/
  const entries = []

  for (const line of manifest.split(/\r?\n/)) {
    if (!line.startsWith('| `')) {
      continue
    }

    const match = line.match(rowPattern)
    if (!match) {
      throw new Error(`Malformed tool provenance row: ${line}`)
    }

    entries.push({
      path: match[1],
      target: match[2].trim(),
      version: match[3].trim(),
      sourceLabel: match[4],
      sourceUrl: match[5],
      sha256: match[6]
    })
  }

  if (entries.length === 0) {
    throw new Error('TOOL_PROVENANCE.md does not list any tool binaries.')
  }

  const paths = new Set()
  for (const entry of entries) {
    if (paths.has(entry.path)) {
      throw new Error(`Duplicate tool provenance path: ${entry.path}`)
    }
    paths.add(entry.path)
  }

  return entries
}

export async function discoverToolBinaries(repositoryRoot) {
  const discovered = []

  for (const directory of MANAGED_TOOL_DIRECTORIES) {
    const absoluteDirectory = resolve(repositoryRoot, directory)
    let children
    try {
      children = await readdir(absoluteDirectory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }

    for (const child of children) {
      if (child.isFile()) {
        discovered.push(`${directory}/${child.name}`)
      }
    }
  }

  for (const legacyPath of LEGACY_TOOL_PATHS) {
    try {
      if ((await stat(resolve(repositoryRoot, legacyPath))).isFile()) {
        discovered.push(legacyPath)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }

  return discovered.sort()
}

export async function verifyToolProvenance(repositoryRoot, markdown) {
  const entries = parseToolProvenance(markdown)
  const discovered = await discoverToolBinaries(repositoryRoot)
  const manifestPaths = new Set(entries.map((entry) => entry.path))
  const discoveredPaths = new Set(discovered)
  const missingFromManifest = discovered.filter((path) => !manifestPaths.has(path))
  const missingFromRepository = entries
    .map((entry) => entry.path)
    .filter((path) => !discoveredPaths.has(path))

  if (missingFromManifest.length > 0 || missingFromRepository.length > 0) {
    const details = [
      ...missingFromManifest.map((path) => `not listed in TOOL_PROVENANCE.md: ${path}`),
      ...missingFromRepository.map((path) => `listed but missing from the repository: ${path}`)
    ]
    throw new Error(`Tool provenance inventory mismatch:\n- ${details.join('\n- ')}`)
  }

  const mismatches = []
  for (const entry of entries) {
    const absolutePath = resolve(repositoryRoot, entry.path)
    const repositoryRelativePath = relative(repositoryRoot, absolutePath)
    if (repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath)) {
      throw new Error(`Tool provenance path escapes the repository: ${entry.path}`)
    }

    const actual = await sha256File(absolutePath)
    if (actual !== entry.sha256) {
      mismatches.push(`${entry.path}\n  expected ${entry.sha256}\n  actual   ${actual}`)
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Bundled tool SHA-256 mismatch:\n${mismatches.join('\n')}`)
  }

  return entries
}

function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}
