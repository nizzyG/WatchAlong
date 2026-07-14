import { AlertTriangle, Check, Disc3, Film, Loader2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SmartReactionInput } from './components/SmartReactionInput'
import type { DownloadedReactionMetadata } from './components/SmartReactionInput'
import { buildSuggestedPairingTitle } from './components/pairingTitle'
import { useAutoSync } from './hooks/useAutoSync'
import type { AutoSyncCompleteEvent, ImportWizardContext, MediaFile, ReactionDownloadSource, WizardOutcome } from '@shared/types'

type WizardStep = 'movie' | 'reaction' | 'ready' | 'syncing'

interface ReactionSelection {
  path: string
  label: string
  source: 'local' | ReactionDownloadSource
  download?: DownloadedReactionMetadata
}

const stepTitles: Record<WizardStep, string> = {
  movie: 'Choose Your Movie',
  reaction: 'Add the Reaction',
  ready: 'Ready to Sync',
  syncing: 'Finding Your Sync'
}

const closeAnimationMs = 280
const autoAdvanceMs = 650
const defaultWizardContext: ImportWizardContext = {
  mode: 'new',
  sessionId: null,
  movie: null
}

export function WizardApp(): JSX.Element {
  const [step, setStep] = useState<WizardStep>('movie')
  const [context, setContext] = useState<ImportWizardContext>(defaultWizardContext)
  const [movie, setMovie] = useState<MediaFile | null>(null)
  const [reaction, setReaction] = useState<ReactionSelection | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<WizardOutcome | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [syncResult, setSyncResult] = useState<AutoSyncCompleteEvent | null>(null)
  const autoAdvanceRef = useRef<number | null>(null)
  const manualFallbackRef = useRef(false)
  const finishingRef = useRef(false)
  const sessionSavedRef = useRef(false)
  const closingRef = useRef<WizardOutcome | null>(null)
  const closeRequestedRef = useRef(false)
  const syncResultRef = useRef<AutoSyncCompleteEvent | null>(null)
  const processedDownloadJobRef = useRef<string | null>(null)
  const autoSync = useAutoSync()

  const stepIndex = useMemo(() => ['movie', 'reaction', 'ready', 'syncing'].indexOf(step), [step])
  const isSwapReaction = context.mode === 'swap-reaction' && Boolean(context.sessionId && movie)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (step === 'syncing') void requestWizardClose()
        else closeWizard('cancelled')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closing, step, sessionSaved, syncResult])

  useEffect(() => window.watchAlong.onWizardCloseRequest(() => {
    void requestWizardClose()
  }), [step, sessionSaved, syncResult])

  useEffect(() => {
    document.body.classList.add('wizard-body')
    return () => document.body.classList.remove('wizard-body')
  }, [])

  useEffect(() => {
    document.title = stepTitles[step]
  }, [step])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const nextContext = await window.watchAlong.getImportWizardContext()
        if (!mounted) {
          return
        }

        setContext(nextContext)
        if (nextContext.mode === 'swap-reaction' && nextContext.movie) {
          setMovie(nextContext.movie)
          setNotice('Movie is already chosen for this session.')
          autoAdvanceRef.current = window.setTimeout(() => {
            setStep('reaction')
            autoAdvanceRef.current = null
          }, autoAdvanceMs)
        }
      } catch {
        if (mounted) {
          setContext(defaultWizardContext)
          setError('WatchAlong could not prepare the import wizard. You can still choose your files manually.')
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current !== null) {
        window.clearTimeout(autoAdvanceRef.current)
      }
    }
  }, [])

  const scheduleReadyStep = (): void => {
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current)
    }
    autoAdvanceRef.current = window.setTimeout(() => {
      setStep('ready')
      autoAdvanceRef.current = null
    }, autoAdvanceMs)
  }

  const chooseMovie = async (): Promise<void> => {
    if (isSwapReaction) {
      return
    }

    try {
      setError(null)
      const nextMovie = await window.watchAlong.selectMovieFile()
      if (!nextMovie) {
        return
      }

      setMovie((currentMovie) => {
        if (currentMovie && reaction) {
          if (autoAdvanceRef.current !== null) {
            window.clearTimeout(autoAdvanceRef.current)
            autoAdvanceRef.current = null
          }
          setReaction(null)
          setNotice('Movie changed. Choose a reaction that matches it.')
        } else {
          setNotice(null)
        }
        return nextMovie
      })
    } catch {
      setError('WatchAlong could not open the movie picker. Try again when you are ready.')
    }
  }

  const chooseLocalReaction = async (): Promise<void> => {
    try {
      setError(null)
      const nextReaction = await window.watchAlong.selectReactionFile()
      if (!nextReaction) {
        return
      }

      setReaction({
        path: nextReaction.path,
        label: nextReaction.name,
        source: 'local'
      })
      setNotice(null)
      scheduleReadyStep()
    } catch {
      setError('WatchAlong could not open the reaction picker. Try again when you are ready.')
    }
  }

  const handleDownloadedReaction = (
    filePath: string,
    metadata: DownloadedReactionMetadata
  ): void => {
    if (closingRef.current || processedDownloadJobRef.current === metadata.jobId) {
      return
    }

    processedDownloadJobRef.current = metadata.jobId
    const selection: ReactionSelection = {
      path: filePath,
      label: fileName(filePath),
      source: metadata.source,
      download: metadata
    }
    setReaction(selection)
    setError(null)
    setNotice(null)
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current)
      autoAdvanceRef.current = null
    }
    void saveAndStartSync(selection)
  }

  const saveAndStartSync = async (selection: ReactionSelection | null = reaction): Promise<void> => {
    if (!movie || !selection || finishingRef.current || closingRef.current) {
      return
    }

    try {
      finishingRef.current = true
      setError(null)
      setFinishing(true)
      sessionSavedRef.current = false
      setSessionSaved(false)
      setSyncResult(null)
      setStep('syncing')
      let library
      const suggestedTitle = buildSuggestedPairingTitle(movie.path, selection.download?.reactorName)
      if (isSwapReaction && context.sessionId) {
        const replacement = await window.watchAlong.replaceSessionMedia(
          context.sessionId,
          'reaction',
          selection.path,
          selection.source,
          suggestedTitle,
          selection.download?.reactorName
        )
        if (replacement.status === 'missing') {
          throw new Error('The watchalong being updated no longer exists.')
        }
        if (replacement.status === 'conflict') {
          library = await window.watchAlong.setActiveSession(replacement.existingSessionId)
          sessionSavedRef.current = true
          setSessionSaved(true)
          setNotice('That pairing is already saved, so WatchAlong is opening your existing copy. Nothing was replaced.')
          await new Promise((resolve) => window.setTimeout(resolve, 650))
          if (closingRef.current) return
          closeWizard('completed')
          return
        }
        library = replacement.library
        library = await window.watchAlong.saveSessionPosition(context.sessionId, 0)
      } else {
        library = await window.watchAlong.createOrSwitchSessionFromPaths(
          selection.path,
          movie.path,
          selection.source,
          suggestedTitle,
          selection.download?.reactorName
        )
        await window.watchAlong.completeOnboarding()
      }
      const sessionId = context.sessionId ?? library.activeSessionId
      if (!sessionId) throw new Error('The saved watchalong has no session id.')
      sessionSavedRef.current = true
      setSessionSaved(true)
      if (closeRequestedRef.current) {
        manualFallbackRef.current = true
        closeWizard('completed-needs-review')
        return
      }
      if (manualFallbackRef.current || closingRef.current) return
      const result = await autoSync.start(sessionId, 'initial')
      if (manualFallbackRef.current) return
      syncResultRef.current = result
      setSyncResult(result)
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      if (closingRef.current) return
      closeWizard(result.outcome === 'confident' ? 'completed' : 'completed-needs-review')
    } catch {
      if (closingRef.current) return
      finishingRef.current = false
      setFinishing(false)
      sessionSavedRef.current = false
      setSessionSaved(false)
      setStep(selection.source === 'local' ? 'ready' : 'reaction')
      setError('WatchAlong could not save this watchalong. Your files are still safe; please try again.')
    }
  }

  const leaveForManualSync = async (): Promise<void> => {
    const settledResult = syncResultRef.current
    if (settledResult) {
      closeWizard(settledResult.outcome === 'confident' ? 'completed' : 'completed-needs-review')
      return
    }
    if (!sessionSavedRef.current || manualFallbackRef.current || closingRef.current) return
    manualFallbackRef.current = true
    await autoSync.cancel()
    closeWizard('completed-needs-review')
  }

  const requestWizardClose = async (): Promise<void> => {
    if (closingRef.current) return
    if (step !== 'syncing') {
      closeWizard('cancelled')
      return
    }
    if (!sessionSavedRef.current) {
      closeRequestedRef.current = true
      setNotice('Finishing the local save before closing…')
      return
    }
    await leaveForManualSync()
  }

  const closeWizard = (outcome: WizardOutcome): void => {
    if (closingRef.current) {
      return
    }

    closingRef.current = outcome
    setClosing(outcome)
    window.setTimeout(() => {
      void window.watchAlong.finishOnboardingWizard(outcome)
    }, closeAnimationMs)
  }

  return (
    <main className={`wizard-window ${closing ? 'wizard-window-closing' : ''}`}>
      <header className="wizard-titlebar">
        <span>{stepTitles[step]}</span>
        <button
          className="wizard-close-button"
          type="button"
          aria-label="Close"
          disabled={step === 'syncing' && !sessionSaved}
          onClick={() => step === 'syncing' ? void requestWizardClose() : closeWizard('cancelled')}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="wizard-progress" aria-hidden>
        {(['movie', 'reaction', 'ready', 'syncing'] as WizardStep[]).map((item, index) => (
          <span key={item} className={index <= stepIndex ? 'wizard-progress-active' : ''} />
        ))}
      </div>

      {step === 'movie' && (
        <section className="wizard-page wizard-movie-step" aria-label="Choose Your Movie">
          <div className="wizard-card wizard-movie-card">
            <div className="wizard-mark">
              <Disc3 size={46} aria-hidden />
            </div>
            <div className="wizard-copy">
              <p className="wizard-kicker">Your media, your way.</p>
              <h1>Choose Your Movie</h1>
              <p>
                {isSwapReaction
                  ? 'This movie is already chosen. WatchAlong will keep it in place and swap only the reaction.'
                  : 'WatchAlong works with your own media files - ripped from discs you own, or DRM-free downloads.'}
              </p>
            </div>
            {!isSwapReaction && (
              <button className="primary-button" type="button" onClick={() => void chooseMovie()}>
                <Film size={18} aria-hidden />
                Open Movie File
              </button>
            )}
            <p className="media-format-hint">MP4 and WebM work best. MKV/AVI may not play in all cases.</p>
            {movie && (
              <div className="wizard-file-pill" aria-live="polite">
                <Check size={17} aria-hidden />
                <span>{movie.name}</span>
              </div>
            )}
            {notice && <p className="wizard-notice">{notice}</p>}
            {error && <p className="wizard-error"><AlertTriangle size={15} aria-hidden />{error}</p>}
          </div>

          <footer className="wizard-actions">
            <button className="primary-button" type="button" disabled={!movie} onClick={() => setStep('reaction')}>
              Next
            </button>
          </footer>
        </section>
      )}

      {step === 'reaction' && (
        <section className="wizard-page wizard-reaction-step" aria-label="Add the Reaction">
          {movie && (
            <div className="wizard-file-pill wizard-movie-complete" aria-label="Selected movie">
              <Check size={17} aria-hidden />
              <span>{movie.name}</span>
            </div>
          )}
          <SmartReactionInput
            movieReady={Boolean(movie)}
            onSelectLocal={chooseLocalReaction}
            onDownloaded={handleDownloadedReaction}
          />

          {reaction && (
            <div className="wizard-file-pill wizard-reaction-ready" aria-live="polite">
              <Check size={17} aria-hidden />
              <span>{reaction.label}</span>
            </div>
          )}
          {error && <p className="wizard-error"><AlertTriangle size={15} aria-hidden />{error}</p>}

          <footer className="wizard-actions">
            <button className="secondary-button" type="button" onClick={() => setStep('movie')}>
              Back
            </button>
            <button className="primary-button" type="button" disabled={!reaction} onClick={() => setStep('ready')}>
              Next
            </button>
          </footer>
        </section>
      )}

      {step === 'ready' && (
        <section className="wizard-page wizard-ready-step" aria-label="Ready to Sync">
          <div className="wizard-card wizard-ready-card">
            <div className="wizard-mark wizard-ready-mark">
              <ShieldCheck size={44} aria-hidden />
            </div>
            <div className="wizard-copy">
              <p className="wizard-kicker">Ready to sync.</p>
              <h1>Ready to Sync</h1>
              <p>Your files are loaded. Now let&apos;s align them perfectly.</p>
            </div>
            <dl className="wizard-summary">
              <div>
                <dt>Movie</dt>
                <dd>{movie?.name ?? 'No movie selected'}</dd>
              </div>
              <div>
                <dt>Reaction</dt>
                <dd>{reaction?.label ?? 'No reaction selected'}</dd>
              </div>
            </dl>
            <p className="wizard-sendoff">Everything&apos;s loaded and safe. Now let&apos;s find the perfect sync point.</p>
            {error && <p className="wizard-error"><AlertTriangle size={15} aria-hidden />{error}</p>}
            <div className="wizard-actions wizard-ready-actions">
              <button className="secondary-button" type="button" disabled={finishing} onClick={() => setStep('reaction')}>
                Back
              </button>
              <button className="primary-button" type="button" disabled={!movie || !reaction || finishing} onClick={() => void saveAndStartSync()}>
                {finishing && <Loader2 size={17} aria-hidden className="spin" />}
                Find My Sync
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'syncing' && (
        <section className="wizard-page wizard-syncing-step" aria-label="Finding Your Sync">
          <div className="wizard-card wizard-syncing-card">
            <div className={`wizard-mark ${syncResult?.outcome === 'confident' ? 'wizard-ready-mark' : ''}`}>
              {syncResult ? <Check size={42} aria-hidden /> : <Loader2 size={42} aria-hidden className="spin" />}
            </div>
            <div className="wizard-copy">
              <p className="wizard-kicker">{syncResult ? 'All checked.' : 'This stays on your computer.'}</p>
              <h1>{syncResult?.outcome === 'confident' ? 'Your watchalong is ready' : 'Finding Your Sync'}</h1>
              <p>{!sessionSaved ? notice ?? 'Saving your watchalong on this computer…' : syncResult?.message ?? autoSync.progress.message}</p>
            </div>
            <div
              className="auto-sync-progress"
              role="progressbar"
              aria-label="Automatic sync progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={autoSync.progress.percent}
            >
              <span style={{ width: `${autoSync.progress.percent}%` }} />
            </div>
            {!syncResult && (
              <>
                <p className="wizard-sync-hint">You can keep using your computer while WatchAlong checks a few moments in both videos.</p>
                <button className="secondary-button" type="button" disabled={!sessionSaved} onClick={() => void leaveForManualSync()}>
                  {sessionSaved ? 'Line Up Manually Instead' : 'Saving WatchAlong…'}
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  )
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}
