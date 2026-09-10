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

/**
 * Where each quarter starts, as an index into the plays array.
 *
 * The x axis is play order, not elapsed time. Several plays legitimately share
 * one timestamp — a kickoff and the snap that follows are both logged at 15:00
 * — so an elapsed-seconds axis collides them and cannot guarantee one point
 * per play. Play order gives every play its own position, and it is also the
 * axis the replay itself advances along.
 */
export function quarterBoundaries(game: Game): { at: number; label: string }[] {
  const marks: { at: number; label: string }[] = []
  let seen = 0
  game.plays.forEach((play, index) => {
    if (play.quarter > seen) {
      seen = play.quarter
      marks.push({
        at: index,
        label:
          play.quarter <= 4
            ? `Q${play.quarter}`
            : play.quarter === 5
              ? 'OT'
              : `OT${play.quarter - 4}`,
      })
    }
  })
  return marks
}

/** "12:04" from seconds remaining in a quarter. */
export function clockLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
