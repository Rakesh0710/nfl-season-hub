import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIRECTION,
  DEFAULT_VIEW,
  describeView,
  divisionsByConference,
  filterTeams,
  recordLabel,
  sortTeams,
  teamsInSeason,
  viewFromParams,
  viewToParams,
  winPct,
  type LeagueView,
} from '@/lib/league'
import { makeLeague, makeStandings, makeTeamSeasonView } from '@/test/fixtures'

/**
 * The dashboard's own view of a season: identity joined to that year's record.
 *
 * The same eight teams and the same numbers the fixtures have always carried,
 * now arriving the way the page assembles them.
 */
const leagueViews = (season = 2025) => teamsInSeason(makeLeague(), makeStandings(season), season)

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

describe('teamsInSeason', () => {
  const teams = makeLeague()

  it('joins who a team is to how that year went', () => {
    const [kc] = teamsInSeason(teams, makeStandings(2021), 2021).filter((t) => t.id === 'KC')
    expect(kc).toMatchObject({
      id: 'KC',
      name: 'Kansas City Chiefs',
      division: 'AFC West',
      season: 2021,
      record: { wins: 11, losses: 6, ties: 0 },
      expectedWins: 10.4,
    })
  })

  it('reads only the season asked for, out of a file holding all of them', () => {
    const every = [2020, 2021, 2022].flatMap((season) => makeStandings(season))
    const views = teamsInSeason(teams, every, 2022)
    expect(views).toHaveLength(teams.length)
    expect(views.every((v) => v.season === 2022)).toBe(true)
  })

  it('drops a team with no row that season rather than showing it winless', () => {
    // A relocation or an expansion side. 0-0 is a claim about a season it did
    // not play, which is worse than an absence.
    const partial = makeStandings(2020).filter((row) => row.team !== 'NYJ')
    expect(teamsInSeason(teams, partial, 2020).map((t) => t.id)).not.toContain('NYJ')
  })

  it('returns nothing for a season the standings do not cover', () => {
    expect(teamsInSeason(teams, makeStandings(2025), 1999)).toEqual([])
  })
})

describe('sortTeams', () => {
  const teams = leagueViews()

  it('puts the most expected wins first by default', () => {
    const sorted = sortTeams(teams, view())
    expect(ids(sorted)[0]).toBe('SF')
    expect(ids(sorted).at(-1)).toBe('NYG')
  })

  it('reverses on ascending', () => {
    const up = ids(sortTeams(teams, view({ direction: 'asc' })))
    expect(up[0]).toBe('NYG')
    expect(up.at(-1)).toBe('SF')
  })

  it('breaks a tie on expected wins by name in both directions', () => {
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

  it('sorts by win percentage, not raw wins', () => {
    const short = makeTeamSeasonView({
      id: 'AAA',
      name: 'A',
      record: { wins: 9, losses: 1, ties: 0 },
    })
    const long = makeTeamSeasonView({
      id: 'BBB',
      name: 'B',
      record: { wins: 10, losses: 7, ties: 0 },
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
  const teams = leagueViews()

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

describe('the season in the URL', () => {
  it('keeps a season the dataset has a layer for', () => {
    const parsed = viewFromParams(new URLSearchParams('season=2021'), [], [2020, 2021, 2022])
    expect(parsed.season).toBe(2021)
  })

  it('falls back to the default for a season nothing was generated for', () => {
    for (const query of ['season=1999', 'season=2026', 'season=banana', 'season=']) {
      expect(viewFromParams(new URLSearchParams(query), [], [2020, 2021]).season).toBeNull()
    }
  })

  it('omits the displayed season from the URL, and writes any other', () => {
    expect(viewToParams(view()).has('season')).toBe(false)
    expect(viewToParams(view({ season: 2021 })).get('season')).toBe('2021')
  })

  it('survives a round trip alongside the filters', () => {
    const chosen = view({ season: 2022, conference: 'AFC', sort: 'record', direction: 'asc' })
    const params = viewToParams(chosen)
    expect(viewFromParams(params, ['AFC West'], [2022])).toEqual(chosen)
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
    expect(describeView(view(), 8, 8)).toBe('All 8 teams in the league, most expected wins first.')
    expect(describeView(view({ conference: 'AFC' }), 4, 8)).toBe(
      '4 of 8 teams in the AFC, most expected wins first.',
    )
    expect(
      describeView(view({ sort: 'division', direction: 'asc', division: 'NFC East' }), 2, 8),
    ).toBe('2 of 8 teams in NFC East, grouped by division, A to Z.')
  })

  it('names a chosen season, because it changes every number on the page', () => {
    expect(describeView(view({ season: 2021 }), 8, 8, 2021)).toBe(
      'All 8 teams in the league, in 2021, most expected wins first.',
    )
  })

  it('stays quiet about the season nobody chose', () => {
    // The default view is the displayed season. Announcing it on every filter
    // change would make the live region chatter about something that did not
    // move.
    expect(describeView(view(), 8, 8, 2025)).not.toContain('2025')
  })
})
