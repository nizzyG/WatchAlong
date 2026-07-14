import { Loader2, Lock, ShieldCheck } from 'lucide-react'
import type { BrowserDetection } from '@shared/types'
import type { ReactionDownloadController } from './useReactionDownload'

export function PatreonPanel({ controller }: { controller: ReactionDownloadController }): JSX.Element {
  const {
    browserReading,
    browsers,
    dismissSavedSession,
    interactionBusy,
    loginWindowOpen,
    openLoginWindow,
    patreonUrl,
    readBrowserSession,
    savedSession,
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
                {loginWindowOpen ? 'Waiting for Patreon sign-in...' : 'Sign in with browser'}
              </button>
              <small className="login-hint">Opens Patreon securely inside WatchAlong.</small>

              <div className="tier-divider"><span>or use Firefox in one click</span></div>
              <FirefoxChoice
                browsers={browsers}
                disabled={interactionBusy}
                onChoose={(browser) => void readBrowserSession(browser)}
              />
              <small className="login-hint">Use this if you are already signed in to Patreon in Firefox.</small>
            </>
          )}

          {browserReading && (
            <div className="inline-status">
              <Loader2 size={17} aria-hidden className="spin" />
              Reading Patreon session from Firefox...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FirefoxChoice({
  browsers,
  disabled,
  onChoose
}: {
  browsers: BrowserDetection[]
  disabled: boolean
  onChoose(browser: BrowserDetection): void
}): JSX.Element {
  const firefox = browsers.find((browser) => browser.name === 'firefox') ?? {
    name: 'firefox' as const,
    label: 'Firefox',
    installed: false,
    paths: []
  }
  const label = browsers.length > 0 && !firefox.installed ? 'Try Firefox' : 'Use Firefox'

  return (
    <button
      className="secondary-button firefox-instant"
      type="button"
      disabled={disabled}
      onClick={() => onChoose(firefox)}
    >
      <span className="browser-icon firefox-icon" aria-hidden>F</span>
      <span>{label}</span>
    </button>
  )
}
