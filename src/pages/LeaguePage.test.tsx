/**
 * The league dashboard, driven the way a person drives it.
 *
 * The data layer is mocked at its own boundary — the page never sees `fetch`
 * anyway — so these tests are about what the screen says and what the controls
 * do, not about how the fetch happened.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeaguePage from '@/pages/LeaguePage'
import { DataError } from '@/lib/data'
import { makeLeague } from '@/test/fixtures'

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getTeamsIndex: vi.fn(),
}))

const { getTeamsIndex } = await import('@/lib/data')
const mockedIndex = vi.mocked(getTeamsIndex)

function mount(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LeaguePage />
    </MemoryRouter>,
  )
}

/** The team names on screen, in the order they are rendered. */
function renderedTeams(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('heading').textContent ?? '')
}

beforeEach(() => {
  mockedIndex.mockReset()
})

describe('loading and failure', () => {
  it('shows a skeleton, announced as busy, before the data arrives', () => {
    mockedIndex.mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('shows a recoverable error with a working retry', async () => {
    mockedIndex.mockRejectedValueOnce(new DataError('network', '/data/teams-index.json', 'offline'))
    mount()

    await screen.findByRole('alert')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong')

    mockedIndex.mockResolvedValueOnce(makeLeague())
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    await screen.findByRole('heading', { level: 1, name: 'League' })
  })

  it('offers no retry for a file that does not exist, only a way back', async () => {
    mockedIndex.mockRejectedValue(new DataError('not-found', '/data/teams-index.json', 'gone', 404))
    mount()

    await screen.findByRole('alert')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found')
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to the league/i })).toBeInTheDocument()
  })
})

describe('the loaded dashboard', () => {
  beforeEach(() => {
    mockedIndex.mockResolvedValue(makeLeague())
  })

  it('lists every team, best projection first', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })
    const teams = renderedTeams()
    expect(teams).toHaveLength(8)
    expect(teams[0]).toContain('49ers')
  })

  it('describes the view for a screen reader, and updates it as filters change', async () => {
    mount()
    const summary = await screen.findByText(/All 8 teams in the league/)
    expect(summary).toHaveAttribute('aria-live', 'polite')

    await userEvent.click(screen.getByRole('button', { name: 'AFC' }))
    await waitFor(() => expect(summary).toHaveTextContent('4 of 8 teams in the AFC'))
  })

  it('re-sorts without refetching', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })

    await userEvent.click(screen.getByRole('button', { name: /last-season record/i }))
    await waitFor(() => expect(renderedTeams()[0]).toContain('Bills'))
    expect(mockedIndex).toHaveBeenCalledTimes(1)
  })

  it('flips direction when the active sort is pressed again', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })
    const projected = screen.getByRole('button', { name: /projected wins/i })
    expect(projected).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(projected)
    await waitFor(() => expect(renderedTeams()[0]).toContain('Giants'))
  })

  it('filters by conference and then by division', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })

    await userEvent.click(screen.getByRole('button', { name: 'NFC' }))
    await waitFor(() => expect(renderedTeams()).toHaveLength(4))

    await userEvent.selectOptions(screen.getByLabelText('Division'), 'NFC East')
    await waitFor(() => expect(renderedTeams()).toHaveLength(2))
    expect(renderedTeams().join(' ')).toContain('Eagles')
  })

  it('clears a division that the new conference does not contain', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })

    await userEvent.selectOptions(screen.getByLabelText('Division'), 'NFC East')
    await waitFor(() => expect(renderedTeams()).toHaveLength(2))

    // Switching to the AFC with an NFC division selected would otherwise leave
    // an empty grid and no clue why.
    await userEvent.click(screen.getByRole('button', { name: 'AFC' }))
    await waitFor(() => expect(renderedTeams()).toHaveLength(4))
    expect(screen.getByLabelText('Division')).toHaveValue('ALL')
  })

  it('groups under division headings when sorted by division', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })

    await userEvent.click(screen.getByRole('button', { name: /^division/i }))
    await screen.findByRole('heading', { level: 2, name: 'AFC East' })
    expect(screen.getByRole('heading', { level: 2, name: 'NFC West' })).toBeInTheDocument()
  })

  it('restores a shared view from the query string', async () => {
    mount('/?conf=NFC&div=NFC+East&sort=record')
    await screen.findByRole('heading', { level: 1, name: 'League' })
    await waitFor(() => expect(renderedTeams()).toHaveLength(2))
    expect(screen.getByRole('button', { name: /last-season record/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('falls back to the default view for a nonsense query string', async () => {
    mount('/?sort=elo&conf=XFL&div=Pacific')
    await screen.findByRole('heading', { level: 1, name: 'League' })
    expect(renderedTeams()).toHaveLength(8)
    expect(screen.getByRole('button', { name: /projected wins/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('offers a way out of an empty result rather than a blank page', async () => {
    mockedIndex.mockResolvedValue(makeLeague().filter((team) => team.conference === 'NFC'))
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })

    await userEvent.click(screen.getByRole('button', { name: 'AFC' }))
    await screen.findByText('No teams match these filters.')

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(renderedTeams()).toHaveLength(4))
  })

  it('links each team to its own page', async () => {
    mount()
    await screen.findByRole('heading', { level: 1, name: 'League' })
    expect(screen.getByRole('link', { name: /Kansas City Chiefs/ })).toHaveAttribute(
      'href',
      '/team/KC',
    )
  })
})
