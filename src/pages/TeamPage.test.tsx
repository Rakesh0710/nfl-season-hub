/**
 * The team page: does it render the team it was asked for, and does it hold
 * together when parts of the data are missing?
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeamPage from '@/pages/TeamPage'
import { DataError } from '@/lib/data'
import { makeGameSummary, makeLeague, makeTeam } from '@/test/fixtures'

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getTeam: vi.fn(),
  getTeamsIndex: vi.fn(),
  getMeta: vi.fn(),
}))

const { getTeam, getTeamsIndex, getMeta } = await import('@/lib/data')
const mockedTeam = vi.mocked(getTeam)
const mockedIndex = vi.mocked(getTeamsIndex)
const mockedMeta = vi.mocked(getMeta)

/** A team with a game in each of three seasons, like the real files. */
function multiSeasonTeam() {
  return makeTeam({
    games: [
      makeGameSummary({ gameId: '2022_01_KC_BUF', season: 2022, week: 1, home: 'BUF', away: 'KC' }),
      makeGameSummary({ gameId: '2024_05_DEN_KC', season: 2024, week: 5, home: 'KC', away: 'DEN' }),
      makeGameSummary({ gameId: '2025_09_KC_DEN', season: 2025, week: 9, home: 'DEN', away: 'KC' }),
    ],
  })
}

function mount(path = '/team/KC') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/team/:id" element={<TeamPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockedTeam.mockReset()
  mockedIndex.mockReset()
  mockedMeta.mockReset()
  mockedIndex.mockResolvedValue(makeLeague())
  mockedMeta.mockResolvedValue({
    generatedAt: '2026-09-11T05:00:00Z',
    source: 'nflverse',
    displaySeason: 2025,
    latestSeason: 2026,
    seasons: [
      { season: 2022, scheduled: 284, played: 284, complete: true },
      { season: 2024, scheduled: 285, played: 285, complete: true },
      { season: 2025, scheduled: 285, played: 285, complete: true },
    ],
  })
})

describe('rendering a team', () => {
  beforeEach(() => {
    mockedTeam.mockResolvedValue(makeTeam())
  })

  it('names the team once, as the page heading', async () => {
    mount()
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Kansas City Chiefs')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows the identity block: conference, division and last season', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('AFC · AFC West')).toBeInTheDocument()
    expect(screen.getByText('11-6')).toBeInTheDocument()
  })

  it('uppercases a lowercase id from the URL rather than 404ing', async () => {
    mount('/team/kc')
    await screen.findByRole('heading', { level: 1 })
    expect(mockedTeam).toHaveBeenCalledWith('KC')
  })

  it('renders every section, each with a heading of its own', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    for (const title of ['Games', 'Team stats', 'Depth chart', 'Roster', 'Draft class']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
  })

  it('lists the games with the team-side result, linked to each replay', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })

    const link = screen.getByRole('link', { name: /Buffalo Bills/ })
    expect(link).toHaveAttribute('href', '/game/2024_01_KC_BUF')
    // KC won 27-20 away, so the row reads from the Chiefs' side.
    expect(within(link).getByText('27–20')).toBeInTheDocument()
  })

  it('summarises the record across the listed games', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/2 games/)).toBeInTheDocument()
    expect(screen.getByText('2-0')).toBeInTheDocument()
  })

  it('shows the projected wins as text, not only as a bar', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/10\.4/)).toBeInTheDocument()
  })

  it('offers a way back to the league', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: 'League' })).toHaveAttribute('href', '/')
  })
})

describe('missing and partial data', () => {
  it('says so when a team has no games rather than rendering an empty list', async () => {
    mockedTeam.mockResolvedValue(makeTeam({ games: [] }))
    mount()
    expect(await screen.findByText(/No games in this dataset/)).toBeInTheDocument()
  })

  it('falls back to the opponent id when the index does not know the team', async () => {
    mockedTeam.mockResolvedValue(
      makeTeam({ games: [makeGameSummary({ gameId: 'g1', home: 'KC', away: 'XXX' })] }),
    )
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: /XXX/ })).toBeInTheDocument()
  })

  it('shows a not-found page for a team id that is not in the dataset', async () => {
    mockedTeam.mockRejectedValue(new DataError('not-found', '/data/team/ZZ.json', 'gone', 404))
    mount('/team/ZZ')
    await screen.findByRole('alert')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found')
  })

  it('shows a skeleton while the team loads', () => {
    mockedTeam.mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })
})

describe('six seasons of games', () => {
  beforeEach(() => {
    mockedTeam.mockResolvedValue(multiSeasonTeam())
  })

  it('offers every season the team has played, newest first', async () => {
    mount()
    const tabs = await screen.findByRole('group', { name: /games by season/i })
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['2025', '2024', '2022'])
  })

  it('opens on the season the rest of the page describes', async () => {
    mount()
    const tabs = await screen.findByRole('group', { name: /games by season/i })
    expect(within(tabs).getByRole('button', { name: '2025' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('link', { name: /Denver Broncos/ })).toHaveAttribute(
      'href',
      '/game/2025_09_KC_DEN',
    )
  })

  it('shows one season at a time, and switching changes the list', async () => {
    mount()
    const tabs = await screen.findByRole('group', { name: /games by season/i })

    await userEvent.click(within(tabs).getByRole('button', { name: '2022' }))
    expect(screen.getByRole('link', { name: /Buffalo Bills/ })).toHaveAttribute(
      'href',
      '/game/2022_01_KC_BUF',
    )
    expect(screen.queryByRole('link', { name: /2025_09/ })).not.toBeInTheDocument()
  })

  it('puts the season in the URL, so a past season is shareable', async () => {
    mount('/team/KC?season=2022')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: /Buffalo Bills/ })).toHaveAttribute(
      'href',
      '/game/2022_01_KC_BUF',
    )
  })

  it('falls back rather than showing an empty list for a season not played', async () => {
    mount('/team/KC?season=1999')
    await screen.findByRole('heading', { level: 1 })
    const tabs = screen.getByRole('group', { name: /games by season/i })
    expect(within(tabs).getByRole('button', { name: '2025' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('says which season the figures elsewhere on the page describe', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/stats elsewhere on this page describe 2025/)).toBeInTheDocument()
  })

  it('offers no season control for a team with only one season of games', async () => {
    mockedTeam.mockResolvedValue(makeTeam())
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('group', { name: /games by season/i })).not.toBeInTheDocument()
  })
})
