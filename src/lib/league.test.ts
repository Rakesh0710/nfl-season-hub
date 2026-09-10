import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIRECTION,
  DEFAULT_VIEW,
  describeView,
  divisionsByConference,
  filterTeams,
  recordLabel,
  sortTeams,
  viewFromParams,
  viewToParams,
  winPct,
  type LeagueView,
} from '@/lib/league'
import { makeLeague, makeTeamSummary } from '@/test/fixtures'

const view = (over: Partial<LeagueView> = {}): LeagueView => ({ ...DEFAULT_VIEW, ...over })
const ids = (teams: { id: string }[]) => teams.map((t) => t.id)

describe('winPct', () => {
  it('counts a tie as half a win', () => {
    expect(winPct({ wins: 8, losses: 8, ties: 1 })).toBeCloseTo(8.5 / 17)
  })

  it('does not divide by zero before a season starts', () => {
    expect(winPct({ wins: 0, losses: 0, ties: 0 })).toBe(0)
  })
})

describe('recordLabel', () => {
  it('omits the tie column when there are none', () => {
    expect(recordLabel({ wins: 11, losses: 6, ties: 0 })).toBe('11-6')
    expect(recordLabel({ wins: 8, losses: 8, ties: 1 })).toBe('8-8-1')
  })
})

describe('sortTeams', () => {
  const teams = makeLeague()

  it('puts the best projection first by default', () => {
    const sorted = sortTeams(teams, view())
    expect(ids(sorted)[0]).toBe('SF')
    expect(ids(sorted).at(-1)).toBe('NYG')
  })

  it('reverses on ascending', () => {
    const up = ids(sortTeams(teams, view({ direction: 'asc' })))
    expect(up[0]).toBe('NYG')
    expect(up.at(-1)).toBe('SF')
  })

  it('breaks a projection tie by name in both directions', () => {
    // KC and PHI are both on 10.4. The tiebreak is deliberately not flipped:
    // an alphabetical run reads the same way whichever way the sort is going,
    // and flipping it would shuffle equal teams for no reason a reader can see.
    for (const direction of ['desc', 'asc'] as const) {
      const sorted = ids(sortTeams(teams, view({ direction })))
      expect(sorted.indexOf('KC')).toBeLessThan(sorted.indexOf('PHI'))
    }
  })

  it('never mutates the array it is given', () => {
    const original = [...ids(teams)]
    sortTeams(teams, view({ sort: 'record' }))
    expect(ids(teams)).toEqual(original)
  })

  it('sorts by last-season win percentage, not raw wins', () => {
    const short = makeTeamSummary({
      id: 'AAA',
      name: 'A',
      lastSeason: { wins: 9, losses: 1, ties: 0 },
    })
    const long = makeTeamSummary({
      id: 'BBB',
      name: 'B',
      lastSeason: { wins: 10, losses: 7, ties: 0 },
    })
    expect(ids(sortTeams([long, short], view({ sort: 'record' })))).toEqual(['AAA', 'BBB'])
  })

  it('groups by division and keeps the strongest team first inside each', () => {
    const sorted = sortTeams(teams, view({ sort: 'division', direction: 'asc' }))
    expect(ids(sorted)).toEqual(['BUF', 'NYJ', 'KC', 'DEN', 'PHI', 'NYG', 'SF', 'ARI'])
  })

  it('keeps the strongest team first inside a division even when the groups run backwards', () => {
    const sorted = sortTeams(teams, view({ sort: 'division', direction: 'desc' }))
    const west = ids(sorted).filter((id) => ['SF', 'ARI'].includes(id))
    expect(west).toEqual(['SF', 'ARI'])
  })
})

describe('filterTeams', () => {
  const teams = makeLeague()

  it('returns everything by default', () => {
    expect(filterTeams(teams, view())).toHaveLength(8)
  })

  it('narrows to a conference', () => {
    expect(ids(filterTeams(teams, view({ conference: 'AFC' })))).toEqual([
      'KC',
      'DEN',
      'BUF',
      'NYJ',
    ])
  })

  it('narrows to a division', () => {
    expect(ids(filterTeams(teams, view({ division: 'NFC East' })))).toEqual(['PHI', 'NYG'])
  })

  it('returns nothing when the conference and division contradict', () => {
    expect(filterTeams(teams, view({ conference: 'AFC', division: 'NFC East' }))).toEqual([])
  })
})

describe('divisionsByConference', () => {
  it('groups and orders divisions, AFC before NFC', () => {
    const map = divisionsByConference(makeLeague())
    expect([...map.keys()]).toEqual(['AFC', 'NFC'])
    expect(map.get('AFC')).toEqual(['AFC East', 'AFC West'])
  })
})

describe('view <-> query string', () => {
  it('omits defaults, so a pristine dashboard has a clean URL', () => {
    expect(viewToParams(DEFAULT_VIEW).toString()).toBe('')
  })

  it('round-trips a view through the query string', () => {
    const original = view({
      sort: 'record',
      direction: 'asc',
      conference: 'NFC',
      division: 'NFC East',
    })
    const params = viewToParams(original)
    expect(viewFromParams(params, ['NFC East'])).toEqual(original)
  })

  it('omits a direction that is already natural for the sort', () => {
    const params = viewToParams(view({ sort: 'division', direction: DEFAULT_DIRECTION.division }))
    expect(params.get('dir')).toBeNull()
    expect(viewFromParams(params, []).direction).toBe('asc')
  })

  it('falls back to the default for values it does not recognise', () => {
    const params = new URLSearchParams('sort=elo&dir=sideways&conf=XFL&div=Pacific')
    expect(viewFromParams(params, ['AFC East'])).toEqual(DEFAULT_VIEW)
  })

  it('drops a division that does not exist in the data', () => {
    expect(viewFromParams(new URLSearchParams('div=AFC%20South'), ['AFC East']).division).toBe(
      'ALL',
    )
  })

  it('drops the division when it contradicts the conference, rather than showing an empty grid', () => {
    const params = new URLSearchParams('conf=AFC&div=NFC%20East')
    const resolved = viewFromParams(params, ['NFC East'])
    expect(resolved.conference).toBe('AFC')
    expect(resolved.division).toBe('ALL')
  })
})

describe('describeView', () => {
  it('says how many of how many, where, and in what order', () => {
    expect(describeView(view(), 8, 8)).toBe('All 8 teams in the league, most projected wins first.')
    expect(describeView(view({ conference: 'AFC' }), 4, 8)).toBe(
      '4 of 8 teams in the AFC, most projected wins first.',
    )
    expect(
      describeView(view({ sort: 'division', direction: 'asc', division: 'NFC East' }), 2, 8),
    ).toBe('2 of 8 teams in NFC East, grouped by division, A to Z.')
  })
})
