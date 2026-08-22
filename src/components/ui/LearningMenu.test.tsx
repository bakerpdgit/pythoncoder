import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTutorialCatalog, LearningMenu } from './LearningMenu'

const tracingEntry = {
  name: 'Tracing',
  github: 'https://github.com/bakerpdgit/pythoncoder',
  book: 'https://raw.githubusercontent.com/bakerpdgit/pythoncoder/HEAD/Tracing/book.json',
  mode: 'trace' as const,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LearningMenu', () => {
  it('accepts nested books with a preferred run mode and rejects invalid modes', () => {
    expect(isTutorialCatalog([tracingEntry])).toBe(true)
    expect(isTutorialCatalog([{ ...tracingEntry, mode: 'turbo' }])).toBe(false)
  })

  it('passes the Tracing book and Trace preference when selected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [tracingEntry],
    }))
    const onOpenTutorial = vi.fn()

    render(
      <LearningMenu
        menuRef={createRef<HTMLDivElement>()}
        isOpen
        onToggleOpen={() => undefined}
        onOpenTutorial={onOpenTutorial}
      />,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: /Tracing/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Tracing/i }))
    expect(onOpenTutorial).toHaveBeenCalledWith(tracingEntry)
  })
})
