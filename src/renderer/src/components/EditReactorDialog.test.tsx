import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultSession, normalizeLibrary } from '@shared/session'
import type { LibrarySession } from '@shared/types'
import { EditReactorDialog } from './EditReactorDialog'

describe('EditReactorDialog', () => {
  it('visually merges an entire split reactor shelf by stable profile id', () => {
    const customOne = reaction('custom-1', 'Hold Down A', 'custom', 'job-ames', 'UC-AMES - Ames Video Store')
    const customTwo = reaction('custom-2', 'Hold Down A', 'custom', 'job-ames', 'UC-AMES - Ames Video Store')
    const realHoldDownA = reaction('real-hda', 'Hold Down A', 'metadata', 'job-hda', 'UC-HDA - Hold Down A')
    const library = normalizeLibrary({
      version: 6,
      activeSessionId: customOne.id,
      sessions: [customOne, customTwo, realHoldDownA]
    })
    const sourceProfile = library.reactors.find((profile) => profile.externalIdentityKeys.includes('youtube:uc-ames'))!
    const targetProfile = library.reactors.find((profile) => profile.externalIdentityKeys.includes('youtube:uc-hda'))!
    const sourceSession = library.sessions.find((session) => session.id === customOne.id)!
    const onConfirm = vi.fn()

    render(
      <EditReactorDialog
        library={library}
        session={sourceSession}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    expect(sourceProfile.id).not.toBe(targetProfile.id)
    expect(screen.getByRole('dialog', { name: 'Change reactor' })).toBeInTheDocument()
    const target = screen.getByRole('radio', { name: /Hold Down A.*1 pairing/i })
    fireEvent.click(target)
    expect(screen.getByRole('checkbox', { name: /Move all 2 pairings together/i })).toBeChecked()
    expect(screen.getByText(/name and picture move together/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use this reactor' }))
    expect(onConfirm).toHaveBeenCalledWith({
      target: { type: 'existing', reactorId: targetProfile.id },
      scope: 'reactor'
    })
  })

  it('recognizes a typed existing reactor instead of creating a duplicate profile', () => {
    const local = createDefaultSession(undefined, {
      id: 'local',
      moviePath: 'C:\\Movies\\Across the Universe.mp4',
      reactionPath: 'C:\\Reactions\\Across local.mp4'
    })
    const shanelle = reaction(
      'youtube-shanelle',
      "Watch Along's with Shanelle",
      'metadata',
      'job-shanelle',
      "UC76 - Watch Along's with Shanelle"
    )
    const library = normalizeLibrary({ version: 6, activeSessionId: local.id, sessions: [local, shanelle] })
    const source = library.sessions.find((session) => session.id === local.id)!
    const targetProfile = library.reactors.find((profile) => profile.name === "Watch Along's with Shanelle")!
    const onConfirm = vi.fn()

    render(<EditReactorDialog library={library} session={source} onCancel={vi.fn()} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByLabelText('New reactor name'), {
      target: { value: "  WATCH ALONG'S WITH SHANELLE  " }
    })
    expect(screen.getByText(/already in your library/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use this reactor' }))
    expect(onConfirm).toHaveBeenCalledWith({
      target: { type: 'existing', reactorId: targetProfile.id },
      scope: 'session'
    })
  })
})

function reaction(
  id: string,
  reactorName: string,
  reactorNameOrigin: LibrarySession['reactorNameOrigin'],
  job: string,
  creatorFolder: string
): LibrarySession {
  return createDefaultSession(new Date('2026-07-17T00:00:00.000Z'), {
    id,
    title: `${id} pairing`,
    reactorName,
    reactorNameOrigin,
    moviePath: `C:\\Movies\\${id}.mp4`,
    reactionPath: `C:\\Reactions\\youtube\\${job}\\${creatorFolder}\\${id}.mp4`,
    reactionSource: 'youtube'
  })
}
