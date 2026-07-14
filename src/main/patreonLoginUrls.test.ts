import { describe, expect, it } from 'vitest'
import { isAllowedPatreonLoginUrl } from './patreonLoginUrls'

describe('isAllowedPatreonLoginUrl', () => {
  it('allows Patreon login pages and supported identity providers', () => {
    expect(isAllowedPatreonLoginUrl('https://patreon.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://www.patreon.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://www.facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://m.facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://appleid.apple.com/auth/authorize')).toBe(true)
  })

  it('blocks non-https and lookalike login navigation targets', () => {
    expect(isAllowedPatreonLoginUrl('http://facebook.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://facebook.com.evil.test/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://patreon.com.evil.test/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://docs.google.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://support.apple.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://business.facebook.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://user:password@patreon.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://accounts.google.com:8443/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('notaurl')).toBe(false)
  })
})
