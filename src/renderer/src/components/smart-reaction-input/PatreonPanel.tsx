import { Check, Loader2, Lock, ShieldCheck } from 'lucide-react'
import type { RefObject } from 'react'
import type { BrowserDetection, BrowserName } from '@shared/types'
import type { ReactionDownloadController } from './useReactionDownload'

const browserGlyphs: Record<BrowserName, string> = {
  firefox: 'F',
  chrome: 'C',
  edge: 'E',
  brave: 'B',
  safari: 'S',
  opera: 'O'
}

export function PatreonPanel({ controller }: { controller: ReactionDownloadController }): JSX.Element {
  const {
    browserReading,
    browsers,
    dismissSavedSession,
    interactionBusy,
    loginWindowOpen,
    manualGuideBrowser,
    manualSessionId,
    manualSessionInputRef,
    openLoginWindow,
    patreonUrl,
    readBrowserSession,
    savedSession,
    setManualSessionId,
    setPatreonUrl,
    startPatreonDownload,
    validPatreonUrl
  } = controller

  return (
    <div className="expanded-form patreon-flow">
      <label>
        <span>Patreon post URL</span>
        <textarea
          className="url-textarea"
          value={patreonUrl}
          disabled={interactionBusy}
          placeholder="https://www.patreon.com/posts/..."
          rows={2}
          onChange={(event) => setPatreonUrl(event.currentTarget.value)}
        />
      </label>

      {validPatreonUrl && (
        <div className="patreon-connect">
          <div>
            <h3>Connect to Patreon</h3>
            <p>Sign in securely to download this post. Your password is handled entirely by Patreon.</p>
          </div>
          <div className="privacy-badge">
            <Lock size={15} aria-hidden />
            <span>
              Your Patreon session is used only for this Patreon download. It never goes to a WatchAlong server or anyone besides Patreon, and it is saved on this device only if you choose.
            </span>
          </div>

          {savedSession.available && !interactionBusy && (
            <div className="saved-session-prompt">
              <ShieldCheck size={18} aria-hidden />
              <div>
                <strong>You have a saved Patreon session.</strong>
                <p>Use it to download now?</p>
              </div>
              <button className="primary-button" type="button" onClick={() => void startPatreonDownload({ type: 'saved' })}>
                Yes, download
              </button>
              <button className="secondary-button" type="button" onClick={dismissSavedSession}>
                No, re-authenticate
              </button>
            </div>
          )}

          {(!savedSession.available || interactionBusy) && (
            <>
              <button
                className={`primary-button login-window-primary ${validPatreonUrl && !interactionBusy ? 'pulse-ready' : ''}`}
                type="button"
                disabled={interactionBusy}
                onClick={() => void openLoginWindow()}
              >
                {loginWindowOpen ? <Loader2 size={17} aria-hidden className="spin" /> : <Lock size={17} aria-hidden />}
                {loginWindowOpen ? 'Waiting for Patreon sign-in...' : 'Sign in to Patreon'}
              </button>
              <small className="login-hint">Works with any browser - opens a secure sign-in window</small>

              <div className="tier-divider"><span>or use an existing browser session</span></div>
              <BrowserChoices
                browsers={browsers}
                disabled={interactionBusy}
                onChoose={(browser) => void readBrowserSession(browser)}
              />
              <small className="login-hint">Firefox is the most reliable automatic option. Manual entry works across all browsers.</small>

              <div className="tier-divider"><span>or paste your session_id</span></div>
              <ManualPatreonFallback
                value={manualSessionId}
                disabled={interactionBusy}
                guideBrowser={manualGuideBrowser}
                inputRef={manualSessionInputRef}
                onChange={setManualSessionId}
                onSubmit={() => void startPatreonDownload({ type: 'manual', sessionId: manualSessionId })}
              />
            </>
          )}

          {browserReading && (
            <div className="inline-status">
              <Loader2 size={17} aria-hidden className="spin" />
              Reading Patreon session from {browserLabel(browserReading, browsers)}...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BrowserChoices({
  browsers,
  disabled,
  onChoose
}: {
  browsers: BrowserDetection[]
  disabled: boolean
  onChoose(browser: BrowserDetection): void
}): JSX.Element {
  return (
    <div className="browser-row" aria-label="Browser sessions">
      {browsers.map((browser) => {
        const statusText = browser.installed ? browser.subtitle : 'Not found'
        const manualOnly = browser.extractionMode === 'manual-only'
        const className = [
          'browser-choice',
          `browser-${browser.name}`,
          browser.installed ? '' : 'browser-missing',
          manualOnly ? 'browser-manual-only' : ''
        ].filter(Boolean).join(' ')

        return (
          <button
            key={browser.name}
            className={className}
            type="button"
            disabled={!browser.installed || disabled}
            onClick={() => onChoose(browser)}
          >
            <span className="browser-icon" aria-hidden>{browserGlyphs[browser.name]}</span>
            <span>{browser.label}</span>
            {statusText && <small>{statusText}</small>}
          </button>
        )
      })}
    </div>
  )
}

function ManualPatreonFallback({
  value,
  disabled,
  guideBrowser,
  inputRef,
  onChange,
  onSubmit
}: {
  value: string
  disabled: boolean
  guideBrowser: BrowserName | null
  inputRef: RefObject<HTMLInputElement>
  onChange(value: string): void
  onSubmit(): void
}): JSX.Element {
  const developerToolsStep = guideBrowser === 'safari'
    ? 'Enable the Develop menu in Safari > Settings/Preferences > Advanced, then open Web Inspector from the Develop menu.'
    : 'Press F12 to open Developer Tools, then click the Application tab (Chrome/Edge) or Storage tab (Firefox).'

  return (
    <div className="manual-fallback">
      <p>Grab your session_id manually in a few clicks:</p>
      <ol>
        <li>Open Patreon in your browser and log in if needed.</li>
        <li>{developerToolsStep}</li>
        <li>In the left sidebar, find Cookies &gt; https://www.patreon.com. Double-click the session_id row and copy the Value.</li>
      </ol>
      <label>
        <span>session_id</span>
        <input
          ref={inputRef}
          type="password"
          value={value}
          disabled={disabled}
          placeholder="Paste your session_id here"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
      <button className="primary-button" type="button" disabled={disabled || value.trim().length < 8} onClick={onSubmit}>
        <Check size={16} aria-hidden />
        Use this session &amp; download
      </button>
    </div>
  )
}

function browserLabel(name: BrowserName, browsers: BrowserDetection[]): string {
  return browsers.find((browser) => browser.name === name)?.label ?? name
}
