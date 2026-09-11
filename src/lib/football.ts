/**
 * Football-domain presentation helpers.
 *
 * Ordering, labelling and the handling of absent fields live here so every
 * section of the team page agrees, and so no component ever has to decide what
 * to render when the data simply does not have a value.
 */

import type { GamePlay, GameSummary, GameType, Player, TeamRecord } from '@/types/nfl'

/** Only what a label needs, so both GameSummary and Game satisfy it. */
type Scheduled = { week: number; gameType: GameType }

/** Rendered wherever a value genuinely is not in the dataset. */
export const NO_VALUE = '—'

/** Formats an optional value, never emitting "undefined", "null" or "NaN". */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NO_VALUE
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : NO_VALUE
  const trimmed = value.trim()
  return trimmed === '' ? NO_VALUE : trimmed
}

/** Rounds for display, or a dash when the number is missing or not finite. */
export function num(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : NO_VALUE
}

export function percent(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : NO_VALUE
}

/** Roster position groups, in the order a depth chart is normally read. */
const DOWN_NAMES = ['', '1st', '2nd', '3rd', '4th']

/**
 * "3rd & 7", or null when the play has no down.
 *
 * Kickoffs, extra points and the like carry no down, and the ETL omits the
 * field rather than inventing one — 2,276 key plays across the six seasons have
 * no down. Callers drop the line entirely rather than print a placeholder.
 */
export function downDistance(play: GamePlay): string | null {
  if (play.down === undefined) return null
  const name = DOWN_NAMES[play.down] ?? `${play.down}th`
  return play.distance === undefined ? name : `${name} & ${play.distance}`
}

export const ROSTER_POSITION_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'DB',
  'K',
  'P',
  'LS',
] as const

export const POSITION_GROUP_LABELS: Record<string, string> = {
  QB: 'Quarterbacks',
  RB: 'Running backs',
  WR: 'Wide receivers',
  TE: 'Tight ends',
  OL: 'Offensive line',
  DL: 'Defensive line',
  LB: 'Linebackers',
  DB: 'Defensive backs',
  K: 'Kickers',
  P: 'Punters',
  LS: 'Long snappers',
}

/** Depth-chart positions grouped into the three units, in on-field order. */
export const DEPTH_UNITS: { unit: string; positions: string[] }[] = [
  { unit: 'Offense', positions: ['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] },
  {
    unit: 'Defense',
    positions: [
      'LDE',
      'LDT',
      'NT',
      'RDT',
      'RDE',
      'SLB',
      'MLB',
      'WLB',
      'LILB',
      'RILB',
      'LCB',
      'RCB',
      'NB',
      'SS',
      'FS',
    ],
  },
  { unit: 'Special teams', positions: ['PK', 'P', 'H', 'LS', 'KR', 'PR'] },
]

/**
 * nflverse roster status codes. Codes without a confident expansion are shown
 * verbatim rather than guessed at — a wrong label is worse than a terse one.
 */
const STATUS_LABELS: Record<string, string> = {
  ACT: 'Active',
  INA: 'Inactive',
  DEV: 'Practice squad',
  RES: 'Reserve',
  CUT: 'Released',
  RET: 'Retired',
  TRD: 'Traded',
}

export function statusLabel(status: string | undefined): string {
  if (!status) return NO_VALUE
  return STATUS_LABELS[status] ?? status
}

/** Players on the active roster, the default view of a 100-name season list. */
export function isActive(player: Player): boolean {
  return player.status === 'ACT'
}

/**
 * Groups a roster by position group, preserving football order and appending
 * any position the dataset introduces that this file does not know about.
 */
export function groupByPosition(players: readonly Player[]): [string, Player[]][] {
  const groups = new Map<string, Player[]>()
  for (const player of players) {
    const key = player.position || 'Unlisted'
    const list = groups.get(key) ?? []
    list.push(player)
    groups.set(key, list)
  }
  const known = ROSTER_POSITION_ORDER.filter((p) => groups.has(p))
  const unknown = [...groups.keys()].filter(
    (p) => !ROSTER_POSITION_ORDER.some((known) => known === p),
  )
  return [...known, ...unknown.sort()].map((key) => [
    key,
    (groups.get(key) ?? []).sort(
      (a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name),
    ),
  ])
}

export type GameResult = 'W' | 'L' | 'T'

/** The team's perspective on one of its games. */
export interface TeamGame {
  game: GameSummary
  opponentId: string
  isHome: boolean
  teamScore: number
  opponentScore: number
  result: GameResult
}

export function toTeamGame(game: GameSummary, teamId: string): TeamGame {
  const isHome = game.home === teamId
  const teamScore = isHome ? game.homeScore : game.awayScore
  const opponentScore = isHome ? game.awayScore : game.homeScore
  return {
    game,
    opponentId: isHome ? game.away : game.home,
    isHome,
    teamScore,
    opponentScore,
    result: teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T',
  }
}

export function recordFromGames(games: readonly TeamGame[]): TeamRecord {
  return games.reduce<TeamRecord>(
    (acc, g) => ({
      wins: acc.wins + (g.result === 'W' ? 1 : 0),
      losses: acc.losses + (g.result === 'L' ? 1 : 0),
      ties: acc.ties + (g.result === 'T' ? 1 : 0),
    }),
    { wins: 0, losses: 0, ties: 0 },
  )
}

/** Postseason rounds get a name; regular-season games get their week number. */
export function weekLabel(game: Scheduled): string {
  switch (game.gameType) {
    case 'WC':
      return 'Wild Card'
    case 'DIV':
      return 'Divisional'
    case 'CON':
      return 'Conf. Final'
    case 'SB':
      return 'Super Bowl'
    default:
      return `Week ${game.week}`
  }
}

/** "Sep 8" — short, stable, and never "Invalid Date". */
export function shortDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return NO_VALUE
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * "Los Angeles Chargers" -> "Chargers".
 *
 * Every NFL club name ends in a single-word nickname, and the nicknames are
 * unique, so the last token identifies a team unambiguously where the full
 * name will not fit. Truncating instead collapsed both Los Angeles clubs and
 * both New York clubs into the same string.
 */
export function teamNickname(name: string): string {
  const parts = name.trim().split(/\s+/)
  const nickname = parts.length > 1 ? parts.at(-1) : undefined
  return nickname ?? name
}

/** "Week 12" -> "Wk 12"; postseason rounds keep a short name. */
export function shortWeekLabel(game: Scheduled): string {
  switch (game.gameType) {
    case 'WC':
      return 'WC'
    case 'DIV':
      return 'Div'
    case 'CON':
      return 'Conf'
    case 'SB':
      return 'SB'
    default:
      return `Wk ${game.week}`
  }
}

/**
 * The seasons a list of games covers, newest first.
 *
 * Newest first because that is the order a season picker is read in: this
 * year, then last year, then history.
 */
export function seasonsIn(games: readonly GameSummary[]): number[] {
  return [...new Set(games.map((game) => game.season))].sort((a, b) => b - a)
}

/**
 * The season to open a team page on.
 *
 * The one whose figures the rest of the page describes, when that team played
 * in it; otherwise the most recent season it did play. A team page that opened
 * on an empty list because the dataset had moved on would be a worse default
 * than any of them.
 */
export function defaultSeason(games: readonly GameSummary[], preferred?: number): number | null {
  const seasons = seasonsIn(games)
  if (seasons.length === 0) return null
  if (preferred !== undefined && seasons.includes(preferred)) return preferred
  return seasons[0] ?? null
}
