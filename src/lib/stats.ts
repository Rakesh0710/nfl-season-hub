/**
 * The five numbers a team stat line is judged on, and the scale each is read
 * against.
 *
 * These live here rather than in a component because two screens now draw
 * them: the team page, where one team's value sits on a printed scale, and the
 * comparison, where two teams share one. A scale that differed between the two
 * would make the same team look different depending on which page you were on.
 *
 * The domains are fixed and always printed. A team file carries only its own
 * numbers, so there is no league distribution to rank against — the endpoints
 * are chosen to span the realistic range for a season, and drawing them is
 * what stops a bar from implying a percentile it cannot know.
 */

import { num, percent } from '@/lib/football'
import type { TeamStatLine } from '@/types/nfl'

export interface TeamMetric {
  key: keyof TeamStatLine
  label: string
  /** [min, max] of the drawn scale. */
  domain: [number, number]
  format: (value: number) => string
}

export const TEAM_METRICS: readonly TeamMetric[] = [
  { key: 'epaPerPlay', label: 'EPA per play', domain: [-0.25, 0.25], format: (v) => v.toFixed(3) },
  { key: 'pointsPerGame', label: 'Points per game', domain: [0, 35], format: (v) => num(v, 1) },
  { key: 'yardsPerGame', label: 'Yards per game', domain: [0, 450], format: (v) => num(v, 0) },
  { key: 'successRate', label: 'Success rate', domain: [0.3, 0.55], format: (v) => percent(v, 1) },
  {
    key: 'explosiveRate',
    label: 'Explosive rate',
    domain: [0, 0.12],
    format: (v) => percent(v, 1),
  },
]
