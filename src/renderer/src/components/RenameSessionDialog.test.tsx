import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession } from '@shared/types'
import { existingReactorNames, RenameSessionDialog } from './RenameSessionDialog'

describe('RenameSessionDialog', () => {
  it('collects unique custom, metadata, and path-identified creators from the library', () => {
    const custom = namedSession('custom', 'Cinema Therapy', 'custom')
    const metadata = namedSession('metadata', 'Addie Counts', 'metadata')
    const duplicate = namedSession('duplicate', ' cinema therapy ', 'metadata')
    const pathIdentified = createDefaultSession(undefined, {
      id: 'path',
      reactionPath: 'C:\\Reactions\\patreon\\vkunia - VKunia\\posts\\10 - Post\\video\\reaction.mp4'
    })
    const unknown = createDefaultSession(undefined, { id: 'unknown', reactionPath: 'C:\\Reactions\\reaction.mp4' })

    expect(existingReactorNames([custom, metadata, duplicate, pathIdentified, unknown])).toEqual([
      'Addie Counts',
      'Cinema Therapy',
      'VKunia'
    ])
  })

  it('opens reactor editing on the creator picker while preserving free-text entry', () => {
    const onReactorNameChange = vi.fn()
    const onCancel = vi.fn()
    render(
      <RenameSessionDialog
        title="Alien — VKunia"
        onTitleChange={vi.fn()}
        reactorName=""
        onReactorNameChange={onReactorNameChange}
        reactorOptions={['Addie Counts', 'Cinema Therapy']}
        initialFocus="reactor"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Edit reactor' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const picker = screen.getByRole('combobox', { name: 'Choose from your library' })
    expect(picker).toHaveFocus()
    expect(screen.getByRole('option', { name: 'Addie Counts' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cinema Therapy' })).toBeInTheDocument()

    fireEvent.change(picker, { target: { value: 'Cinema Therapy' } })
    expect(onReactorNameChange).toHaveBeenCalledWith('Cinema Therapy')
    const freeText = screen.getByRole('textbox', { name: 'Reactor (optional)' })
    fireEvent.change(freeText, { target: { value: 'A New Creator' } })
    expect(onReactorNameChange).toHaveBeenLastCalledWith('A New Creator')

    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Tab', shiftKey: true })
    expect(save).toHaveFocus()

    fireEvent.keyDown(freeText, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

function namedSession(
  id: string,
  reactorName: string,
  reactorNameOrigin: LibrarySession['reactorNameOrigin']
): LibrarySession {
  return createDefaultSession(undefined, { id, reactorName, reactorNameOrigin })
}
