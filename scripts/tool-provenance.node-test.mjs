import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  parseToolProvenance,
  verifyGitLfsAttributeCoverage,
  verifyToolProvenance
} from './tool-provenance.mjs'

const manifest = (hash, path = 'resources/tools/yt-dlp/yt-dlp.exe') => `
<!-- tool-integrity-manifest:start -->
| Repository path | Target | Version / build | Upstream artifact | SHA-256 |
|---|---|---|---|---|
| \`${path}\` | test target | test | [fixture](https://example.com/tool) | \`${hash}\` |
<!-- tool-integrity-manifest:end -->
`

test('verifies every discovered tool against the documented SHA-256', async () => {
  const root = await mkdtemp(join(tmpdir(), 'watchalong-tool-provenance-'))
  const toolDirectory = join(root, 'resources', 'tools', 'yt-dlp')
  const toolPath = join(toolDirectory, 'yt-dlp.exe')

  try {
    await mkdir(toolDirectory, { recursive: true })
    await writeFile(toolPath, 'known tool bytes')
    const hash = createHash('sha256').update('known tool bytes').digest('hex')

    const entries = await verifyToolProvenance(root, manifest(hash))
    assert.equal(entries.length, 1)

    await writeFile(join(toolDirectory, 'unlisted-tool.exe'), 'new tool')
    await assert.rejects(
      verifyToolProvenance(root, manifest(hash)),
      /not listed in TOOL_PROVENANCE\.md/
    )

    await rm(join(toolDirectory, 'unlisted-tool.exe'))
    await writeFile(toolPath, 'changed tool bytes')
    await assert.rejects(verifyToolProvenance(root, manifest(hash)), /SHA-256 mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects duplicate manifest paths', () => {
  const hash = '0'.repeat(64)
  const duplicateRow = `| \`resources/tools/yt-dlp/yt-dlp.exe\` | Windows x64 | test | [fixture](https://example.com/tool) | \`${hash}\` |`
  const markdown = `${manifest(hash).replace('<!-- tool-integrity-manifest:end -->', '')}\n${duplicateRow}\n<!-- tool-integrity-manifest:end -->`
  assert.throws(() => parseToolProvenance(markdown), /Duplicate tool provenance path/)
})

test('rejects FFmpeg binaries marked as unredistributable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'watchalong-tool-provenance-'))
  const toolDirectory = join(root, 'resources', 'tools', 'ffmpeg')
  const relativePath = 'resources/tools/ffmpeg/ffmpeg-darwin-arm64'
  const toolPath = join(toolDirectory, 'ffmpeg-darwin-arm64')
  const bytes = 'configuration: --enable-gpl --enable-nonfree'

  try {
    await mkdir(toolDirectory, { recursive: true })
    await writeFile(toolPath, bytes)
    const hash = createHash('sha256').update(bytes).digest('hex')

    await assert.rejects(
      verifyToolProvenance(root, manifest(hash, relativePath)),
      /unredistributable FFmpeg build/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verifies every indexed tool pointer has complete binary-safe LFS attributes', async () => {
  const path = 'resources/tools/node/node.exe'
  const runGit = async (_repositoryRoot, args) => {
    if (args[0] === 'rev-parse') {
      return 'true\n'
    }
    if (args[0] === 'lfs') {
      return `${path}\n`
    }
    if (args[0] === 'check-attr') {
      return gitAttributeOutput(path, {
        filter: 'lfs',
        diff: 'lfs',
        merge: 'lfs',
        text: 'unset'
      })
    }
    assert.fail(`Unexpected Git command: ${args.join(' ')}`)
  }

  const result = await verifyGitLfsAttributeCoverage('/repository', [{ path }], {
    runGit,
    hasGitMetadata: async () => true
  })
  assert.deepEqual(result, { checked: true, lfsPathCount: 1 })
})

test('rejects indexed tool pointers whose LFS attributes are missing or text-enabled', async () => {
  const path = 'resources/tools/yt-dlp/yt-dlp_macos'
  const runGit = async (_repositoryRoot, args) => {
    if (args[0] === 'rev-parse') {
      return 'true\n'
    }
    if (args[0] === 'lfs') {
      return `${path}\n`
    }
    if (args[0] === 'check-attr') {
      return gitAttributeOutput(path, {
        filter: 'unspecified',
        diff: 'unspecified',
        merge: 'unspecified',
        text: 'set'
      })
    }
    assert.fail(`Unexpected Git command: ${args.join(' ')}`)
  }

  await assert.rejects(
    verifyGitLfsAttributeCoverage('/repository', [{ path }], {
      runGit,
      hasGitMetadata: async () => true
    }),
    (error) => {
      assert.match(error.message, /Git LFS attribute coverage mismatch/)
      assert.match(error.message, /resources\/tools\/yt-dlp\/yt-dlp_macos/)
      assert.match(error.message, /Missing filter=lfs leaves pointer text in a clean checkout/)
      assert.match(error.message, /filter=lfs diff=lfs merge=lfs -text/)
      return true
    }
  )
})

test('skips the VCS-only LFS guard outside a Git worktree', async () => {
  let calls = 0
  const runGit = async () => {
    calls += 1
    assert.fail('Git should not run when repository metadata is absent')
  }

  const result = await verifyGitLfsAttributeCoverage('/source-archive', [], {
    runGit,
    hasGitMetadata: async () => false
  })
  assert.deepEqual(result, { checked: false, lfsPathCount: 0 })
  assert.equal(calls, 0)
})

test('fails closed when Git cannot inspect a repository with metadata present', async () => {
  const runGit = async () => {
    const error = new Error('spawn git ENOENT')
    error.code = 'ENOENT'
    throw error
  }

  await assert.rejects(
    verifyGitLfsAttributeCoverage('/repository', [], {
      runGit,
      hasGitMetadata: async () => true
    }),
    /Unable to determine Git worktree status: spawn git ENOENT/
  )
})

function gitAttributeOutput(path, attributes) {
  return `${Object.entries(attributes)
    .flatMap(([name, value]) => [path, name, value])
    .join('\0')}\0`
}
