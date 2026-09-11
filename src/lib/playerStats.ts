/**
 * Reading a player's stat line without knowing what position they play.
 *
 * A quarterback's file carries passing fields, a cornerback's carries tackles,
 * and a kicker's carries neither. Rather than branch on `position` — which
 * would be wrong for every two-way player, every running back who throws a
 * halfback pass, and every lineman who recovers a fumble — the UI asks which
 * groups have any numbers in them and renders those.
 *
 * Mahomes' 2025 line, for instance, contains one tackle and one reception. The
 * position-branching version would have hidden both.
 */

import { num } from '@/lib/football'
import type { PlayerStatLine, PlayerWeek } from '@/types/nfl'

export interface StatField {
  key: keyof PlayerStatLine
  label: string
  /** Renders the value; defaults to a whole number. */
  format?: (value: number) => string
}

export interface StatGroup {
  id: string
  title: string
  fields: StatField[]
  /** The one number that summarises this group, for the weekly chart. */
  headline: keyof PlayerStatLine
}

const epa = (v: number) => num(v, 1)

export const STAT_GROUPS: readonly StatGroup[] = [
  {
    id: 'passing',
    title: 'Passing',
    headline: 'passingYards',
    fields: [
      { key: 'completions', label: 'Completions' },
      { key: 'attempts', label: 'Attempts' },
      { key: 'passingYards', label: 'Yards' },
      { key: 'passingTds', label: 'Touchdowns' },
      { key: 'interceptions', label: 'Interceptions' },
      { key: 'passingEpa', label: 'EPA', format: epa },
    ],
  },
  {
    id: 'rushing',
    title: 'Rushing',
    headline: 'rushingYards',
    fields: [
      { key: 'carries', label: 'Carries' },
      { key: 'rushingYards', label: 'Yards' },
      { key: 'rushingTds', label: 'Touchdowns' },
      { key: 'rushingEpa', label: 'EPA', format: epa },
    ],
  },
  {
    id: 'receiving',
    title: 'Receiving',
    headline: 'receivingYards',
    fields: [
      { key: 'targets', label: 'Targets' },
      { key: 'receptions', label: 'Receptions' },
      { key: 'receivingYards', label: 'Yards' },
      { key: 'receivingTds', label: 'Touchdowns' },
      { key: 'receivingEpa', label: 'EPA', format: epa },
    ],
  },
  {
    id: 'defense',
    title: 'Defense',
    headline: 'tackles',
    fields: [
      { key: 'tackles', label: 'Solo tackles' },
      { key: 'sacks', label: 'Sacks', format: (v) => num(v, 1) },
      { key: 'defInterceptions', label: 'Interceptions' },
      { key: 'passesDefended', label: 'Passes defended' },
      { key: 'forcedFumbles', label: 'Forced fumbles' },
    ],
  },
  {
    id: 'kicking',
    title: 'Kicking',
    headline: 'fgMade',
    fields: [
      { key: 'fgMade', label: 'Field goals' },
      { key: 'fgAtt', label: 'Attempts' },
      { key: 'fgLong', label: 'Longest' },
      { key: 'patMade', label: 'Extra points' },
      { key: 'patAtt', label: 'PAT attempts' },
    ],
  },
]

/** Whether a stat line has anything at all to say about this group. */
export function hasGroup(line: PlayerStatLine, group: StatGroup): boolean {
  return group.fields.some((f) => line[f.key] !== undefined)
}

/** The groups worth rendering for a line, in the order they are declared. */
export function groupsIn(line: PlayerStatLine): StatGroup[] {
  return STAT_GROUPS.filter((group) => hasGroup(line, group))
}

/** Formats one field, or a dash when the player has no value for it. */
export function formatStat(line: PlayerStatLine, field: StatField): string {
  const value = line[field.key]
  if (value === undefined) return '—'
  return field.format ? field.format(value) : value.toLocaleString()
}

/**
 * What a player is mainly measured by, from what they actually did.
 *
 * The group with the most weeks of production, so a running back who caught
 * two passes is still charted on carries, and a punter who once threw a pass
 * is not suddenly a quarterback.
 */
export function primaryGroup(weeks: readonly PlayerWeek[]): StatGroup | undefined {
  let best: StatGroup | undefined
  let bestCount = 0
  for (const group of STAT_GROUPS) {
    const count = weeks.filter((w) => w.stats[group.headline] !== undefined).length
    if (count > bestCount) {
      bestCount = count
      best = group
    }
  }
  return best
}
