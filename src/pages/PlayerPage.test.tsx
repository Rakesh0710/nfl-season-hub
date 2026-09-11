/**
 * The player page.
 *
 * The thing worth guarding is the brief's constraint: this page must say more
 * than a roster row. So the tests check that the bio, the season, the weekly
 * trend and the career table are all there and all come from the file — and
 * that a player with production in only one season still gets a coherent page
 * rather than empty sections.
 */

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerPage from '@/pages/PlayerPage'
import { DataError } from '@/lib/data'
import { makeLeague } from '@/test/fixtures'
import type { PlayerProfile } from '@/types/nfl'

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getPlayer: vi.fn(),
  getTeamsIndex: vi.fn(),
  getMeta: vi.fn(),
}))

const { getPlayer, getTeamsIndex, getMeta } = await import('@/lib/data')
const mockedPlayer = vi.mocked(getPlayer)
const mockedIndex = vi.mocked(getTeamsIndex)
const mockedMeta = vi.mocked(getMeta)

function makeProfile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: '00-0033873',
    name: 'Patrick Mahomes',
    position: 'QB',
    team: 'KC',
    headshot: 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/abc123',
    number: 15,
    age: 29,
    college: 'Texas Tech',
    height: 74,
    weight: 230,
    experience: 8,
    draft: { year: 2017, pick: 10, club: 'KC' },
    seasons: [
      {
        season: 2024,
        team: 'KC',
        games: 16,
        stats: { completions: 392, passingYards: 3928, passingTds: 26 },
      },
      {
        season: 2025,
        team: 'KC',
        games: 14,
        stats: {
          completions: 315,
          attempts: 502,
          passingYards: 3587,
          passingTds: 22,
          interceptions: 11,
          passingEpa: 68.25,
          carries: 64,
          rushingYards: 422,
          tackles: 1,
          receptions: 1,
        },
      },
    ],
    weeks: [
      {
        season: 2025,
        week: 1,
        opponent: 'LAC',
        gameId: '2025_01_KC_LAC',
        stats: { passingYards: 258, passingTds: 1 },
      },
      { season: 2025, week: 2, opponent: 'PHI', stats: { passingYards: 187 } },
      {
        season: 2025,
        week: 3,
        opponent: 'NYG',
        gameId: '2025_03_KC_NYG',
        stats: { passingYards: 224 },
      },
    ],
    ...over,
  }
}

function mount(path = '/player/00-0033873') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/player/:id" element={<PlayerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockedPlayer.mockReset()
  mockedIndex.mockReset()
  mockedMeta.mockReset()
  mockedIndex.mockResolvedValue(makeLeague())
  mockedMeta.mockResolvedValue({
    generatedAt: '2026-09-11T05:00:00Z',
    source: 'nflverse',
    displaySeason: 2025,
    latestSeason: 2026,
    seasons: [{ season: 2025, scheduled: 285, played: 285, complete: true }],
  })
  mockedPlayer.mockResolvedValue(makeProfile())
})

describe('identity', () => {
  it('names the player once, as the page heading', async () => {
    mount()
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Patrick Mahomes')
  })

  it('shows the bio a roster row does not carry', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    // Height, weight and draft position are the point: none is on a roster row.
    expect(screen.getByText(/6'2"/)).toBeInTheDocument()
    expect(screen.getByText(/230 lb/)).toBeInTheDocument()
    expect(screen.getByText(/Drafted 2017, pick 10 by KC/)).toBeInTheDocument()
    expect(screen.getByText(/8 seasons/)).toBeInTheDocument()
  })

  it('asks the CDN for a headshot the size it draws, not the 4 MB original', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    const img = document.querySelector('img[src*="league/abc123"]')
    expect(img?.getAttribute('src')).toContain('w_192')
  })

  it('falls back to the position when a player has no headshot', async () => {
    mockedPlayer.mockResolvedValue(makeProfile({ headshot: undefined }))
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('img[src*="league/"]')).toBeNull()
  })

  it('links back to the team, twice over', async () => {
    mount()
    await screen.findByRole('heading', { level: 1 })
    const toTeam = screen.getAllByRole('link', { name: /Kansas City Chiefs/ })
    expect(toTeam.length).toBeGreaterThanOrEqual(2) // breadcrumb and identity
    expect(toTeam[0]).toHaveAttribute('href', '/team/KC')
  })

  it('says Rookie rather than "0 seasons"', async () => {
    mockedPlayer.mockResolvedValue(makeProfile({ experience: 0 }))
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/Rookie/)).toBeInTheDocument()
  })
})

describe('the season', () => {
  it('shows the season the rest of the site describes', async () => {
    mount()
    expect(await screen.findByRole('heading', { name: '2025 season' })).toBeInTheDocument()
    expect(screen.getByText(/14 games with a recorded stat line/)).toBeInTheDocument()
  })

  it('renders a group for every kind of production, and none for the rest', async () => {
    mount()
    await screen.findByRole('heading', { name: '2025 season' })
    for (const title of ['Passing', 'Rushing', 'Receiving', 'Defense']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
    expect(screen.queryByRole('heading', { name: 'Kicking' })).not.toBeInTheDocument()
  })

  it('shows a quarterback one tackle rather than deciding quarterbacks do not tackle', async () => {
    mount()
    await screen.findByRole('heading', { name: '2025 season' })
    const defense = screen.getByRole('heading', { name: 'Defense' }).parentElement
    if (!defense) throw new Error('no defense card')
    expect(within(defense).getByText('Solo tackles')).toBeInTheDocument()
  })
})

describe('week by week', () => {
  it('charts the metric the player is mainly measured by', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Week by week' })
    expect(screen.getByRole('heading', { name: /Passing — yards/ })).toBeInTheDocument()
    expect(screen.getByText(/best 258/)).toBeInTheDocument()
  })

  it('opens each week that has a replay, and leaves the rest as plain rows', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Week by week' })
    const links = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/game/'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/game/2025_01_KC_LAC',
      '/game/2025_03_KC_NYG',
    ])
    expect(links[0]).toHaveAccessibleName(/Week 1 against LAC, 258 yards — open the replay/)
  })

  it('is left out entirely for a player with a single week', async () => {
    const one = makeProfile()
    mockedPlayer.mockResolvedValue(makeProfile({ weeks: one.weeks.slice(0, 1) }))
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: 'Week by week' })).not.toBeInTheDocument()
  })
})

describe('season by season', () => {
  it('lists every season, newest first, linked to the team of the time', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Season by season' })
    const rows = screen.getAllByRole('row').slice(1) // drop the header
    expect(rows[0]).toHaveTextContent('2025')
    expect(rows[1]).toHaveTextContent('2024')
  })

  it('is left out for a player with one season', async () => {
    const profile = makeProfile()
    mockedPlayer.mockResolvedValue(makeProfile({ seasons: profile.seasons.slice(1) }))
    mount()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: 'Season by season' })).not.toBeInTheDocument()
  })
})

describe('failure', () => {
  it('shows not-found for a player id that has no profile', async () => {
    mockedPlayer.mockRejectedValue(
      new DataError('not-found', '/data/player/nope.json', 'gone', 404),
    )
    mount('/player/nope')
    await screen.findByRole('alert')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found')
  })

  it('shows a skeleton while loading', () => {
    mockedPlayer.mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })
})
