/**
 * Replay control state.
 *
 * The hook owns a requestAnimationFrame loop, so the tests drive frames
 * themselves rather than waiting on a real clock: every frame's timestamp is
 * chosen here, which is the only way to assert what a dropped frame or a
 * backgrounded tab does to the cursor.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAYS_PER_SECOND, useReplay } from '@/lib/useReplay'
import { makeGame, makePlay } from '@/test/fixtures'

/** A hand-cranked animation clock. */
function frameDriver() {
  let handle = 0
  let now = 0
  const pending = new Map<number, FrameRequestCallback>()

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++handle, callback)
    return handle
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    pending.delete(id)
  })

  return {
    /** How many callbacks are booked. More than one means two loops are running. */
    get outstanding() {
      return pending.size
    },
    /** Run every booked callback once, `ms` later. */
    tick(ms: number) {
      now += ms
      const due = [...pending.entries()]
      pending.clear()
      for (const [, callback] of due) callback(now)
    },
    /** Run `count` frames of `ms` each. */
    run(count: number, ms = 16) {
      for (let i = 0; i < count; i++) this.tick(ms)
    },
  }
}

let frames: ReturnType<typeof frameDriver>

beforeEach(() => {
  frames = frameDriver()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const game = makeGame() // six plays, so lastIndex is 5
const render = () => renderHook(() => useReplay(game, '#E31837'))

/** A game long enough that the cursor can run for a second without finishing. */
function longGame(plays = 200) {
  return makeGame({
    plays: Array.from({ length: plays }, (_, i) => makePlay({ playId: i, homeWinProb: 0.5 })),
  })
}

/**
 * Half a second of playback, as 20ms frames.
 *
 * A single large frame would not do it: the loop caps one frame's step at
 * 100ms so a backgrounded tab cannot jump the replay to the whistle.
 */
function playFor(ms: number) {
  frames.tick(0) // the first frame only establishes a baseline timestamp
  frames.run(ms / 20, 20)
}

/**
 * Where the cursor should be, to within a play.
 *
 * The cursor accumulates a fractional increment per frame, so fifty frames of
 * a second's playback land on 7.999999999999 rather than 8 — and whether that
 * floors to 7 or 8 depends on where the run started. The tolerance is the
 * arithmetic being honest, not the pacing being loose: position is derived from
 * elapsed time on every frame, never from a frame count, so the error cannot
 * compound the way a counter would.
 */
function expectPlay(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)
}

describe('playback', () => {
  it('starts playing on mount and books exactly one frame', () => {
    const { result } = render()
    expect(result.current.playing).toBe(true)
    expect(frames.outstanding).toBe(1)
  })

  it('advances the cursor at the configured rate', () => {
    const { result } = renderHook(() => useReplay(longGame(), '#E31837'))
    act(() => playFor(1000))
    expectPlay(result.current.playIndex, PLAYS_PER_SECOND)
  })

  it('runs faster at 2x and slower at 0.5x', () => {
    const { result } = renderHook(() => useReplay(longGame(), '#E31837'))
    act(() => result.current.setSpeed(2))
    act(() => playFor(1000))
    expectPlay(result.current.playIndex, PLAYS_PER_SECOND * 2)

    act(() => result.current.restart())
    act(() => result.current.setSpeed(0.5))
    act(() => playFor(1000))
    expectPlay(result.current.playIndex, PLAYS_PER_SECOND / 2)
  })

  it('stops itself at the final play', () => {
    const { result } = render()
    act(() => frames.run(30, 100))
    expect(result.current.playIndex).toBe(result.current.lastIndex)
    expect(result.current.playing).toBe(false)
    expect(frames.outstanding).toBe(0)
  })

  it('holds its place through a backgrounded tab rather than jumping to the whistle', () => {
    const { result } = render()
    act(() => frames.tick(16))
    // Two minutes of wall time in one frame, which is what returning to a
    // hidden tab reports. Capped at 100ms, so 0.8 of a play.
    act(() => frames.tick(120_000))
    expect(result.current.playIndex).toBe(0)
    expect(result.current.playing).toBe(true)
  })

  it('never runs backwards on a timestamp that predates the frame that booked it', () => {
    const { result } = render()
    act(() => frames.run(4, 200))
    const reached = result.current.playIndex
    act(() => frames.tick(-1000))
    expect(result.current.playIndex).toBe(reached)
  })
})

describe('transport', () => {
  it('pauses and resumes without stacking loops', () => {
    const { result } = render()
    act(() => result.current.pause())
    expect(result.current.playing).toBe(false)
    expect(frames.outstanding).toBe(0)

    act(() => result.current.play())
    act(() => result.current.play())
    expect(frames.outstanding).toBe(1)
  })

  it('toggles', () => {
    const { result } = render()
    act(() => result.current.toggle())
    expect(result.current.playing).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.playing).toBe(true)
  })

  it('rewinds when Play is pressed on a finished replay', () => {
    const { result } = render()
    act(() => frames.run(30, 100))
    expect(result.current.playIndex).toBe(5)

    act(() => result.current.play())
    expect(result.current.playIndex).toBe(0)
    expect(result.current.playing).toBe(true)
  })

  it('leaves a finished replay finished when a scrub release resumes it', () => {
    // `resume` is what a drag release calls. Unlike Play it must not rewind,
    // or letting go of the thumb at the end would restart the game.
    const { result } = render()
    act(() => frames.run(30, 100))
    act(() => result.current.resume())
    expect(result.current.playing).toBe(false)
    expect(result.current.playIndex).toBe(5)
  })

  it('restarts from the opening kickoff and keeps running', () => {
    const { result } = render()
    act(() => frames.run(4, 200))
    act(() => result.current.restart())
    expect(result.current.playIndex).toBe(0)
    expect(result.current.playing).toBe(true)
    expect(frames.outstanding).toBe(1)
  })
})

describe('seeking', () => {
  it('stays paused when the replay was paused', () => {
    const { result } = render()
    act(() => result.current.pause())
    act(() => result.current.seek(3))
    expect(result.current.playIndex).toBe(3)
    expect(result.current.playing).toBe(false)
    expect(frames.outstanding).toBe(0)
  })

  it('carries straight on when the replay was playing', () => {
    const { result } = renderHook(() => useReplay(longGame(), '#E31837'))
    act(() => result.current.seek(40))
    expect(result.current.playing).toBe(true)
    act(() => playFor(1000))
    expectPlay(result.current.playIndex, 40 + PLAYS_PER_SECOND)
  })

  it('clamps to the series', () => {
    const { result } = render()
    act(() => result.current.seek(-7))
    expect(result.current.playIndex).toBe(0)
    act(() => result.current.seek(999))
    expect(result.current.playIndex).toBe(5)
  })

  it('ignores a non-finite position rather than losing the cursor', () => {
    const { result } = render()
    act(() => result.current.seek(3))
    act(() => result.current.seek(Number.NaN))
    expect(result.current.playIndex).toBe(0)
  })

  it('nudges by whole plays and does not accumulate a fraction', () => {
    const { result } = render()
    act(() => result.current.pause())
    act(() => frames.tick(16))
    act(() => result.current.seek(1.7))
    act(() => result.current.nudge(1))
    expect(result.current.playIndex).toBe(2)
    act(() => result.current.nudge(1))
    expect(result.current.playIndex).toBe(3)
    act(() => result.current.nudge(-10))
    expect(result.current.playIndex).toBe(0)
  })
})

describe('the scrubber thumb', () => {
  /** The hook writes the thumb imperatively; give it something to write to. */
  function attachSlider(lastIndex: number): HTMLInputElement {
    const slider = document.createElement('input')
    slider.type = 'range'
    // Without an explicit range jsdom clamps every value to the default max
    // of 100, exactly as a browser would.
    slider.min = '0'
    slider.max = String(lastIndex)
    slider.step = 'any'
    return slider
  }

  function withSlider() {
    const harness = render()
    const slider = attachSlider(harness.result.current.lastIndex)
    harness.result.current.sliderRef.current = slider
    return { ...harness, slider }
  }

  it('follows the cursor and fills its track', () => {
    const { result, slider } = withSlider()
    act(() => result.current.seek(3))
    expect(slider.value).toBe('3')
    expect(slider.style.getPropertyValue('--progress')).toBe('60%')
  })

  it('never reports a different play from the readout beside it', () => {
    // Writes the eye cannot see are skipped, but the skip is measured in
    // thousandths of the track. In a long game one thousandth spans four
    // plays, so a skipped write could leave the thumb reporting a different
    // play from the text — which is the Stage 5C defect this pins down.
    const long = longGame(4001)
    const { result } = renderHook(() => useReplay(long, '#E31837'))
    const slider = attachSlider(result.current.lastIndex)
    result.current.sliderRef.current = slider

    act(() => result.current.seek(1000))
    expect(slider.value).toBe('1000')
    act(() => result.current.seek(1001)) // same thousandth of the track
    expect(slider.value).toBe('1001')
  })
})

describe('lifecycle', () => {
  it('cancels its frame on unmount, leaving nothing running', () => {
    const { unmount } = render()
    expect(frames.outstanding).toBe(1)
    unmount()
    expect(frames.outstanding).toBe(0)
  })

  it('rewinds and keeps one loop when the game changes', () => {
    const other = makeGame({ gameId: '2022_15_IND_MIN' })
    const { result, rerender } = renderHook(({ g }) => useReplay(g, '#E31837'), {
      initialProps: { g: game },
    })
    act(() => frames.run(4, 200))
    expect(result.current.playIndex).toBeGreaterThan(0)

    rerender({ g: other })
    expect(result.current.playIndex).toBe(0)
    expect(frames.outstanding).toBe(1)
  })

  it('publishes the play index once per play, not once per frame', () => {
    let renders = 0
    renderHook(() => {
      renders++
      return useReplay(game, '#E31837')
    })
    const before = renders

    // Twenty frames at 60fps cover a third of a second: two and a bit plays.
    act(() => frames.run(20, 16))
    expect(renders - before).toBeLessThanOrEqual(3)
  })
})

describe('key plays', () => {
  it('exposes the ETL flags unchanged', () => {
    const { result } = render()
    expect(result.current.keyIndices).toEqual([2, 3, 4])
  })
})
