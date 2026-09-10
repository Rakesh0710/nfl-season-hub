/**
 * Shaping a game's plays into a win-probability series.
 *
 * Kept out of the chart component so the same series feeds the Stage 5A
 * Recharts baseline and, later, the canvas replay — and so it can be checked
 * without rendering anything.
 */

import { elapsedSeconds, type Game, type GamePlay } from '@/types/nfl'

export interface ChartPoint {
  /** Seconds since kickoff — the x axis, and the proof that plays are ordered. */
  elapsed: number
  /** 0..1, plotted as a percentage. */
  homeWinProb: number
  index: number
  play: GamePlay
}

export function toChartPoints(game: Game): ChartPoint[] {
  return game.plays.map((play, index) => ({
    elapsed: elapsedSeconds(play, game.gameType),
    homeWinProb: play.homeWinProb,
    index,
    play,
  }))
}

/** Quarter boundaries in elapsed seconds, for the vertical dividers. */
export function quarterBoundaries(game: Game): { at: number; label: string }[] {
  const maxQuarter = game.plays.reduce((m, p) => Math.max(m, p.quarter), 4)
  const otLength = game.gameType === 'REG' ? 600 : 900
  const marks: { at: number; label: string }[] = []
  for (let q = 1; q <= maxQuarter; q += 1) {
    const at = q <= 4 ? (q - 1) * 900 : 3600 + (q - 5) * otLength
    marks.push({ at, label: q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `OT${q - 4}` })
  }
  return marks
}

/** "12:04" from seconds remaining in a quarter. */
export function clockLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
