/**
 * The team page: does it render the team it was asked for, and does it hold
 * together when parts of the data are missing?
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeamPage from '@/pages/TeamPage'
import { DataError } from '@/lib/data'
import { makeGameSummary, makeLeague, makeMeta, makePlayer, makeTeamSeason } from '@/test/fixtures'

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getTeamSeason: vi.fn(),
  getTeamsIndex: vi.fn(),
  getMeta: vi.fn(),
}))

const { getTeamSeason, getTeamsIndex, getMeta } = await import('@/lib/data')
const mockedTeam = vi.mocked(getTeamSeason)
const mockedIndex = vi.mocked(getTeamsIndex)
const mockedMeta = vi.mocked(getMeta)

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
  mockedMeta.mockResolvedValue(makeMeta())
})

describe('rendering a team', () => {
  beforeEach(() => {
    mockedTeam.mockResolvedValue(makeTeamSeason())
  })

  it('names the team once, as the page heading', async () => {
    mount()
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Kansas City Chiefs')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows the identity block: conference, division and the season record', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('AFC · AFC West')).toBeInTheDocument()
    expect(screen.getByText('11-6')).toBeInTheDocument()
  })

  it('uppercases a lowercase id from the URL rather than 404ing', async () => {
    mount('/team/kc')
    await screen.findByRole('heading', { level: 1 })
    expect(mockedTeam).toHaveBeenCalledWith('KC', 2025)
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
    expect(link).toHaveAttribute('href', '/game/2025_01_KC_BUF')
    // KC won 27-20 away, so the row reads from the Chiefs' side.
    expect(within(link).getByText('27–20')).toBeInTheDocument()
  })

  it('summarises the record across the listed games', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/2 games/)).toBeInTheDocument()
    expect(screen.getByText('2-0')).toBeInTheDocument()
  })

  it('shows the expected wins as text, not only as a bar', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/10\.4/)).toBeInTheDocument()
  })

  it('says how many roster names lead to a page, when not all of them do', async () => {
    // An older season is mostly players who have since left the league, so
    // most of its roster is text rather than links. Saying so beats leaving a
    // reader to find out by clicking.
    mockedTeam.mockResolvedValue(
      makeTeamSeason({
        roster: [
          makePlayer({ id: 'a', name: 'Linked One', hasProfile: true }),
          makePlayer({ id: 'b', name: 'Plain Two' }),
          makePlayer({ id: 'c', name: 'Plain Three' }),
        ],
      }),
    )
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('1 with a page')).toBeInTheDocument()
  })

  it('says nothing about pages when every name is a link', async () => {
    mockedTeam.mockResolvedValue(
      makeTeamSeason({
        roster: [makePlayer({ id: 'a', name: 'Linked One', hasProfile: true })],
      }),
    )
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/with a page/)).not.toBeInTheDocument()
  })

  it('offers a way back to the league', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: 'League' })).toHaveAttribute('href', '/')
  })
})

describe('missing and partial data', () => {
  it('says so when a team has no games rather than rendering an empty list', async () => {
    mockedTeam.mockResolvedValue(makeTeamSeason({ games: [] }))
    mount()
    expect(await screen.findByText(/No games in this dataset/)).toBeInTheDocument()
  })

  it('falls back to the opponent id when the index does not know the team', async () => {
    mockedTeam.mockResolvedValue(
      makeTeamSeason({ games: [makeGameSummary({ gameId: 'g1', home: 'KC', away: 'XXX' })] }),
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

describe('six seasons', () => {
  /**
   * The season is no longer a filter over one file — it chooses the file.
   *
   * Which seasons exist comes from `meta.teamSeasons`, so the control offers
   * the same six on every team page, and pressing one fetches that year's
   * roster, stat lines, record and games together. There is nothing left on
   * the page describing a different year, which is why the caveat this block
   * used to assert has gone.
   */
  const seasonOf = (season: number) =>
    makeTeamSeason({
      season,
      record: { wins: season === 2020 ? 14 : 11, losses: season === 2020 ? 3 : 6, ties: 0 },
      games: [
        makeGameSummary({
          gameId: `${season}_01_KC_BUF`,
          season,
          week: 1,
          home: 'BUF',
          away: 'KC',
        }),
      ],
    })

  beforeEach(() => {
    mockedTeam.mockImplementation(async (_id: string, season: number) => seasonOf(season))
  })

  it('offers every season with a team layer, newest first', async () => {
    mount()
    const tabs = await screen.findByRole('group', { name: /Kansas City Chiefs season/i })
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['2025', '2024', '2023', '2022', '2021', '2020'])
  })

  it('opens on the season the dataset displays', async () => {
    mount()
    const tabs = await screen.findByRole('group', { name: /season/i })
    expect(within(tabs).getByRole('button', { name: '2025' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(mockedTeam).toHaveBeenCalledWith('KC', 2025)
  })

  it('fetches the chosen season, and the whole page follows it', async () => {
    mount()
    const tabs = await screen.findByRole('group', { name: /season/i })

    await userEvent.click(within(tabs).getByRole('button', { name: '2020' }))

    await waitFor(() => expect(mockedTeam).toHaveBeenCalledWith('KC', 2020))
    // Not just the games: the record in the identity block moved too.
    await screen.findByText('14-3')
    expect(screen.getByRole('link', { name: /Buffalo Bills/ })).toHaveAttribute(
      'href',
      '/game/2020_01_KC_BUF',
    )
  })

  it('puts the season in the URL, so a past season is shareable', async () => {
    mount('/team/KC?season=2021')
    await screen.findByRole('heading', { level: 1 })
    expect(mockedTeam).toHaveBeenCalledWith('KC', 2021)
  })

  it('falls back to the displayed season for one the dataset has no layer for', async () => {
    // 2019 predates the dataset; 2026 is under way but too thin to describe.
    for (const season of [1999, 2026]) {
      mockedTeam.mockClear()
      mount(`/team/KC?season=${season}`)
      await screen.findByRole('heading', { level: 1 })
      expect(mockedTeam).toHaveBeenCalledWith('KC', 2025)
    }
  })

  it('says which season the stats describe, so a screenshot is unambiguous', async () => {
    mount('/team/KC?season=2020')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getAllByText(/2020/).length).toBeGreaterThan(0)
  })
})
