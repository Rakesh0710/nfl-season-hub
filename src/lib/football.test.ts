import { describe, expect, it } from 'vitest'
import {
  downDistance,
  groupByPosition,
  isActive,
  NO_VALUE,
  num,
  orDash,
  percent,
  recordFromGames,
  shortDate,
  shortWeekLabel,
  statusLabel,
  teamNickname,
  toTeamGame,
  weekLabel,
} from '@/lib/football'
import { makeGameSummary, makePlay, makePlayer } from '@/test/fixtures'

describe('orDash', () => {
  it('renders a real value', () => {
    expect(orDash('Texas Tech')).toBe('Texas Tech')
    expect(orDash(0)).toBe('0')
  })

  it('never prints undefined, null, NaN or an empty string', () => {
    for (const value of [undefined, null, Number.NaN, Infinity, '', '   ']) {
      expect(orDash(value)).toBe(NO_VALUE)
    }
  })
})

describe('num and percent', () => {
  it('round to the requested precision', () => {
    expect(num(24.14)).toBe('24.1')
    expect(num(0.0812, 3)).toBe('0.081')
    expect(percent(0.4712)).toBe('47.1%')
  })

  it('dash out a missing value instead of rendering NaN', () => {
    expect(num(undefined)).toBe(NO_VALUE)
    expect(percent(Number.NaN)).toBe(NO_VALUE)
  })
})

describe('downDistance', () => {
  it('names the down and the distance', () => {
    expect(downDistance(makePlay({ down: 3, distance: 7 }))).toBe('3rd & 7')
    expect(downDistance(makePlay({ down: 1, distance: 10 }))).toBe('1st & 10')
    expect(downDistance(makePlay({ down: 4, distance: 1 }))).toBe('4th & 1')
  })

  it('returns null for a play with no down, so the caller can drop the line', () => {
    expect(downDistance(makePlay({ down: undefined }))).toBeNull()
  })

  it('gives the down alone when the distance is missing', () => {
    expect(downDistance(makePlay({ down: 2, distance: undefined }))).toBe('2nd')
  })
})

describe('statusLabel', () => {
  it('expands the codes it knows', () => {
    expect(statusLabel('ACT')).toBe('Active')
    expect(statusLabel('DEV')).toBe('Practice squad')
  })

  it('shows an unknown code verbatim rather than guessing', () => {
    expect(statusLabel('XYZ')).toBe('XYZ')
    expect(statusLabel(undefined)).toBe(NO_VALUE)
  })
})

describe('groupByPosition', () => {
  it('orders known groups the way a depth chart is read', () => {
    const players = [
      makePlayer({ id: '1', name: 'A Kicker', position: 'K', number: 7 }),
      makePlayer({ id: '2', name: 'A Back', position: 'RB', number: 21 }),
      makePlayer({ id: '3', name: 'A Passer', position: 'QB', number: 15 }),
    ]
    expect(groupByPosition(players).map(([group]) => group)).toEqual(['QB', 'RB', 'K'])
  })

  it('appends positions the file has never heard of, sorted, rather than dropping them', () => {
    const players = [
      makePlayer({ id: '1', position: 'QB' }),
      makePlayer({ id: '2', position: 'ZZ' }),
      makePlayer({ id: '3', position: 'FB' }),
    ]
    expect(groupByPosition(players).map(([group]) => group)).toEqual(['QB', 'FB', 'ZZ'])
  })

  it('sorts within a group by jersey number, with unnumbered players last', () => {
    const players = [
      makePlayer({ id: '1', name: 'High', position: 'WR', number: 88 }),
      makePlayer({ id: '2', name: 'None', position: 'WR', number: undefined }),
      makePlayer({ id: '3', name: 'Low', position: 'WR', number: 11 }),
    ]
    const [group] = groupByPosition(players)
    expect(group?.[1].map((p) => p.name)).toEqual(['Low', 'High', 'None'])
  })

  it('files a player with no position under Unlisted', () => {
    expect(groupByPosition([makePlayer({ position: '' })])[0]?.[0]).toBe('Unlisted')
  })
})

describe('isActive', () => {
  it('is exactly the ACT status', () => {
    expect(isActive(makePlayer({ status: 'ACT' }))).toBe(true)
    expect(isActive(makePlayer({ status: 'RES' }))).toBe(false)
    expect(isActive(makePlayer({ status: undefined }))).toBe(false)
  })
})

describe('toTeamGame', () => {
  it('reads a home game from the team perspective', () => {
    const game = toTeamGame(
      makeGameSummary({ home: 'KC', away: 'CIN', homeScore: 26, awayScore: 25 }),
      'KC',
    )
    expect(game).toMatchObject({ isHome: true, opponentId: 'CIN', teamScore: 26, result: 'W' })
  })

  it('flips the scores for an away game', () => {
    const game = toTeamGame(
      makeGameSummary({ home: 'BAL', away: 'KC', homeScore: 20, awayScore: 27 }),
      'KC',
    )
    expect(game).toMatchObject({ isHome: false, opponentId: 'BAL', teamScore: 27, result: 'W' })
  })

  it('reports a tie', () => {
    const game = toTeamGame(makeGameSummary({ homeScore: 17, awayScore: 17 }), 'ATL')
    expect(game.result).toBe('T')
  })
})

describe('recordFromGames', () => {
  it('counts wins, losses and ties', () => {
    const games = [
      { homeScore: 27, awayScore: 20 },
      { homeScore: 10, awayScore: 24 },
      { homeScore: 17, awayScore: 17 },
    ].map((scores) => toTeamGame(makeGameSummary({ home: 'KC', away: 'X', ...scores }), 'KC'))
    expect(recordFromGames(games)).toEqual({ wins: 1, losses: 1, ties: 1 })
  })

  it('is zero for a team with no games', () => {
    expect(recordFromGames([])).toEqual({ wins: 0, losses: 0, ties: 0 })
  })
})

describe('weekLabel', () => {
  it('numbers regular-season weeks and names postseason rounds', () => {
    expect(weekLabel({ week: 12, gameType: 'REG' })).toBe('Week 12')
    expect(weekLabel({ week: 19, gameType: 'WC' })).toBe('Wild Card')
    expect(weekLabel({ week: 22, gameType: 'SB' })).toBe('Super Bowl')
    expect(shortWeekLabel({ week: 12, gameType: 'REG' })).toBe('Wk 12')
    expect(shortWeekLabel({ week: 21, gameType: 'CON' })).toBe('Conf')
  })
})

describe('shortDate', () => {
  it('formats a date without shifting it across a time zone', () => {
    expect(shortDate('2023-11-26')).toBe('Nov 26')
    expect(shortDate('2024-01-01')).toBe('Jan 1')
  })

  it('never renders "Invalid Date"', () => {
    expect(shortDate('not-a-date')).toBe(NO_VALUE)
  })
})

describe('teamNickname', () => {
  it('keeps the two Los Angeles and two New York clubs distinct', () => {
    expect(teamNickname('Los Angeles Chargers')).toBe('Chargers')
    expect(teamNickname('Los Angeles Rams')).toBe('Rams')
    expect(teamNickname('New York Jets')).toBe('Jets')
    expect(teamNickname('New York Giants')).toBe('Giants')
  })

  it('leaves a single-word name alone', () => {
    expect(teamNickname('Commanders')).toBe('Commanders')
  })
})
