/**
 * Reading `meta.json` in words.
 *
 * Two questions the site has to answer honestly once the data is refreshed on
 * a schedule rather than built once: how old is this, and is the season it
 * describes actually finished?
 *
 * The second matters more. A team page shows points per game, success rate and
 * a market-implied win projection; every one of those is a season-shaped
 * figure, and every one is meaningless four games in. Rather than qualify each
 * number, the pipeline keeps the team layer on the last complete season until
 * a new one is far enough along, and these helpers say so out loud.
 */

import type { Meta, SeasonState } from '@/types/nfl'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "3 hours ago". Coarse on purpose: the data changes at most daily, so a
 * live-looking "42 seconds ago" would imply a freshness the pipeline does not
 * have.
 */
export function refreshedAgo(generatedAt: string, now: Date = new Date()): string {
  const then = new Date(generatedAt).getTime()
  if (!Number.isFinite(then)) return 'at an unknown time'

  const elapsed = now.getTime() - then
  // A clock skewed the wrong way should not produce "in 3 hours".
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')
  return plural(Math.floor(elapsed / DAY), 'day')
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`
}

/** The state of one season, or undefined if the dataset has never heard of it. */
export function stateOf(meta: Meta, season: number): SeasonState | undefined {
  return meta.seasons.find((s) => s.season === season)
}

/** The season the team layer describes. */
export function displayState(meta: Meta): SeasonState | undefined {
  return stateOf(meta, meta.displaySeason)
}

/**
 * A newer season that exists but is not what the figures on screen describe.
 *
 * Returned only when there is a real distinction to explain: a season newer
 * than the displayed one, which has actually started.
 */
export function seasonInProgress(meta: Meta): SeasonState | undefined {
  const newer = stateOf(meta, meta.latestSeason)
  if (!newer || newer.season <= meta.displaySeason || newer.played === 0) return undefined
  return newer
}

/**
 * One sentence naming what the figures cover, and — when they differ — what
 * the newest season is doing instead.
 */
export function describeCoverage(meta: Meta): string {
  const shown = displayState(meta)
  const running = seasonInProgress(meta)

  const base = !shown
    ? `Figures describe the ${meta.displaySeason} season.`
    : shown.complete
      ? `Figures describe the complete ${shown.season} season.`
      : `Figures describe ${shown.season} so far — ${shown.played} of ${shown.scheduled} games played, so they are a partial season and not comparable with a finished one.`

  if (!running) return base
  return `${base} The ${running.season} season is under way, ${running.played} of ${running.scheduled} games played; it takes over here once enough of it has been played to describe.`
}

/**
 * Whether there is a distinction worth explaining on screen.
 *
 * True when the displayed season is unfinished, or when a newer one has
 * started and is not what these figures describe. When the site is showing a
 * complete season and nothing newer has kicked off, there is nothing to say
 * and a permanent banner would just be noise.
 */
export function needsCoverageNotice(meta: Meta): boolean {
  return displayState(meta)?.complete !== true || seasonInProgress(meta) !== undefined
}

/** "2020-2026", from the seasons the dataset actually has. */
export function seasonRange(meta: Meta): string {
  const years = meta.seasons.map((s) => s.season)
  if (years.length === 0) return ''
  const first = Math.min(...years)
  const last = Math.max(...years)
  return first === last ? `${first}` : `${first}\u2013${last}`
}

/**
 * The seasons a team page may offer, newest first.
 *
 * `meta.teamSeasons` ascends, because that is the order the ETL writes it in
 * and the order the validator checks; a control reads newest first.
 */
export function teamSeasonsOf(meta: Meta): number[] {
  return [...meta.teamSeasons].sort((a, b) => b - a)
}

/**
 * Which season a `?season=` parameter actually means.
 *
 * One function rather than two, because the team page resolves this twice —
 * once to render the control and once inside the fetch that answers it — and
 * two copies of the rule are two chances for the pressed tab to disagree with
 * the file on screen.
 *
 * Anything the dataset has no team layer for falls back to the displayed
 * season: a hand-edited URL, a bookmark from before a refresh, or a season
 * still too young to describe.
 */
export function resolveSeason(meta: Meta, asked: string | null): number {
  const wanted = Number(asked)
  return meta.teamSeasons.includes(wanted) ? wanted : meta.displaySeason
}
