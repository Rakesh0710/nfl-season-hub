/**
 * Finding a player by typing part of their name.
 *
 * Pure, so the ranking can be argued with in a test rather than by squinting
 * at a list. Two things matter and neither is obvious:
 *
 * Normalisation. NFL rosters are full of names a keyboard does not reach
 * directly — Ja'Marr, Amon-Ra, Nuñez — and someone searching for them types
 * "jamarr", "amonra", "nunez". Stripping accents and punctuation before
 * comparing is the difference between the search working and the search being
 * a party trick that only finds Smith.
 *
 * Ranking. Substring matching alone puts "Jaylen Waddle" above "Josh Allen"
 * for the query "all", which is wrong: a surname beginning with what you typed
 * is almost always what you meant.
 */

import type { PlayerSummary } from '@/types/nfl'

/** Lower-case, unaccented, letters and digits only. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export interface PlayerFilter {
  query: string
  team: string | null
  position: string | null
}

/** The positions present, in the order a depth chart is read where possible. */
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P', 'LS']

export function positionsIn(players: readonly PlayerSummary[]): string[] {
  const seen = [...new Set(players.map((p) => p.position).filter(Boolean))]
  return seen.sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a)
    const bi = POSITION_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })
}

/**
 * How well a player matches a typed query: lower is better, -1 is no match.
 *
 * 0  the surname starts with it — "all" finds Josh Allen
 * 1  any other name part starts with it — "jos" finds Josh Allen too
 * 2  the whole name, spaces removed, starts with it — "joshal"
 * 3  it appears somewhere — "add" still finds Waddle, but last
 */
export function rank(name: string, query: string): number {
  if (!query) return 0
  const parts = name.split(/\s+/).filter(Boolean).map(normalise)
  const whole = normalise(name)
  const surname = parts.at(-1) ?? ''

  if (surname.startsWith(query)) return 0
  if (parts.some((part) => part.startsWith(query))) return 1
  if (whole.startsWith(query)) return 2
  return whole.includes(query) ? 3 : -1
}

/**
 * The matching players, best match first.
 *
 * Within a tier, whoever has played more. Two players share a surname often
 * enough to matter — "jefferson" finds both Justin and Jermar — and with no
 * popularity signal in the dataset, recorded production is the honest stand-in
 * for which one was meant. Alphabetical order, which is what the index arrives
 * in, put the wrong Jefferson first.
 */
export function searchPlayers(
  players: readonly PlayerSummary[],
  filter: PlayerFilter,
): PlayerSummary[] {
  const query = normalise(filter.query)

  const scored: { player: PlayerSummary; score: number }[] = []
  for (const player of players) {
    if (filter.team && player.team !== filter.team) continue
    if (filter.position && player.position !== filter.position) continue
    const score = rank(player.name, query)
    if (score === -1) continue
    scored.push({ player, score })
  }

  scored.sort((a, b) => a.score - b.score || b.player.games - a.player.games)
  return scored.map((entry) => entry.player)
}

/** A sentence describing the result, for the live region and the heading. */
export function describeSearch(filter: PlayerFilter, shown: number, total: number): string {
  const scope = [
    filter.position ? `${filter.position}s` : 'players',
    filter.team ? `for ${filter.team}` : null,
    filter.query ? `matching “${filter.query.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(' ')

  if (shown === 0) return `No ${scope}.`
  if (shown === total) return `All ${total.toLocaleString()} ${scope}.`
  return `${shown.toLocaleString()} of ${total.toLocaleString()} ${scope}.`
}
