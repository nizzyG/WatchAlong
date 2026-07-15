import { describe, expect, it } from 'vitest'
import {
  createSanitizedChildEnvironment,
  secureChildProcessOptions,
  secureYtDlpArgs
} from './childProcessSecurity'

describe('child process security', () => {
  it('removes Node and Electron injection hooks case-insensitively', () => {
    const clean = createSanitizedChildEnvironment({
      PATH: 'tools',
      HOME: 'home',
      NODE_OPTIONS: '--require attacker.js',
      node_path: 'attacker-modules',
      Node_Repl_History: 'history.js',
      NODE_REPL_EXTERNAL_MODULE: 'attacker.js',
      electron_run_as_node: '1'
    })

    expect(clean).toEqual({ PATH: 'tools', HOME: 'home' })
  })

  it('returns a fresh environment for each hidden child process', () => {
    const source = { PATH: 'tools', NODE_OPTIONS: '--inspect' }
    const first = secureChildProcessOptions(source)
    const second = secureChildProcessOptions(source)

    expect(first).toEqual({ windowsHide: true, env: { PATH: 'tools' } })
    expect(first.env).not.toBe(second.env)
    expect(source).toHaveProperty('NODE_OPTIONS')
  })

  it('puts config and plugin isolation before every yt-dlp operation', () => {
    const input = ['--ignore-config', '--version', '--no-plugin-dirs']

    expect(secureYtDlpArgs(input)).toEqual([
      '--ignore-config',
      '--no-plugin-dirs',
      '--version'
    ])
    expect(input).toEqual(['--ignore-config', '--version', '--no-plugin-dirs'])
  })
})
