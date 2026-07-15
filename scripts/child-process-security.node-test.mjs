import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeChildEnvironment } from './child-process-security.mjs'

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
