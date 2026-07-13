import { safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PatreonSessionSource, SavedPatreonSessionStatus } from '@shared/types'

export class PatreonSessionVault {
  private readonly tokens = new Map<string, string>()

  constructor(private readonly encryptedCookiePath: string) {}

  createToken(cookie: string): string {
    const token = randomUUID()
    this.tokens.set(token, cookie)
    return token
  }

  resolve(source: PatreonSessionSource): string | null {
    if (source.type === 'browser') {
      return this.tokens.get(source.token) ?? null
    }

    if (source.type === 'token') {
      return this.tokens.get(source.token) ?? null
    }

    if (source.type === 'manual') {
      return sessionIdToCookie(source.sessionId)
    }

    return this.readSavedCookie()
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
}

export function sessionIdToCookie(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('session_id=')) {
    return trimmed
  }

  return `session_id=${trimmed}`
}

