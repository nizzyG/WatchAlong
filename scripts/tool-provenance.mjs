import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

const MANIFEST_START = '<!-- tool-integrity-manifest:start -->'
const MANIFEST_END = '<!-- tool-integrity-manifest:end -->'
const MANAGED_TOOL_DIRECTORIES = [
  'resources/tools/yt-dlp',
  'resources/tools/ffmpeg',
  'resources/tools/node'
]
const LEGACY_TOOL_PATHS = []
const FORBIDDEN_FFMPEG_MARKERS = [
  '--enable-nonfree',
  'nonfree and unredistributable'
]
const REQUIRED_LFS_ATTRIBUTES = new Map([
  ['filter', 'lfs'],
  ['diff', 'lfs'],
  ['merge', 'lfs'],
  ['text', 'unset']
])

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

export async function verifyGitLfsAttributeCoverage(
  repositoryRoot,
  manifestEntries,
  { runGit = defaultRunGit, hasGitMetadata = defaultHasGitMetadata } = {}
) {
  let gitMetadataPresent
  try {
    gitMetadataPresent = await hasGitMetadata(repositoryRoot)
  } catch (error) {
    throw new Error(`Unable to inspect Git metadata: ${formatError(error)}`)
  }

  if (!gitMetadataPresent) {
    return { checked: false, lfsPathCount: 0 }
  }

  let isWorktree
  try {
    isWorktree = (await runGit(repositoryRoot, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true'
  } catch (error) {
    throw new Error(`Unable to determine Git worktree status: ${formatError(error)}`)
  }

  if (!isWorktree) {
    return { checked: false, lfsPathCount: 0 }
  }

  let lfsOutput
  try {
    lfsOutput = await runGit(repositoryRoot, ['lfs', 'ls-files', '--name-only'])
  } catch (error) {
    throw new Error(`Unable to inspect Git LFS-managed tool paths: ${formatError(error)}`)
  }

  const manifestPaths = new Set(manifestEntries.map((entry) => entry.path))
  const lfsPaths = [
    ...new Set(
      lfsOutput
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter((path) => path.length > 0 && manifestPaths.has(path))
    )
  ]

  if (lfsPaths.length === 0) {
    return { checked: true, lfsPathCount: 0 }
  }

  let attributeOutput
  try {
    attributeOutput = await runGit(repositoryRoot, [
      'check-attr',
      '-z',
      ...REQUIRED_LFS_ATTRIBUTES.keys(),
      '--',
      ...lfsPaths
    ])
  } catch (error) {
    throw new Error(`Unable to inspect Git LFS attributes: ${formatError(error)}`)
  }

  const attributesByPath = parseNullDelimitedAttributes(attributeOutput)
  const violations = []

  for (const path of lfsPaths) {
    const attributes = attributesByPath.get(path) ?? new Map()
    const mismatches = [...REQUIRED_LFS_ATTRIBUTES].filter(
      ([name, expected]) => attributes.get(name) !== expected
    )

    if (mismatches.length > 0) {
      violations.push(
        `${path} (${mismatches
          .map(([name, expected]) => `${name}=${attributes.get(name) ?? 'unspecified'}; expected ${expected}`)
          .join(', ')})`
      )
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Git LFS attribute coverage mismatch:\n- ${violations.join('\n- ')}\n` +
        'These files are stored as Git LFS pointers and require complete binary-safe attributes. ' +
        'Missing filter=lfs leaves pointer text in a clean checkout; missing -text permits line-ending conversion. ' +
        'Restore "filter=lfs diff=lfs merge=lfs -text" in .gitattributes.'
    )
  }

  return { checked: true, lfsPathCount: lfsPaths.length }
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
  const policyViolations = []
  for (const entry of entries) {
    const absolutePath = resolve(repositoryRoot, entry.path)
    const repositoryRelativePath = relative(repositoryRoot, absolutePath)
    if (repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath)) {
      throw new Error(`Tool provenance path escapes the repository: ${entry.path}`)
    }

    const actual = await sha256File(absolutePath)
    if (actual !== entry.sha256) {
      mismatches.push(`${entry.path}\n  expected ${entry.sha256}\n  actual   ${actual}`)
      continue
    }

    if (isFfmpegExecutable(entry.path)) {
      const forbiddenMarker = await findForbiddenMarker(absolutePath)
      if (forbiddenMarker) {
        policyViolations.push(
          `${entry.path} contains ${JSON.stringify(forbiddenMarker)}, which marks an unredistributable FFmpeg build`
        )
      }
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Bundled tool SHA-256 mismatch:\n${mismatches.join('\n')}`)
  }

  if (policyViolations.length > 0) {
    throw new Error(`Bundled tool redistribution policy violation:\n- ${policyViolations.join('\n- ')}`)
  }

  return entries
}

function isFfmpegExecutable(path) {
  return /^resources\/tools\/ffmpeg\/ff(?:mpeg|probe)(?:\.exe|-)/.test(path)
}

function findForbiddenMarker(path) {
  const markers = FORBIDDEN_FFMPEG_MARKERS.map((marker) => ({
    text: marker,
    bytes: Buffer.from(marker)
  }))
  const overlapLength = Math.max(...markers.map(({ bytes }) => bytes.length)) - 1

  return new Promise((resolveMarker, reject) => {
    const stream = createReadStream(path)
    let overlap = Buffer.alloc(0)
    let settled = false

    stream.on('error', reject)
    stream.on('data', (chunk) => {
      if (settled) {
        return
      }

      const searchable = overlap.length > 0 ? Buffer.concat([overlap, chunk]) : chunk
      const match = markers.find(({ bytes }) => searchable.indexOf(bytes) >= 0)
      if (match) {
        settled = true
        stream.destroy()
        resolveMarker(match.text)
        return
      }

      overlap = searchable.subarray(Math.max(0, searchable.length - overlapLength))
    })
    stream.on('close', () => {
      if (!settled) {
        resolveMarker(null)
      }
    })
  })
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

function parseNullDelimitedAttributes(output) {
  const fields = output.split('\0')
  if (fields.at(-1) === '') {
    fields.pop()
  }

  if (fields.length % 3 !== 0) {
    throw new Error('Git returned malformed attribute data while verifying LFS coverage.')
  }

  const attributesByPath = new Map()
  for (let index = 0; index < fields.length; index += 3) {
    const path = fields[index]
    const name = fields[index + 1]
    const value = fields[index + 2]
    const attributes = attributesByPath.get(path) ?? new Map()
    attributes.set(name, value)
    attributesByPath.set(path, attributes)
  }

  return attributesByPath
}

async function defaultRunGit(repositoryRoot, args) {
  const { stdout } = await execFile('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  })
  return stdout
}

async function defaultHasGitMetadata(repositoryRoot) {
  try {
    await stat(resolve(repositoryRoot, '.git'))
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}
