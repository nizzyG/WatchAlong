import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sanitizeChildEnvironment } from './child-process-security.mjs'

const scriptsRoot = dirname(fileURLToPath(import.meta.url))

test('removes Node and Electron injection hooks from build-tool children', () => {
  const source = {
    PATH: 'tools',
    HOME: 'home',
    NODE_OPTIONS: '--require attacker.js',
    node_path: 'attacker-modules',
    Node_Repl_History: 'history.js',
    NODE_REPL_EXTERNAL_MODULE: 'attacker.js',
    electron_run_as_node: '1'
  }

  assert.deepEqual(sanitizeChildEnvironment(source), { PATH: 'tools', HOME: 'home' })
  assert.equal(source.NODE_OPTIONS, '--require attacker.js')
})

test('prevents Patreon tool installs from downloading an unpackaged Puppeteer browser', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(scriptsRoot, 'install-patreon-tools.mjs'), '--dry-run'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        WATCHALONG_TARGET_PLATFORM: 'linux',
        WATCHALONG_TARGET_ARCH: 'x64',
        WATCHALONG_TARGET_NODE_VERSION: '24.16.0',
        PUPPETEER_SKIP_DOWNLOAD: '0'
      },
      windowsHide: true
    }
  )

  assert.equal(result.status, 0, result.stderr)
  const plan = JSON.parse(result.stdout)
  assert.equal(plan.installPolicy.puppeteerBrowserDownloads, false)
})
