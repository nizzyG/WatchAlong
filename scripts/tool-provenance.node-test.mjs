import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseToolProvenance, verifyToolProvenance } from './tool-provenance.mjs'

const manifest = (hash) => `
<!-- tool-integrity-manifest:start -->
| Repository path | Target | Version / build | Upstream artifact | SHA-256 |
|---|---|---|---|---|
| \`resources/tools/yt-dlp/yt-dlp.exe\` | Windows x64 | test | [fixture](https://example.com/tool) | \`${hash}\` |
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
