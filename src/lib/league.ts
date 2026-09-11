/**
 * Sorting and filtering for the league dashboard.
 *
 * Kept out of the component so the rules are readable in one place and every
 * comparator is total — each ends in a name tiebreak, so the order is fully
 * determined rather than relying on the input order.
 */

import type { Conference, SeasonRecord, TeamRecord, TeamSeasonView, TeamSummary } from '@/types/nfl'

export type SortKey = 'projected' | 'record' | 'division'
export type SortDirection = 'desc' | 'asc'

export interface LeagueView {
  sort: SortKey
  direction: SortDirection
  conference: Conference | 'ALL'
  division: string | 'ALL'
  /** null means the season the dataset displays; anything else is a choice. */
  season: number | null
}

export const DEFAULT_VIEW: LeagueView = {
  sort: 'projected',
  direction: 'desc',
  conference: 'ALL',
  division: 'ALL',
  season: null,
}

/** The seasons the standings cover, newest first. */
export function seasonsIn(standings: readonly SeasonRecord[]): number[] {
  return [...new Set(standings.map((row) => row.season))].sort((a, b) => b - a)
}

/**
 * The 32 teams as they were in one season: who they are, joined to how that
 * year went.
 *
 * Identity comes from `teams-index.json` and the year from `standings.json`,
 * because a team's colours and division are what they are now while its record
 * belongs to a season. A team with no row for that season is dropped rather
 * than shown at 0-0 — that is a relocation or an expansion, not a winless
 * year.
 */
export function teamsInSeason(
  teams: readonly TeamSummary[],
  standings: readonly SeasonRecord[],
  season: number,
): TeamSeasonView[] {
  const rows = new Map(
    standings.filter((row) => row.season === season).map((row) => [row.team, row]),
  )
  const views: TeamSeasonView[] = []
  for (const team of teams) {
    const row = rows.get(team.id)
    if (!row) continue
    views.push({
      id: team.id,
      name: team.name,
      conference: team.conference,
      division: team.division,
      logo: team.logo,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      season,
      record: { wins: row.wins, losses: row.losses, ties: row.ties },
      expectedWins: row.expectedWins,
    })
  }
  return views
}

/**
 * The direction that reads as "natural" for each sort. Numbers want their
 * biggest value first; names want A to Z. Defaulting every key to `desc` made
 * a click on Division open at NFC West, which is not what anyone means.
 */
export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  projected: 'desc',
  record: 'desc',
  division: 'asc',
}

export const SORT_LABELS: Record<SortKey, string> = {
  projected: 'Expected wins',
  record: 'Record',
  division: 'Division',
}

/** Ties count as half a win, the NFL's own convention. */
export function winPct(record: TeamRecord): number {
  const games = record.wins + record.losses + record.ties
  return games === 0 ? 0 : (record.wins + record.ties * 0.5) / games
}

export function recordLabel(record: TeamRecord): string {
  return record.ties > 0
    ? `${record.wins}-${record.losses}-${record.ties}`
    : `${record.wins}-${record.losses}`
}

/** Divisions present in the data, grouped by conference and ordered. */
export function divisionsByConference(teams: readonly TeamSummary[]): Map<Conference, string[]> {
  const map = new Map<Conference, Set<string>>()
  for (const team of teams) {
    const set = map.get(team.conference) ?? new Set<string>()
    set.add(team.division)
    map.set(team.conference, set)
  }
  return new Map(
    [...map]
      .map(([conf, set]) => [conf, [...set].sort()] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )
}

export function filterTeams(teams: readonly TeamSeasonView[], view: LeagueView): TeamSeasonView[] {
  return teams.filter(
    (team) =>
      (view.conference === 'ALL' || team.conference === view.conference) &&
      (view.division === 'ALL' || team.division === view.division),
  )
}

/**
 * Returns a new sorted array; the input is never mutated, so the fetched and
 * cached team list stays in its original order.
 */
export function sortTeams(teams: readonly TeamSeasonView[], view: LeagueView): TeamSeasonView[] {
  const flip = view.direction === 'desc' ? -1 : 1
  const byName = (a: TeamSeasonView, b: TeamSeasonView) => a.name.localeCompare(b.name)

  return [...teams].sort((a, b) => {
    switch (view.sort) {
      case 'projected': {
        const delta = a.expectedWins - b.expectedWins
        return delta !== 0 ? delta * flip : byName(a, b)
      }
      case 'record': {
        const pct = winPct(a.record) - winPct(b.record)
        if (pct !== 0) return pct * flip
        const wins = a.record.wins - b.record.wins
        return wins !== 0 ? wins * flip : byName(a, b)
      }
      case 'division': {
        const group = `${a.conference} ${a.division}`.localeCompare(`${b.conference} ${b.division}`)
        if (group !== 0) return group * flip
        // Within a division, always strongest first — that is the useful order
        // regardless of which way the division names are running.
        const pct = winPct(b.record) - winPct(a.record)
        return pct !== 0 ? pct : byName(a, b)
      }
    }
  })
}

/**
 * A sentence describing the active view, for the live region and the header.
 *
 * The season is named whenever it is not the one the site displays. Switching
 * season rewrites every number on the page, so the live region has to say so;
 * naming it on the default view too would make it chatter on every filter.
 */
export function describeView(
  view: LeagueView,
  shown: number,
  total: number,
  season?: number,
): string {
  const scope =
    view.division !== 'ALL'
      ? view.division
      : view.conference !== 'ALL'
        ? `the ${view.conference}`
        : 'the league'

  const order =
    view.sort === 'division'
      ? view.direction === 'desc'
        ? 'grouped by division, Z to A'
        : 'grouped by division, A to Z'
      : view.sort === 'projected'
        ? view.direction === 'desc'
          ? 'most expected wins first'
          : 'fewest expected wins first'
        : view.direction === 'desc'
          ? 'best record first'
          : 'worst record first'

  const count = shown === total ? `All ${total} teams` : `${shown} of ${total} teams`
  const when = view.season !== null && season !== undefined ? ` in ${season},` : ''
  return `${count} in ${scope},${when} ${order}.`
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

const SORT_KEYS: readonly SortKey[] = ['projected', 'record', 'division']

function isSortKey(value: string | null): value is SortKey {
  // `some` rather than `includes`, which would want its argument already
  // narrowed to a SortKey and so would need the array widened by assertion.
  return value !== null && SORT_KEYS.some((key) => key === value)
}

/**
 * Reads a view out of the query string, falling back to the default for any
 * value that is missing or not recognised. A hand-edited or stale URL degrades
 * to a sensible dashboard instead of an empty or broken one.
 */
export function viewFromParams(
  params: URLSearchParams,
  validDivisions: readonly string[],
  validSeasons: readonly number[] = [],
): LeagueView {
  const sort = params.get('sort')
  const direction = params.get('dir')
  const conference = params.get('conf')
  const division = params.get('div')
  const season = Number(params.get('season'))

  const resolvedSort = isSortKey(sort) ? sort : DEFAULT_VIEW.sort
  const resolved: LeagueView = {
    sort: resolvedSort,
    direction:
      direction === 'asc' || direction === 'desc' ? direction : DEFAULT_DIRECTION[resolvedSort],
    conference: conference === 'AFC' || conference === 'NFC' ? conference : 'ALL',
    division: division && validDivisions.includes(division) ? division : 'ALL',
    // A season nothing was generated for falls back to the displayed one
    // rather than emptying the grid.
    season: validSeasons.includes(season) ? season : null,
  }

  // A division that contradicts the conference would render an empty grid, so
  // the division loses — it is the narrower, more accidental choice.
  if (
    resolved.division !== 'ALL' &&
    resolved.conference !== 'ALL' &&
    !resolved.division.startsWith(resolved.conference)
  ) {
    resolved.division = 'ALL'
  }
  return resolved
}

/** Serialises a view, omitting anything that is already the default. */
export function viewToParams(view: LeagueView): URLSearchParams {
  const params = new URLSearchParams()
  if (view.sort !== DEFAULT_VIEW.sort) params.set('sort', view.sort)
  if (view.direction !== DEFAULT_DIRECTION[view.sort]) params.set('dir', view.direction)
  if (view.conference !== 'ALL') params.set('conf', view.conference)
  if (view.division !== 'ALL') params.set('div', view.division)
  if (view.season !== null) params.set('season', String(view.season))
  return params
}
