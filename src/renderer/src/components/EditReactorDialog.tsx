import { ArrowRight, Check, UserRound } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { normalizeReactorLabel } from '@shared/reactorIdentity'
import type {
  LibrarySession,
  ReactorAssignmentRequest,
  ReactorProfile,
  SessionLibrary
} from '@shared/types'
import { deriveMovieIdentity, deriveReactorIdentity } from './libraryPresentation'
import { ReactorAvatar } from './ReactorAvatar'
import { keepFocusInDialog } from './sessionDialogFocus'

export interface ReactorPickerOption {
  profile: ReactorProfile
  representative: LibrarySession
  pairingCount: number
}

export function EditReactorDialog({
  library,
  session,
  onCancel,
  onConfirm
}: {
  library: SessionLibrary
  session: LibrarySession
  onCancel(): void
  onConfirm(assignment: ReactorAssignmentRequest): void
}): JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const savedReactorsId = useId()
  const currentIdentity = deriveReactorIdentity(session, library.reactors)
  const movie = deriveMovieIdentity(session)
  const currentPairingCount = session.reactorId
    ? library.sessions.filter((candidate) => candidate.reactorId === session.reactorId).length
    : 1
  const options = useMemo(
    () => reactorPickerOptions(library, session.id).filter((option) => option.profile.id !== session.reactorId),
    [library, session.id, session.reactorId]
  )
  const [selectedReactorId, setSelectedReactorId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [moveWholeReactor, setMoveWholeReactor] = useState(currentPairingCount > 1)

  const typedName = newName.trim()
  const matchingProfiles = typedName
    ? library.reactors.filter((profile) =>
        normalizeReactorLabel(profile.name) === normalizeReactorLabel(typedName))
    : []
  const typedMatch = matchingProfiles.length === 1 ? matchingProfiles[0] : null
  const effectiveReactorId = typedName ? typedMatch?.id ?? null : selectedReactorId
  const selectedOption = options.find((option) => option.profile.id === effectiveReactorId) ?? null
  const matchingCurrent = effectiveReactorId !== null && effectiveReactorId === session.reactorId
  const canSubmit = typedName
    ? Boolean(typedMatch ? !matchingCurrent : normalizeReactorLabel(typedName) !== normalizeReactorLabel(currentIdentity.label))
    : Boolean(selectedOption)
  const targetLabel = typedMatch?.name ?? selectedOption?.profile.name ?? typedName

  const submit = (): void => {
    if (!canSubmit) return
    const target = effectiveReactorId
      ? { type: 'existing' as const, reactorId: effectiveReactorId }
      : { type: 'new' as const, name: typedName }
    onConfirm({
      target,
      scope: moveWholeReactor && session.reactorId ? 'reactor' : 'session'
    })
  }

  return (
    <section className="session-dialog-backdrop">
      <form
        className="session-dialog reactor-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return
          }
          keepFocusInDialog(event)
        }}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <header className="reactor-editor-heading">
          <h1 id={titleId}>Change reactor</h1>
          <p id={descriptionId}>
            Choose where <strong>{movie.label}</strong> belongs. The reactor’s name and picture move together.
          </p>
        </header>

        <div className="reactor-change-preview" aria-live="polite">
          <ReactorIdentityPreview session={session} label={currentIdentity.label} />
          <ArrowRight size={20} aria-hidden />
          {selectedOption
            ? <ReactorIdentityPreview session={selectedOption.representative} label={selectedOption.profile.name} />
            : <NewReactorPreview label={targetLabel || 'Choose a reactor'} />}
        </div>

        {options.length > 0 && (
          <fieldset className="reactor-picker" aria-labelledby={savedReactorsId}>
            <legend id={savedReactorsId}>Reactors in your library</legend>
            <div className="reactor-picker-options">
              {options.map((option, index) => {
                const selected = effectiveReactorId === option.profile.id
                return (
                  <label className={`reactor-picker-option ${selected ? 'reactor-picker-option-selected' : ''}`} key={option.profile.id}>
                    <input
                      type="radio"
                      name="reactor-profile"
                      value={option.profile.id}
                      checked={selected}
                      autoFocus={index === 0}
                      onChange={() => {
                        setSelectedReactorId(option.profile.id)
                        setNewName('')
                      }}
                    />
                    <ReactorAvatar session={option.representative} label={option.profile.name} />
                    <span className="reactor-picker-copy">
                      <strong>{option.profile.name}</strong>
                      <small>{pairingCount(option.pairingCount)}</small>
                    </span>
                    <span className="reactor-picker-check" aria-hidden><Check size={16} /></span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        <label className="reactor-new-name">
          <span>{options.length > 0 ? 'Or make a new reactor' : 'Reactor name'}</span>
          <input
            aria-label="New reactor name"
            autoFocus={options.length === 0}
            value={newName}
            maxLength={120}
            placeholder="For example, Hold Down A"
            onChange={(event) => {
              setNewName(event.currentTarget.value)
              setSelectedReactorId(null)
            }}
          />
          {typedMatch && typedMatch.id !== session.reactorId && (
            <small>That reactor is already in your library. This will join its pairings and use its picture.</small>
          )}
        </label>

        {currentPairingCount > 1 && canSubmit && (
          <label className="reactor-move-scope">
            <input
              type="checkbox"
              checked={moveWholeReactor}
              onChange={(event) => setMoveWholeReactor(event.currentTarget.checked)}
            />
            <span>
              <strong>Move all {currentPairingCount} pairings together</strong>
              <small>Everything currently filed under {currentIdentity.label} will stay on one shelf.</small>
            </span>
          </label>
        )}

        <div className="session-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!canSubmit}>Use this reactor</button>
        </div>
      </form>
    </section>
  )
}

export function reactorPickerOptions(library: SessionLibrary, sessionId: string): ReactorPickerOption[] {
  const options = library.reactors.flatMap((profile) => {
    const sessions = library.sessions.filter((session) => session.reactorId === profile.id)
    if (sessions.length === 0) return []
    const representative = sessions.find((session) => session.reactionSource !== 'local') ?? sessions[0]
    return [{ profile, representative, pairingCount: sessions.length }]
  })

  const currentReactorId = library.sessions.find((session) => session.id === sessionId)?.reactorId
  return options.sort((left, right) => {
    if (left.profile.id === currentReactorId) return -1
    if (right.profile.id === currentReactorId) return 1
    return left.profile.name.localeCompare(right.profile.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function ReactorIdentityPreview({ session, label }: { session: LibrarySession; label: string }): JSX.Element {
  return (
    <span className="reactor-preview-identity">
      <ReactorAvatar session={session} label={label} />
      <strong>{label}</strong>
    </span>
  )
}

function NewReactorPreview({ label }: { label: string }): JSX.Element {
  const initials = label === 'Choose a reactor'
    ? ''
    : label.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase()
  return (
    <span className="reactor-preview-identity">
      <span className="reactor-avatar reactor-avatar-card">
        <span className="reactor-avatar-fallback">{initials || <UserRound size={26} />}</span>
      </span>
      <strong>{label}</strong>
    </span>
  )
}

function pairingCount(count: number): string {
  return `${count} pairing${count === 1 ? '' : 's'}`
}
