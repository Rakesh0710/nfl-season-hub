import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  leads,
  matchupFromParams,
  matchupToParams,
  meetings,
  seriesRecord,
  winnerOf,
} from '@/lib/compare'
import { parseGamesIndex } from '@/lib/contract'
import { makeGameSummary, makeLeague } from '@/test/fixtures'

describe('leads', () => {
  it('picks the larger value when higher is better', () => {
    expect(leads(0.12, 0.04)).toBe('a')
    expect(leads(0.04, 0.12)).toBe('b')
  })

  it('inverts for a defensive metric, where the number is a quantity conceded', () => {
    // Getting this backwards would confidently award the wrong team, which is
    // why it is a function rather than a `>` at the call site.
    expect(leads(17.2, 24.8, true)).toBe('a')
    expect(leads(-0.08, 0.03, true)).toBe('a')
  })

  it('calls an exact tie no one, rather than inventing a distinction', () => {
    expect(leads(21.5, 21.5)).toBeNull()
    expect(leads(21.5, 21.5, true)).toBeNull()
  })

  it('has no opinion when a value is missing or not finite', () => {
    expect(leads(Number.NaN, 3)).toBeNull()
    expect(leads(3, Infinity)).toBeNull()
  })
})

describe('meetings', () => {
  const games = [
    makeGameSummary({ gameId: 'g1', season: 2021, date: '2021-10-10', home: 'KC', away: 'BUF' }),
    makeGameSummary({ gameId: 'g2', season: 2023, date: '2023-12-10', home: 'BUF', away: 'KC' }),
    makeGameSummary({ gameId: 'g3', season: 2022, date: '2022-09-11', home: 'KC', away: 'DEN' }),
    makeGameSummary({ gameId: 'g4', season: 2020, date: '2020-11-01', home: 'SF', away: 'LA' }),
  ]

  it('finds a pairing regardless of which side was at home', () => {
    expect(meetings(games, 'KC', 'BUF').map((g) => g.gameId)).toEqual(['g2', 'g1'])
  })

  it('is newest first', () => {
    const dates = meetings(games, 'KC', 'BUF').map((g) => g.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('is symmetric in its arguments', () => {
    expect(meetings(games, 'BUF', 'KC')).toEqual(meetings(games, 'KC', 'BUF'))
  })

  it('returns nothing for a team against itself', () => {
    expect(meetings(games, 'KC', 'KC')).toEqual([])
  })

  it('returns nothing for two teams that never met', () => {
    expect(meetings(games, 'BUF', 'DEN')).toEqual([])
  })
})

describe('seriesRecord', () => {
  const games = [
    makeGameSummary({ home: 'KC', away: 'BUF', homeScore: 26, awayScore: 17 }), // KC win at home
    makeGameSummary({ home: 'BUF', away: 'KC', homeScore: 24, awayScore: 20 }), // KC loss away
    makeGameSummary({ home: 'BUF', away: 'KC', homeScore: 30, awayScore: 33 }), // KC win away
    makeGameSummary({ home: 'KC', away: 'BUF', homeScore: 21, awayScore: 21 }), // tie
  ]

  it('reads the series from the named team, home or away', () => {
    expect(seriesRecord(games, 'KC')).toEqual({ wins: 2, losses: 1, ties: 1 })
  })

  it('is the mirror image from the other side', () => {
    expect(seriesRecord(games, 'BUF')).toEqual({ wins: 1, losses: 2, ties: 1 })
  })

  it('is empty for no meetings', () => {
    expect(seriesRecord([], 'KC')).toEqual({ wins: 0, losses: 0, ties: 0 })
  })
})

describe('winnerOf', () => {
  it('names the winner and reports a tie as null', () => {
    expect(
      winnerOf(makeGameSummary({ home: 'KC', away: 'BUF', homeScore: 26, awayScore: 17 })),
    ).toBe('KC')
    expect(
      winnerOf(makeGameSummary({ home: 'KC', away: 'BUF', homeScore: 17, awayScore: 26 })),
    ).toBe('BUF')
    expect(winnerOf(makeGameSummary({ homeScore: 21, awayScore: 21 }))).toBeNull()
  })
})

describe('matchup <-> query string', () => {
  const teams = makeLeague()

  it('round-trips a chosen pair', () => {
    const params = matchupToParams({ a: 'KC', b: 'BUF' })
    expect(params.toString()).toBe('a=KC&b=BUF')
    expect(matchupFromParams(params, teams)).toEqual({ a: 'KC', b: 'BUF' })
  })

  it('keeps a half-chosen matchup rather than dropping both sides', () => {
    expect(matchupFromParams(new URLSearchParams('a=KC'), teams)).toEqual({ a: 'KC', b: null })
    expect(matchupToParams({ a: 'KC', b: null }).toString()).toBe('a=KC')
  })

  it('accepts a lower-case id from a hand-typed link', () => {
    expect(matchupFromParams(new URLSearchParams('a=kc&b=buf'), teams)).toEqual({
      a: 'KC',
      b: 'BUF',
    })
  })

  it('drops a team that is not in the league', () => {
    expect(matchupFromParams(new URLSearchParams('a=KC&b=XXX'), teams)).toEqual({
      a: 'KC',
      b: null,
    })
  })

  it('drops the second slot when a team is compared with itself', () => {
    // Five ties and no meetings is not a comparison.
    expect(matchupFromParams(new URLSearchParams('a=KC&b=KC'), teams)).toEqual({
      a: 'KC',
      b: null,
    })
  })

  it('degrades an entirely unrecognised link to empty pickers', () => {
    expect(matchupFromParams(new URLSearchParams('a=&b=nope'), teams)).toEqual({
      a: null,
      b: null,
    })
  })
})

describe('against the real game index', () => {
  const games = parseGamesIndex(
    JSON.parse(readFileSync('public/data/games-index.json', 'utf8')),
    'games-index.json',
  )

  it('finds a full division rivalry', () => {
    // Twice a season for six seasons, plus any postseason meeting.
    const between = meetings(games, 'KC', 'DEN')
    expect(between.length).toBeGreaterThanOrEqual(12)
    expect(between.every((g) => [g.home, g.away].includes('KC'))).toBe(true)
    expect(between.every((g) => [g.home, g.away].includes('DEN'))).toBe(true)
  })

  it('agrees with itself: the two series records are mirrors', () => {
    const between = meetings(games, 'SF', 'LA')
    const sf = seriesRecord(between, 'SF')
    const la = seriesRecord(between, 'LA')
    expect(sf.wins).toBe(la.losses)
    expect(sf.losses).toBe(la.wins)
    expect(sf.wins + sf.losses + sf.ties).toBe(between.length)
  })

  it('never returns a game that does not involve both teams', () => {
    for (const [a, b] of [
      ['KC', 'BUF'],
      ['NYG', 'DAL'],
      ['SEA', 'MIA'],
    ]) {
      for (const game of meetings(games, a!, b!)) {
        expect([game.home, game.away].sort()).toEqual([a, b].sort())
      }
    }
  })
})
