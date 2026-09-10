import { describe, expect, it } from 'vitest'
import {
  clockLabel,
  keyPlayIndices,
  periodLabel,
  quarterBoundaries,
  toChartPoints,
} from '@/lib/winprob'
import { elapsedSeconds, overtimeLength } from '@/types/nfl'
import { makeGame, makePlay } from '@/test/fixtures'

describe('periodLabel', () => {
  it('names quarters and overtime periods', () => {
    expect(periodLabel(1)).toBe('Q1')
    expect(periodLabel(4)).toBe('Q4')
    expect(periodLabel(5)).toBe('OT')
    expect(periodLabel(6)).toBe('OT2')
  })
})

describe('clockLabel', () => {
  it('pads the seconds', () => {
    expect(clockLabel(724)).toBe('12:04')
    expect(clockLabel(0)).toBe('0:00')
    expect(clockLabel(59)).toBe('0:59')
  })
})

describe('overtime length', () => {
  it('is ten minutes in the regular season and fifteen in the playoffs', () => {
    expect(overtimeLength('REG')).toBe(600)
    expect(overtimeLength('SB')).toBe(900)
  })

  it('never places a postseason overtime play before the end of regulation', () => {
    const play = makePlay({ quarter: 5, clockSeconds: 900 })
    expect(elapsedSeconds(play, 'DIV')).toBe(3600)
    // Assuming 600 here would have produced 3300 — earlier than the fourth
    // quarter it follows.
    expect(elapsedSeconds(play, 'DIV')).toBeGreaterThanOrEqual(3600)
  })

  it('counts a regulation play from the start of its quarter', () => {
    expect(elapsedSeconds(makePlay({ quarter: 3, clockSeconds: 600 }), 'REG')).toBe(2100)
  })
})

describe('toChartPoints', () => {
  it('emits one point per play, in order, carrying the play itself', () => {
    const game = makeGame()
    const points = toChartPoints(game)
    expect(points).toHaveLength(game.plays.length)
    expect(points.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(points[3]?.play).toBe(game.plays[3])
    expect(points[3]?.homeWinProb).toBe(game.plays[3]?.homeWinProb)
  })

  it('produces a non-decreasing elapsed axis', () => {
    const elapsed = toChartPoints(makeGame()).map((p) => p.elapsed)
    for (let i = 1; i < elapsed.length; i++) {
      expect(elapsed[i]).toBeGreaterThanOrEqual(elapsed[i - 1] ?? 0)
    }
  })
})

describe('quarterBoundaries', () => {
  it('marks the first play of each period, overtime included', () => {
    expect(quarterBoundaries(makeGame())).toEqual([
      { at: 0, label: 'Q1' },
      { at: 2, label: 'Q2' },
      { at: 3, label: 'Q3' },
      { at: 4, label: 'Q4' },
      { at: 5, label: 'OT' },
    ])
  })

  it('does not invent a mark for a quarter with no plays', () => {
    const game = makeGame({
      plays: [makePlay({ quarter: 1 }), makePlay({ quarter: 3 })],
    })
    expect(quarterBoundaries(game).map((m) => m.label)).toEqual(['Q1', 'Q3'])
  })
})

describe('keyPlayIndices', () => {
  it('reports exactly the plays the ETL flagged', () => {
    expect(keyPlayIndices(makeGame())).toEqual([2, 3, 4])
  })

  it('applies no rule of its own — a large swing that the ETL did not flag is not a key play', () => {
    // This is the Stage 5D contract: `isKeyPlay` is decided once, in the ETL.
    // A second definition in the UI would let the chart markers and the
    // timeline markers mean different things.
    const game = makeGame({
      plays: [
        makePlay({ homeWinProb: 0.2, isKeyPlay: false }),
        makePlay({ homeWinProb: 0.95, scoreHome: 7, isKeyPlay: false }),
        makePlay({ homeWinProb: 0.95, isKeyPlay: true }),
      ],
    })
    expect(keyPlayIndices(game)).toEqual([2])
  })

  it('is ascending, which is what the drawing loop relies on to stop early', () => {
    const indices = keyPlayIndices(makeGame())
    expect([...indices].sort((a, b) => a - b)).toEqual(indices)
  })

  it('is empty for a game with no flagged plays', () => {
    expect(keyPlayIndices(makeGame({ plays: [makePlay({ isKeyPlay: false })] }))).toEqual([])
  })
})
