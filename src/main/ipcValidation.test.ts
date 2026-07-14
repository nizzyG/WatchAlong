import { describe, expect, it } from 'vitest'
import { isBrowserName, isPatreonSessionToken } from './ipcValidation'

describe('IPC argument validation', () => {
  it('accepts only the opaque UUID tokens minted by the Patreon vault', () => {
    expect(isPatreonSessionToken('123e4567-e89b-42d3-a456-426614174000')).toBe(true)
    expect(isPatreonSessionToken('123e4567-e89b-12d3-a456-426614174000')).toBe(false)
    expect(isPatreonSessionToken('../../patreon-session.bin')).toBe(false)
    expect(isPatreonSessionToken('')).toBe(false)
    expect(isPatreonSessionToken(null)).toBe(false)
  })

  it('accepts only supported browser identifiers', () => {
    expect(isBrowserName('firefox')).toBe(true)
    expect(isBrowserName('chrome')).toBe(false)
    expect(isBrowserName('edge')).toBe(false)
    expect(isBrowserName('brave')).toBe(false)
    expect(isBrowserName('safari')).toBe(false)
    expect(isBrowserName('opera')).toBe(false)
    expect(isBrowserName('chromium')).toBe(false)
    expect(isBrowserName('../firefox')).toBe(false)
    expect(isBrowserName(null)).toBe(false)
  })
})
