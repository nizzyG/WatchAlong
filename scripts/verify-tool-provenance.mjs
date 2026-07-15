import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyToolProvenance } from './tool-provenance.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

try {
  const provenance = await readFile(resolve(repositoryRoot, 'TOOL_PROVENANCE.md'), 'utf8')
  const entries = await verifyToolProvenance(repositoryRoot, provenance)
  console.log(`[WatchAlong] Verified SHA-256 provenance for ${entries.length} managed tool files.`)
} catch (error) {
  console.error(`[WatchAlong] Tool provenance verification failed: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
