import { AlertTriangle, Check, Disc3, Film, Loader2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SmartReactionInput } from './components/SmartReactionInput'
import type { ImportWizardContext, MediaFile, ReactionDownloadSource, WizardOutcome } from '@shared/types'

type WizardStep = 'movie' | 'reaction' | 'ready'

interface ReactionSelection {
  path: string
  label: string
  source: 'local' | ReactionDownloadSource
}

const stepTitles: Record<WizardStep, string> = {
  movie: 'Choose Your Movie',
  reaction: 'Add the Reaction',
  ready: 'Ready to Sync'
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
  const autoAdvanceRef = useRef<number | null>(null)

  const stepIndex = useMemo(() => ['movie', 'reaction', 'ready'].indexOf(step), [step])
  const isSwapReaction = context.mode === 'swap-reaction' && Boolean(context.sessionId && movie)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeWizard('cancelled')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closing])

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
    metadata: { jobId: string; source: ReactionDownloadSource }
  ): void => {
    setReaction({
      path: filePath,
      label: fileName(filePath),
      source: metadata.source
    })
    setError(null)
    setNotice(null)
    scheduleReadyStep()
  }

  const completeWizard = async (): Promise<void> => {
    if (!movie || !reaction || finishing) {
      return
    }

    try {
      setError(null)
      setFinishing(true)
      if (isSwapReaction && context.sessionId) {
        await window.watchAlong.replaceSessionMedia(context.sessionId, 'reaction', reaction.path, reaction.source)
      } else {
        await window.watchAlong.createOrSwitchSessionFromPaths(reaction.path, movie.path, reaction.source)
        await window.watchAlong.completeOnboarding()
      }
      closeWizard('completed')
    } catch {
      setFinishing(false)
      setError('WatchAlong could not save this watchalong. Your files are still safe; please try again.')
    }
  }

  const closeWizard = (outcome: WizardOutcome): void => {
    if (closing) {
      return
    }

    setClosing(outcome)
    window.setTimeout(() => {
      void window.watchAlong.finishOnboardingWizard(outcome)
    }, closeAnimationMs)
  }

  return (
    <main className={`wizard-window ${closing ? 'wizard-window-closing' : ''}`}>
      <header className="wizard-titlebar">
        <span>{stepTitles[step]}</span>
        <button className="wizard-close-button" type="button" aria-label="Close" onClick={() => closeWizard('cancelled')}>
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="wizard-progress" aria-hidden>
        {(['movie', 'reaction', 'ready'] as WizardStep[]).map((item, index) => (
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
              <button className="primary-button" type="button" disabled={!movie || !reaction || finishing} onClick={() => void completeWizard()}>
                {finishing && <Loader2 size={17} aria-hidden className="spin" />}
                Start Sync Setup
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}
