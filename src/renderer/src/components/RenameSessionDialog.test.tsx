import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RenameSessionDialog } from './RenameSessionDialog'

describe('RenameSessionDialog', () => {
  it('keeps pairing titles separate from reactor identity', () => {
    const onTitleChange = vi.fn()
    const onCancel = vi.fn()
    render(
      <RenameSessionDialog
        title="Alien — VKunia"
        onTitleChange={onTitleChange}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Rename watchalong' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.queryByLabelText(/Reactor/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Alien night' } })
    expect(onTitleChange).toHaveBeenCalledWith('My Alien night')
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
