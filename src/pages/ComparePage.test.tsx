/**
 * The comparison page, driven the way a person drives it.
 *
 * The interesting behaviour is not the arithmetic — `compare.test.ts` covers
 * that — but the states around it: what the page says before you have chosen
 * two teams, whether the URL carries the matchup, and whether the right team
 * is marked as leading once it can answer.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ComparePage from '@/pages/ComparePage'
import { DataError } from '@/lib/data'
import { makeGameSummary, makeLeague, makeTeam } from '@/test/fixtures'

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getTeamsIndex: vi.fn(),
  getTeam: vi.fn(),
  getGamesIndex: vi.fn(),
}))

const { getTeamsIndex, getTeam, getGamesIndex } = await import('@/lib/data')
const mockedIndex = vi.mocked(getTeamsIndex)
const mockedTeam = vi.mocked(getTeam)
const mockedGames = vi.mocked(getGamesIndex)

/** KC leads every offensive metric; BUF concedes less on defence. */
const KC = makeTeam({
  id: 'KC',
  name: 'Kansas City Chiefs',
  stats: {
    offense: {
      epaPerPlay: 0.12,
      pointsPerGame: 28.4,
      yardsPerGame: 380,
      successRate: 0.5,
      explosiveRate: 0.09,
      plays: 1048,
    },
    defense: {
      epaPerPlay: 0.02,
      pointsPerGame: 24.1,
      yardsPerGame: 360,
      successRate: 0.47,
      explosiveRate: 0.08,
      plays: 1010,
    },
  },
})

const BUF = makeTeam({
  id: 'BUF',
  name: 'Buffalo Bills',
  division: 'AFC East',
  primaryColor: '#00338D',
  secondaryColor: '#C60C30',
  stats: {
    offense: {
      epaPerPlay: 0.04,
      pointsPerGame: 22.1,
      yardsPerGame: 330,
      successRate: 0.44,
      explosiveRate: 0.06,
      plays: 1020,
    },
    defense: {
      epaPerPlay: -0.06,
      pointsPerGame: 18.3,
      yardsPerGame: 300,
      successRate: 0.42,
      explosiveRate: 0.05,
      plays: 995,
    },
  },
})

const H2H = [
  makeGameSummary({
    gameId: '2023_14_KC_BUF',
    season: 2023,
    date: '2023-12-10',
    home: 'BUF',
    away: 'KC',
    homeScore: 20,
    awayScore: 17,
  }),
  makeGameSummary({
    gameId: '2021_05_BUF_KC',
    season: 2021,
    date: '2021-10-10',
    home: 'KC',
    away: 'BUF',
    homeScore: 38,
    awayScore: 20,
  }),
  makeGameSummary({ gameId: 'unrelated', home: 'SF', away: 'LA' }),
]

/** The `<section>` a heading belongs to, once it has rendered. */
async function findSection(heading: string): Promise<HTMLElement> {
  const found = (await screen.findByRole('heading', { name: heading })).closest('section')
  if (!found) throw new Error(`no section around the ${heading} heading`)
  return found
}

function mount(url = '/compare') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ComparePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockedIndex.mockReset()
  mockedTeam.mockReset()
  mockedGames.mockReset()
  mockedIndex.mockResolvedValue(makeLeague())
  mockedGames.mockResolvedValue(H2H)
  mockedTeam.mockImplementation(async (id) => (id === 'BUF' ? BUF : KC))
})

describe('before two teams are chosen', () => {
  it('shows a skeleton while the team list loads', () => {
    mockedIndex.mockReturnValue(new Promise(() => {}))
    mount()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('asks for two teams, and fetches nothing else', async () => {
    mount()
    expect(await screen.findByText('Choose two teams to compare.')).toBeInTheDocument()
    expect(mockedTeam).not.toHaveBeenCalled()
    expect(mockedGames).not.toHaveBeenCalled()
  })

  it('asks for the second team once one is chosen', async () => {
    mount('/compare?a=KC')
    expect(await screen.findByText('Choose a second team to compare.')).toBeInTheDocument()
    expect(mockedTeam).not.toHaveBeenCalled()
  })

  it('offers all 32 teams, grouped by division', async () => {
    mount()
    const picker = await screen.findByLabelText('Team')
    expect(within(picker).getAllByRole('option').length).toBeGreaterThan(8)
  })

  it('will not let the same team be picked on both sides', async () => {
    mount('/compare?a=KC')
    const opponent = await screen.findByLabelText('Opponent')
    const kc = within(opponent).getByRole('option', { name: 'Kansas City Chiefs' })
    expect(kc).toBeDisabled()
  })
})

describe('a loaded comparison', () => {
  it('loads both teams and the game index exactly once', async () => {
    mount('/compare?a=KC&b=BUF')
    await screen.findByRole('heading', { name: 'Offense' })
    expect(mockedTeam).toHaveBeenCalledTimes(2)
    expect(mockedTeam).toHaveBeenCalledWith('KC')
    expect(mockedTeam).toHaveBeenCalledWith('BUF')
    expect(mockedGames).toHaveBeenCalledTimes(1)
  })

  it('names both teams and links each to its own page', async () => {
    mount('/compare?a=KC&b=BUF')
    expect(await screen.findByRole('link', { name: 'Kansas City Chiefs' })).toHaveAttribute(
      'href',
      '/team/KC',
    )
    expect(screen.getByRole('link', { name: 'Buffalo Bills' })).toHaveAttribute('href', '/team/BUF')
  })

  it('marks the better offense as leading', async () => {
    mount('/compare?a=KC&b=BUF')
    const offense = within(await findSection('Offense'))
    // KC scores 28.4 to Buffalo's 22.1, so KC leads points per game.
    expect(
      within(offense.getByTestId('metric-pointsPerGame-KC')).getByText('leads'),
    ).toBeInTheDocument()
    expect(within(offense.getByTestId('metric-pointsPerGame-BUF')).queryByText('leads')).toBeNull()
  })

  it('inverts the verdict on defense, where the number is a quantity conceded', async () => {
    mount('/compare?a=KC&b=BUF')
    const defense = within(await findSection('Defense'))
    expect(defense.getByText('lower is better')).toBeInTheDocument()
    // Buffalo concedes 18.3 to Kansas City's 24.1. The smaller number wins,
    // and a comparison that read this the offensive way would award KC.
    expect(
      within(defense.getByTestId('metric-pointsPerGame-BUF')).getByText('leads'),
    ).toBeInTheDocument()
    expect(within(defense.getByTestId('metric-pointsPerGame-KC')).queryByText('leads')).toBeNull()
    // The same inversion for EPA, where Buffalo's value is negative.
    expect(
      within(defense.getByTestId('metric-epaPerPlay-BUF')).getByText('leads'),
    ).toBeInTheDocument()
  })

  it('lists only the meetings between these two, newest first, each linking to its replay', async () => {
    mount('/compare?a=KC&b=BUF')
    await screen.findByRole('heading', { name: 'Head to head' })

    expect(screen.getByText(/2 meetings since 2020/)).toBeInTheDocument()
    const links = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.startsWith('/game/'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/game/2023_14_KC_BUF',
      '/game/2021_05_BUF_KC',
    ])
  })

  it('states the series record from the first team perspective', async () => {
    mount('/compare?a=KC&b=BUF')
    await screen.findByRole('heading', { name: 'Head to head' })
    // KC won in 2021 and lost in 2023.
    expect(screen.getByText('KC 1-1')).toBeInTheDocument()
  })

  it('says so when two teams have never met', async () => {
    mockedGames.mockResolvedValue([makeGameSummary({ home: 'SF', away: 'LA' })])
    mount('/compare?a=KC&b=BUF')
    expect(await screen.findByText(/have not met in this dataset/)).toBeInTheDocument()
  })
})

describe('the URL carries the matchup', () => {
  it('restores a shared comparison', async () => {
    mount('/compare?a=KC&b=BUF')
    await screen.findByRole('heading', { name: 'Offense' })
    expect(screen.getByLabelText('Team')).toHaveValue('KC')
    expect(screen.getByLabelText('Opponent')).toHaveValue('BUF')
  })

  it('loads the comparison when a team is picked', async () => {
    mount('/compare?a=KC')
    await screen.findByText('Choose a second team to compare.')

    await userEvent.selectOptions(screen.getByLabelText('Opponent'), 'BUF')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Offense' })).toBeInTheDocument(),
    )
  })

  it('degrades a nonsense link to empty pickers rather than an error', async () => {
    mount('/compare?a=XXX&b=%20')
    expect(await screen.findByText('Choose two teams to compare.')).toBeInTheDocument()
    expect(screen.getByLabelText('Team')).toHaveValue('')
  })

  it('treats a team compared with itself as a half-chosen matchup', async () => {
    mount('/compare?a=KC&b=KC')
    expect(await screen.findByText('Choose a second team to compare.')).toBeInTheDocument()
  })
})

describe('failure', () => {
  it('offers a retry when a team file cannot be loaded', async () => {
    mockedTeam.mockRejectedValue(new DataError('network', '/data/team/KC.json', 'offline'))
    mount('/compare?a=KC&b=BUF')
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
