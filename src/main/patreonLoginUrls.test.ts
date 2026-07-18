import { describe, expect, it } from 'vitest'
import { isAllowedPatreonLoginUrl } from './patreonLoginUrls'

describe('isAllowedPatreonLoginUrl', () => {
  it('allows Patreon login pages and supported identity providers', () => {
    expect(isAllowedPatreonLoginUrl('https://patreon.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://www.patreon.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://www.facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://m.facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://business.facebook.com/login')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://myaccount.google.com/signin-continue')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://accounts.youtube.com/accounts/CheckConnection?continue=opaque')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://accounts.youtube.com/accounts/SetSID?sid=opaque')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://appleid.apple.com/auth/authorize')).toBe(true)
    expect(isAllowedPatreonLoginUrl('https://support.apple.com/oauth/continue')).toBe(true)
  })

  it('blocks non-https and lookalike login navigation targets', () => {
    expect(isAllowedPatreonLoginUrl('http://facebook.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://facebook.com.evil.test/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://patreon.com.evil.test/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://google.com.evil.test/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://apple.com.evil.test/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('http://accounts.youtube.com/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://youtube.com/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://www.youtube.com/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://evil.accounts.youtube.com/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://accounts.youtube.com.evil.test/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://accounts-youtube.com/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://user:password@accounts.youtube.com/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://accounts.youtube.com:8443/accounts/SetSID')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://user:password@patreon.com/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('https://accounts.google.com:8443/login')).toBe(false)
    expect(isAllowedPatreonLoginUrl('notaurl')).toBe(false)
  })
})
