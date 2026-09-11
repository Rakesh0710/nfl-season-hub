/**
 * The replay's controls, exercised as a keyboard and a pointer reach them.
 *
 * The canvas itself is not asserted here — jsdom paints nothing, and
 * `replayCanvas.test.ts` covers the drawing against a recording context. What
 * matters at this level is that every control is labelled, reachable, and
 * moves the one cursor everything else reads from.
 */

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WinProbCanvas from '@/components/WinProbCanvas'
import { makeGame, makePlay } from '@/test/fixtures'

/**
 * Real animation frames, run on demand.
 *
 * The replay autoplays on mount, and a test that let it run would race the
 * assertions. Frames only fire when a test asks for them.
 */
function frameDriver() {
  const pending = new Map<number, FrameRequestCallback>()
  let handle = 0
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++handle, callback)
    return handle
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
  return {
    tick(ms: number) {
      now += ms
      const due = [...pending.values()]
      pending.clear()
      for (const callback of due) callback(now)
    },
  }
}

let frames: ReturnType<typeof frameDriver>

beforeEach(() => {
  frames = frameDriver()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const game = makeGame()
const mount = (g = game) => render(<WinProbCanvas game={g} />)

const scrubber = () => screen.getByRole('slider', { name: 'Replay position' })
const transport = (name: RegExp) => screen.getByRole('button', { name })

describe('labelling', () => {
  it('describes the chart for a screen reader, including the final score', () => {
    mount()
    const chart = screen.getByRole('img')
    expect(chart).toHaveAccessibleName(/Win probability line for Atlanta Falcons/)
    expect(chart).toHaveAccessibleName(/3 key plays marked/)
    expect(chart).toHaveAccessibleName(/Final score ATL 17, NO 10/)
  })

  it('gives the scrubber a value a person can act on, not a bare index', () => {
    mount()
    expect(scrubber()).toHaveAttribute('aria-valuetext', expect.stringContaining('Play 1 of 6'))
    expect(scrubber()).toHaveAttribute('aria-valuetext', expect.stringContaining('Q1 15:00'))
  })

  it('spans exactly the plays, so the thumb cannot land between games', () => {
    mount()
    expect(scrubber()).toHaveAttribute('min', '0')
    expect(scrubber()).toHaveAttribute('max', '5')
  })

  it('groups the speeds and marks the active one as pressed', () => {
    mount()
    const speeds = screen.getByRole('group', { name: 'Playback speed' })
    expect(speeds).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('transport', () => {
  it('offers Pause while running and Play once paused', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    expect(transport(/^play$/i)).toBeInTheDocument()
  })

  it('reads Replay once the game has finished', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    await userEvent.keyboard('{Tab}')
    scrubber().focus()
    await userEvent.keyboard('{End}')
    expect(transport(/^replay$/i)).toBeInTheDocument()
  })

  it('keeps Restart enabled, so pressing it never drops focus to the body', async () => {
    // Disabling it on reaching play 0 — which pressing it does — moved focus
    // to BODY and lost a keyboard user's place.
    mount()
    const restart = transport(/^restart$/i)
    await userEvent.click(restart)
    expect(restart).toBeEnabled()
    expect(restart).toHaveFocus()
  })

  it('changes speed on click', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: '2×' }))
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('the scrubber by keyboard', () => {
  it('moves one play per arrow press, not one hundredth of the game', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    scrubber().focus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(screen.getByText('Play 4 of 6')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByText('Play 3 of 6')).toBeInTheDocument()
  })

  it('jumps to either end with Home and End', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    scrubber().focus()

    await userEvent.keyboard('{End}')
    expect(screen.getByText('Play 6 of 6')).toBeInTheDocument()
    await userEvent.keyboard('{Home}')
    expect(screen.getByText('Play 1 of 6')).toBeInTheDocument()
  })

  it('does not run past either end', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    scrubber().focus()

    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByText('Play 1 of 6')).toBeInTheDocument()
    await userEvent.keyboard('{PageUp}{PageUp}')
    expect(screen.getByText('Play 6 of 6')).toBeInTheDocument()
  })

  it('stays paused while seeking', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    scrubber().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(transport(/^play$/i)).toBeInTheDocument()
  })
})

describe('the play context', () => {
  it('leads with the clock and the score, and shows the description', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    scrubber().focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')

    expect(screen.getByText('Q2 11:40')).toBeInTheDocument()
    expect(screen.getByText(/B\. Robinson runs 3 yards for a touchdown\./)).toBeInTheDocument()
    expect(screen.getByText('Key play')).toBeInTheDocument()
  })

  it('drops the down-and-distance line for a play that has no down', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    // Play 1 is a kickoff: it has no down, so the line carries possession only
    // — no down-and-distance, and no dash standing in for one.
    expect(screen.queryByText(/\d(st|nd|rd|th) &/)).not.toBeInTheDocument()
    expect(screen.getByText('ATL ball')).toBeInTheDocument()
  })

  it('shows down and distance once the play has them', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    scrubber().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText('1st & 10 · ATL ball')).toBeInTheDocument()
  })

  it('omits EPA when the dataset has none, rather than printing a dash', async () => {
    const noEpa = makeGame({ plays: [makePlay({ epa: undefined })] })
    mount(noEpa)
    expect(screen.queryByText(/EPA/)).not.toBeInTheDocument()
  })
})

describe('key plays', () => {
  it('offers one marker per flagged play, in a labelled group', () => {
    mount()
    const rail = screen.getByRole('group', { name: /key plays: 3 in this game/i })
    expect(within(rail).getAllByRole('button')).toHaveLength(3)
  })

  it('keeps the rail to a single tab stop, with the rest reachable by arrow', () => {
    mount()
    const rail = screen.getByRole('group', { name: /key plays/i })
    const markers = within(rail).getAllByRole('button')
    expect(markers.filter((m) => m.tabIndex === 0)).toHaveLength(1)
  })

  it('names each marker with its moment, so the list is usable without the chart', () => {
    mount()
    const rail = screen.getByRole('group', { name: /key plays/i })
    expect(within(rail).getAllByRole('button')[0]).toHaveAccessibleName(
      /Key play 1 of 3, Q2 11:40: B\. Robinson runs 3 yards for a touchdown\./,
    )
  })

  it('seeks to a key play when its marker is activated from the keyboard', async () => {
    mount()
    await userEvent.click(transport(/^pause$/i))
    const rail = screen.getByRole('group', { name: /key plays/i })
    const markers = within(rail).getAllByRole('button')

    markers[1]?.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('Play 4 of 6')).toBeInTheDocument()
  })

  it('walks the markers with the arrow keys', async () => {
    mount()
    const rail = screen.getByRole('group', { name: /key plays/i })
    const markers = within(rail).getAllByRole('button')
    markers[0]?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(markers[1]).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(markers[2]).toHaveFocus()
  })

  it('renders no rail at all for a game the ETL flagged nothing in', () => {
    mount(makeGame({ plays: [makePlay({ isKeyPlay: false }), makePlay({ isKeyPlay: false })] }))
    expect(screen.queryByRole('group', { name: /key plays/i })).not.toBeInTheDocument()
    // The speed group is still there, so this is an absent rail rather than an
    // absent transport.
    expect(screen.getByRole('group', { name: 'Playback speed' })).toBeInTheDocument()
  })
})

describe('a game with one play', () => {
  it('renders without dividing by zero', () => {
    expect(() => mount(makeGame({ plays: [makePlay()] }))).not.toThrow()
    expect(screen.getByText('Play 1 of 1')).toBeInTheDocument()
  })
})

describe('playback', () => {
  it('advances the readout as frames run', () => {
    mount()
    act(() => {
      frames.tick(0) // baseline timestamp
      frames.tick(100)
      frames.tick(100)
    })
    expect(screen.getByText(/Play [2-9] of 6/)).toBeInTheDocument()
  })
})
