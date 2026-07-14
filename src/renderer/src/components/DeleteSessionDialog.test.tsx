import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteSessionDialog } from './DeleteSessionDialog'

describe('DeleteSessionDialog', () => {
  it('opens as a keyboard-contained modal and cancels with Escape', () => {
    const onCancel = vi.fn()
    render(
      <DeleteSessionDialog
        sessionTitle="Alien — VKunia"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Delete this watchalong?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Delete' })
    expect(cancel).toHaveFocus()
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(confirm, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
