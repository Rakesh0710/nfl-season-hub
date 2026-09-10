/**
 * Sorting and filtering for the league dashboard.
 *
 * Kept out of the component so the rules are readable in one place and every
 * comparator is total — each ends in a name tiebreak, so the order is fully
 * determined rather than relying on the input order.
 */

import type { Conference, TeamRecord, TeamSummary } from '@/types/nfl'

export type SortKey = 'projected' | 'record' | 'division'
export type SortDirection = 'desc' | 'asc'

export interface LeagueView {
  sort: SortKey
  direction: SortDirection
  conference: Conference | 'ALL'
  division: string | 'ALL'
}

export const DEFAULT_VIEW: LeagueView = {
  sort: 'projected',
  direction: 'desc',
  conference: 'ALL',
  division: 'ALL',
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
  projected: 'Projected wins',
  record: 'Last-season record',
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

export function filterTeams(teams: readonly TeamSummary[], view: LeagueView): TeamSummary[] {
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
export function sortTeams(teams: readonly TeamSummary[], view: LeagueView): TeamSummary[] {
  const flip = view.direction === 'desc' ? -1 : 1
  const byName = (a: TeamSummary, b: TeamSummary) => a.name.localeCompare(b.name)

  return [...teams].sort((a, b) => {
    switch (view.sort) {
      case 'projected': {
        const delta = a.projectedWins - b.projectedWins
        return delta !== 0 ? delta * flip : byName(a, b)
      }
      case 'record': {
        const pct = winPct(a.lastSeason) - winPct(b.lastSeason)
        if (pct !== 0) return pct * flip
        const wins = a.lastSeason.wins - b.lastSeason.wins
        return wins !== 0 ? wins * flip : byName(a, b)
      }
      case 'division': {
        const group = `${a.conference} ${a.division}`.localeCompare(`${b.conference} ${b.division}`)
        if (group !== 0) return group * flip
        // Within a division, always strongest first — that is the useful order
        // regardless of which way the division names are running.
        const pct = winPct(b.lastSeason) - winPct(a.lastSeason)
        return pct !== 0 ? pct : byName(a, b)
      }
    }
  })
}

/** A sentence describing the active view, for the live region and the header. */
export function describeView(view: LeagueView, shown: number, total: number): string {
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
          ? 'most projected wins first'
          : 'fewest projected wins first'
        : view.direction === 'desc'
          ? 'best last-season record first'
          : 'worst last-season record first'

  const count = shown === total ? `All ${total} teams` : `${shown} of ${total} teams`
  return `${count} in ${scope}, ${order}.`
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
): LeagueView {
  const sort = params.get('sort')
  const direction = params.get('dir')
  const conference = params.get('conf')
  const division = params.get('div')

  const resolvedSort = isSortKey(sort) ? sort : DEFAULT_VIEW.sort
  const resolved: LeagueView = {
    sort: resolvedSort,
    direction:
      direction === 'asc' || direction === 'desc' ? direction : DEFAULT_DIRECTION[resolvedSort],
    conference: conference === 'AFC' || conference === 'NFC' ? conference : 'ALL',
    division: division && validDivisions.includes(division) ? division : 'ALL',
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
  return params
}
