/**
 * Comparing two teams.
 *
 * Pure functions, kept out of the page so the rules are readable in one place
 * and testable without rendering: which team leads a metric, what the head-to-
 * head series says, and how a pair of teams is read out of the query string.
 */

import type { GameSummary, TeamRecord, TeamSummary } from '@/types/nfl'

/** Which side of a comparison a value belongs to, or neither when they tie. */
export type Side = 'a' | 'b' | null

/**
 * The better of two values.
 *
 * `lowerIsBetter` is the whole reason this is a function rather than a `>`.
 * Every defensive metric is a quantity conceded, so the same five numbers that
 * mean "good" on offense mean the opposite one panel over, and a comparison
 * that got that backwards would confidently award the wrong team.
 *
 * An exact tie returns null: marking one of two identical numbers as the
 * leader would be inventing a distinction the data does not make.
 */
export function leads(a: number, b: number, lowerIsBetter = false): Side {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null
  const aWins = lowerIsBetter ? a < b : a > b
  return aWins ? 'a' : 'b'
}

/**
 * Every meeting between two teams, most recent first.
 *
 * Reads the whole-league game index rather than either team's own games list,
 * because a team file carries one season. Across 2020-2025 every one of the
 * 496 possible pairings has met at least once, and a division rival can appear
 * fourteen times.
 */
export function meetings(games: readonly GameSummary[], a: string, b: string): GameSummary[] {
  if (a === b) return []
  return games
    .filter((game) => (game.home === a && game.away === b) || (game.home === b && game.away === a))
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}

/** The series record from `a`'s point of view. */
export function seriesRecord(games: readonly GameSummary[], a: string): TeamRecord {
  return games.reduce<TeamRecord>(
    (record, game) => {
      const scored = game.home === a ? game.homeScore : game.awayScore
      const conceded = game.home === a ? game.awayScore : game.homeScore
      return {
        wins: record.wins + (scored > conceded ? 1 : 0),
        losses: record.losses + (scored < conceded ? 1 : 0),
        ties: record.ties + (scored === conceded ? 1 : 0),
      }
    },
    { wins: 0, losses: 0, ties: 0 },
  )
}

/** Which team a game's winner is, or null for a tie. */
export function winnerOf(game: GameSummary): string | null {
  if (game.homeScore === game.awayScore) return null
  return game.homeScore > game.awayScore ? game.home : game.away
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

/** The two teams being compared; either side may be unchosen. */
export interface Matchup {
  a: string | null
  b: string | null
}

/**
 * Reads a matchup out of the query string.
 *
 * Anything unrecognised falls away rather than erroring, the same rule the
 * league dashboard follows: a hand-edited or stale link degrades to a page
 * with pickers on it instead of a dead end. A team compared with itself drops
 * the second slot, because the answer would be five ties and no meetings.
 */
export function matchupFromParams(params: URLSearchParams, teams: readonly TeamSummary[]): Matchup {
  const known = (value: string | null): string | null => {
    if (!value) return null
    const id = value.toUpperCase()
    return teams.some((team) => team.id === id) ? id : null
  }
  const a = known(params.get('a'))
  const b = known(params.get('b'))
  return { a, b: b === a ? null : b }
}

/** Serialises a matchup, omitting an unchosen side. */
export function matchupToParams(matchup: Matchup): URLSearchParams {
  const params = new URLSearchParams()
  if (matchup.a) params.set('a', matchup.a)
  if (matchup.b) params.set('b', matchup.b)
  return params
}
