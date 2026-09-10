/**
 * Shaping a game's plays into a win-probability series.
 *
 * Kept out of the drawing code so the series can be checked without rendering
 * anything.
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

/** "Q3", "OT", "OT2" — how a period is named on the axis and in the readout. */
export function periodLabel(quarter: number): string {
  if (quarter <= 4) return `Q${quarter}`
  return quarter === 5 ? 'OT' : `OT${quarter - 4}`
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
      marks.push({ at: index, label: periodLabel(play.quarter) })
    }
  })
  return marks
}

/**
 * Indices of the plays the ETL marked as key.
 *
 * `isKeyPlay` is the whole definition, decided once in `etl/build_data.py`: a
 * score, a turnover, or a win-probability swing of at least ten points. The UI
 * reads that flag and never applies a rule of its own, so the markers on the
 * chart and the markers on the timeline can never mean different things.
 */
export function keyPlayIndices(game: Game): number[] {
  const marks: number[] = []
  game.plays.forEach((play, index) => {
    if (play.isKeyPlay) marks.push(index)
  })
  return marks
}

/** "12:04" from seconds remaining in a quarter. */
export function clockLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
