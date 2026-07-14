import { safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PatreonSessionSource, SavedPatreonSessionStatus } from '@shared/types'

export class PatreonSessionVault {
  private readonly tokens = new Map<string, HeldSessionToken>()
  private authorizationEpoch = 0

  constructor(private readonly encryptedCookiePath: string) {}

  get authEpoch(): number {
    return this.authorizationEpoch
  }

  createToken(cookie: string): string
  createToken(cookie: string, expectedEpoch: number): string | null
  createToken(cookie: string, expectedEpoch = this.authorizationEpoch): string | null {
    if (expectedEpoch !== this.authorizationEpoch) {
      return null
    }

    const token = randomUUID()
    const entry: HeldSessionToken = {
      cookie,
      expiresAt: Date.now() + AUTH_TOKEN_TTL_MS,
      expiryTimer: setTimeout(() => {
        if (this.tokens.get(token) === entry) this.tokens.delete(token)
      }, AUTH_TOKEN_TTL_MS)
    }
    entry.expiryTimer.unref?.()
    this.tokens.set(token, entry)
    return token
  }

  resolve(source: PatreonSessionSource, expectedEpoch = this.authorizationEpoch): string | null {
    if (expectedEpoch !== this.authorizationEpoch) {
      if (source.type === 'browser' || source.type === 'token') {
        this.clearToken(source.token)
      }
      return null
    }

    if (source.type === 'browser' || source.type === 'token') {
      const entry = this.tokens.get(source.token)
      this.clearToken(source.token)
      return entry && entry.expiresAt > Date.now() ? entry.cookie : null
    }

    if (source.type === 'manual') {
      return sessionIdToCookie(source.sessionId)
    }

    return this.readSavedCookie()
  }

  discardToken(token: string): void {
    this.clearToken(token)
  }

  status(): SavedPatreonSessionStatus {
    return {
      available: Boolean(this.readSavedCookie()),
      canEncrypt: safeStorage.isEncryptionAvailable()
    }
  }

  save(cookie: string): SavedPatreonSessionStatus {
    if (!safeStorage.isEncryptionAvailable()) {
      return this.status()
    }

    mkdirSync(dirname(this.encryptedCookiePath), { recursive: true })
    writeFileSync(this.encryptedCookiePath, safeStorage.encryptString(cookie))
    return this.status()
  }

  forget(): SavedPatreonSessionStatus {
    // Invalidate any browser extraction or login window that began before
    // Forget was pressed, even if it produces a cookie later.
    this.authorizationEpoch += 1
    for (const token of this.tokens.keys()) this.clearToken(token)
    rmSync(this.encryptedCookiePath, { force: true })
    return this.status()
  }

  private readSavedCookie(): string | null {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(this.encryptedCookiePath)) {
      return null
    }

    try {
      return safeStorage.decryptString(readFileSync(this.encryptedCookiePath))
    } catch {
      return null
    }
  }

  private clearToken(token: string): void {
    const entry = this.tokens.get(token)
    if (entry) clearTimeout(entry.expiryTimer)
    this.tokens.delete(token)
  }
}

const AUTH_TOKEN_TTL_MS = 10 * 60 * 1000

interface HeldSessionToken {
  cookie: string
  expiresAt: number
  expiryTimer: ReturnType<typeof setTimeout>
}

export function sessionIdToCookie(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('session_id=')) {
    return trimmed
  }

  return `session_id=${trimmed}`
}

