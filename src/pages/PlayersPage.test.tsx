/**
 * The search page.
 *
 * `playerSearch.test.ts` already argues with the ranking. What is left here is
 * everything React can get wrong between a keystroke and a list: the text box
 * dropping characters, the URL falling out of step with what is shown, the
 * counts going stale, and a result linking somewhere other than that player.
 *
 * One thing these cannot do is reproduce the bug this page shipped with: the
 * input read its value from the query string, and typing "garrett" left "t" in
 * the box. That needs a real browser. React resets the DOM input to the stale
 * controlled value between keystrokes, so the next native keypress lands on an
 * empty field — and under jsdom every state update flushes inside `act`, so
 * the stale render never happens. Restoring the defect leaves all eleven of
 * these green. The guard is the typing test in `e2e/players.spec.ts`, which
 * drives real keys; the check below is worth keeping as the cheap half of the
 * pair, but it is not what would catch a regression.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlayersPage from '@/pages/PlayersPage'
import { makeLeague } from '@/test/fixtures'
import type { PlayerSummary } from '@/types/nfl'

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getPlayersIndex: vi.fn(),
  getTeamsIndex: vi.fn(),
}))

const { getPlayersIndex, getTeamsIndex } = await import('@/lib/data')
const mockedPlayers = vi.mocked(getPlayersIndex)
const mockedTeams = vi.mocked(getTeamsIndex)

const HEADSHOT = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/abc123'

function summary(over: Partial<PlayerSummary> & { name: string }): PlayerSummary {
  return {
    id: over.name.toLowerCase().replace(/\W/g, '-'),
    position: 'WR',
    team: 'KC',
    games: 50,
    headshot: HEADSHOT,
    ...over,
  }
}

const ROSTER: PlayerSummary[] = [
  summary({ name: 'Patrick Mahomes', position: 'QB', team: 'KC', games: 120 }),
  summary({ name: 'Myles Garrett', position: 'DL', team: 'DEN', games: 110 }),
  summary({ name: 'Garrett Wilson', position: 'WR', team: 'NYJ', games: 60 }),
  summary({ name: 'Justin Jefferson', position: 'WR', team: 'PHI', games: 90 }),
  summary({ name: 'Jermar Jefferson', position: 'RB', team: 'BUF', games: 4 }),
  summary({ name: 'Josh Allen', position: 'QB', team: 'BUF', games: 130, headshot: undefined }),
]

/** Prints the current URL, so a test can assert what a shared link would carry. */
function Url() {
  const { pathname, search } = useLocation()
  return <span data-testid="url">{pathname + search}</span>
}

function mount(path = '/players') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Url />
      <Routes>
        <Route path="/players" element={<PlayersPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const url = () => screen.getByTestId('url').textContent
const results = () =>
  screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('/player/'))
    .map((a) => a.textContent)

beforeEach(() => {
  mockedPlayers.mockReset()
  mockedTeams.mockReset()
  mockedPlayers.mockResolvedValue(ROSTER)
  mockedTeams.mockResolvedValue(makeLeague())
})

describe('typing', () => {
  it('keeps what was typed, and puts it in the URL', async () => {
    const user = userEvent.setup({ delay: null })
    mount()
    const box = await screen.findByLabelText('Search')

    await user.type(box, 'garrett')

    expect(box).toHaveValue('garrett')
    await waitFor(() => expect(url()).toContain('q=garrett'))
  })

  it('narrows the list as it goes, surname first', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(await screen.findByLabelText('Search'), 'garrett')

    expect(results()).toHaveLength(2)
    expect(results()[0]).toContain('Myles Garrett')
  })

  it('counts what is shown against the whole index, and says so out loud', async () => {
    const user = userEvent.setup()
    mount()
    const heading = await screen.findByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('All 6 players.')
    expect(heading).toHaveAttribute('aria-live', 'polite')

    await user.type(await screen.findByLabelText('Search'), 'jefferson')
    expect(heading).toHaveTextContent('2 of 6 players matching “jefferson”.')
  })
})

describe('the URL', () => {
  it('restores the box, both filters and the results from a shared link', async () => {
    mount('/players?q=jefferson&team=PHI&pos=WR')
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByLabelText('Search')).toHaveValue('jefferson')
    expect(screen.getByLabelText('Team')).toHaveValue('PHI')
    expect(screen.getByLabelText('Position')).toHaveValue('WR')
    expect(results()).toEqual([expect.stringContaining('Justin Jefferson')])
  })

  it('records a filter chosen from a select', async () => {
    const user = userEvent.setup()
    mount()
    await user.selectOptions(await screen.findByLabelText('Team'), 'BUF')

    expect(url()).toContain('team=BUF')
    expect(results()).toHaveLength(2)
  })

  it('drops a filter rather than recording it empty', async () => {
    const user = userEvent.setup()
    mount('/players?team=BUF')
    await user.selectOptions(await screen.findByLabelText('Team'), '')

    expect(url()).toBe('/players')
  })

  it('offers only the positions the index actually contains', async () => {
    mount()
    const options = await screen.findByLabelText('Position')
    expect([...options.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'All positions',
      'QB',
      'RB',
      'WR',
      'DL',
    ])
  })
})

describe('a search that finds nobody', () => {
  it('clears the box and the URL together, not one of them', async () => {
    const user = userEvent.setup()
    mount('/players?q=zzz&team=KC')
    await user.click(await screen.findByRole('button', { name: /clear search/i }))

    expect(screen.getByLabelText('Search')).toHaveValue('')
    expect(url()).toBe('/players')
    expect(results()).toHaveLength(ROSTER.length)
  })
})

describe('more matches than are drawn', () => {
  it('says so before the list, not after someone has walked it', async () => {
    mockedPlayers.mockResolvedValue(
      Array.from({ length: 90 }, (_, i) => summary({ name: `Player Number${i}` })),
    )
    mount()
    const note = await screen.findByText(/Showing the first 60 of 90/)
    const list = screen.getByRole('list')

    expect(results()).toHaveLength(60)
    // Node.DOCUMENT_POSITION_FOLLOWING: the list comes after the note.
    expect(note.compareDocumentPosition(list) & 4).toBeTruthy()
  })

  it('counts every match in the heading, not the sixty on screen', async () => {
    mockedPlayers.mockResolvedValue(
      Array.from({ length: 90 }, (_, i) => summary({ name: `Player Number${i}` })),
    )
    mount()
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('All 90 players.')
  })
})

describe('a result', () => {
  it('leads to that player, with their team spelled out', async () => {
    mount('/players?q=mahomes')
    const link = (await screen.findAllByRole('link')).find((a) =>
      a.getAttribute('href')?.startsWith('/player/'),
    )
    expect(link).toHaveAttribute('href', '/player/patrick-mahomes')
    expect(link).toHaveTextContent('Kansas City Chiefs')
  })

  it('asks the CDN for a thumbnail, never the stored original', async () => {
    mount('/players?q=mahomes')
    await screen.findByRole('heading', { level: 1 })
    const img = document.querySelector('img[src*="league/abc123"]')
    expect(img?.getAttribute('src')).toContain('w_72')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('falls back to the position for a player with no headshot', async () => {
    mount('/players?q=allen')
    await screen.findByRole('heading', { level: 1 })
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('QB', { selector: 'span' })).toBeInTheDocument()
  })
})
