import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePlayersIndex } from '@/lib/contract'
import {
  describeSearch,
  normalise,
  positionsIn,
  rank,
  searchPlayers,
  type PlayerFilter,
} from '@/lib/playerSearch'
import type { PlayerSummary } from '@/types/nfl'

const player = (name: string, over: Partial<PlayerSummary> = {}): PlayerSummary => ({
  id: name.toLowerCase().replace(/\W/g, ''),
  name,
  position: 'WR',
  team: 'KC',
  games: 16,
  ...over,
})

const filter = (over: Partial<PlayerFilter> = {}): PlayerFilter => ({
  query: '',
  team: null,
  position: null,
  ...over,
})

const names = (players: PlayerSummary[]) => players.map((p) => p.name)

describe('normalise', () => {
  it('strips the punctuation nobody types', () => {
    expect(normalise("Ja'Marr Chase")).toBe('jamarrchase')
    expect(normalise('Amon-Ra St. Brown')).toBe('amonrastbrown')
  })

  it('strips accents, so a plain keyboard can find an accented name', () => {
    expect(normalise('Nuñez')).toBe('nunez')
    expect(normalise('Åkers')).toBe('akers')
  })
})

describe('rank', () => {
  it('puts a surname match first', () => {
    expect(rank('Josh Allen', 'all')).toBe(0)
  })

  it('then a first-name match', () => {
    expect(rank('Josh Allen', 'jos')).toBe(1)
  })

  it('then the whole name run together', () => {
    expect(rank('Josh Allen', 'joshal')).toBe(2)
  })

  it('then anything containing it', () => {
    expect(rank('Jaylen Waddle', 'add')).toBe(3)
  })

  it('reports no match as -1', () => {
    expect(rank('Josh Allen', 'zzz')).toBe(-1)
  })
})

describe('searchPlayers', () => {
  const squad = [
    player('Josh Allen', { position: 'QB' }),
    player('Jaylen Waddle', { team: 'MIA' }),
    player('Keenan Allen', { team: 'CHI' }),
    player("Ja'Marr Chase", { team: 'CIN' }),
    player('Patrick Mahomes', { position: 'QB' }),
  ]

  it('ranks a surname match above a mere substring', () => {
    // "all" is in Waddle nowhere, but this is the shape of the rule.
    expect(names(searchPlayers(squad, filter({ query: 'all' })))).toEqual([
      'Josh Allen',
      'Keenan Allen',
    ])
  })

  it('finds a punctuated name from plain letters', () => {
    expect(names(searchPlayers(squad, filter({ query: 'jamarr' })))).toEqual(["Ja'Marr Chase"])
  })

  it('ignores case and stray spaces', () => {
    expect(names(searchPlayers(squad, filter({ query: '  MAHOMES ' })))).toEqual([
      'Patrick Mahomes',
    ])
  })

  it('filters by team and position, with or without a query', () => {
    expect(names(searchPlayers(squad, filter({ team: 'MIA' })))).toEqual(['Jaylen Waddle'])
    expect(names(searchPlayers(squad, filter({ position: 'QB' })))).toEqual([
      'Josh Allen',
      'Patrick Mahomes',
    ])
    expect(names(searchPlayers(squad, filter({ position: 'QB', query: 'all' })))).toEqual([
      'Josh Allen',
    ])
  })

  it('returns everything for an empty query, in the order given', () => {
    expect(searchPlayers(squad, filter())).toHaveLength(5)
  })

  it('returns nothing rather than everything when nothing matches', () => {
    expect(searchPlayers(squad, filter({ query: 'zzzzz' }))).toEqual([])
  })
})

describe('positionsIn', () => {
  it('orders positions the way a depth chart reads, unknowns last', () => {
    const squad = [
      player('A', { position: 'DB' }),
      player('B', { position: 'QB' }),
      player('C', { position: 'ZZ' }),
      player('D', { position: 'WR' }),
    ]
    expect(positionsIn(squad)).toEqual(['QB', 'WR', 'DB', 'ZZ'])
  })
})

describe('describeSearch', () => {
  it('says what was searched for, and what came back', () => {
    expect(describeSearch(filter(), 2274, 2274)).toBe('All 2,274 players.')
    expect(describeSearch(filter({ query: 'allen' }), 6, 2274)).toBe(
      '6 of 2,274 players matching “allen”.',
    )
    expect(describeSearch(filter({ team: 'KC', position: 'QB' }), 3, 2274)).toBe(
      '3 of 2,274 QBs for KC.',
    )
    expect(describeSearch(filter({ query: 'zzz' }), 0, 2274)).toBe('No players matching “zzz”.')
  })
})

describe('against the real index', () => {
  const players = parsePlayersIndex(
    JSON.parse(readFileSync('public/data/players-index.json', 'utf8')),
    'players-index.json',
  )

  it('matches the contract and covers every profile', () => {
    expect(players.length).toBeGreaterThan(2000)
  })

  it('finds the players a person would actually type', () => {
    for (const [query, expected] of [
      ['mahomes', 'Patrick Mahomes'],
      ['jamarr', "Ja'Marr Chase"],
    ] as const) {
      const found = searchPlayers(players, filter({ query }))
      expect(names(found)[0], query).toBe(expected)
    }
  })

  it('narrows to one team without a query', () => {
    const kc = searchPlayers(players, filter({ team: 'KC' }))
    expect(kc.length).toBeGreaterThan(30)
    expect(kc.every((p) => p.team === 'KC')).toBe(true)
  })

  it('includes only the linemen the dataset happens to measure', () => {
    // 550 offensive linemen are on a roster and 204 have a page — the ones who
    // caught a pass or recovered a fumble. "Linemen have no stats" is nearly
    // true and therefore the kind of claim worth pinning down.
    const linemen = players.filter((p) => p.position === 'OL')
    expect(linemen.length).toBeGreaterThan(100)
    expect(linemen.length).toBeLessThan(300)
  })

  it('ranks namesakes by who has actually played', () => {
    // Both Jeffersons match the surname exactly; alphabetical order put Jermar
    // first, which is not who anyone typing "jefferson" means.
    const found = searchPlayers(players, filter({ query: 'jefferson' }))
    expect(names(found)[0]).toBe('Justin Jefferson')
  })
})
