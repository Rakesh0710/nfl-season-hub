import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMeta } from '@/lib/contract'
import {
  describeCoverage,
  displayState,
  needsCoverageNotice,
  refreshedAgo,
  seasonInProgress,
  stateOf,
} from '@/lib/season'
import type { Meta } from '@/types/nfl'

const AT = '2026-09-11T05:00:00Z'

function makeMeta(over: Partial<Meta> = {}): Meta {
  return {
    generatedAt: AT,
    source: 'nflverse',
    displaySeason: 2025,
    latestSeason: 2026,
    seasons: [
      { season: 2024, scheduled: 285, played: 285, complete: true },
      { season: 2025, scheduled: 285, played: 285, complete: true },
      { season: 2026, scheduled: 272, played: 2, complete: false },
    ],
    ...over,
  }
}

const at = (iso: string) => new Date(iso)

describe('refreshedAgo', () => {
  it('is coarse, because the data changes at most daily', () => {
    expect(refreshedAgo(AT, at('2026-09-11T05:00:30Z'))).toBe('just now')
    expect(refreshedAgo(AT, at('2026-09-11T05:20:00Z'))).toBe('20 minutes ago')
    expect(refreshedAgo(AT, at('2026-09-11T08:00:00Z'))).toBe('3 hours ago')
    expect(refreshedAgo(AT, at('2026-09-15T05:00:00Z'))).toBe('4 days ago')
  })

  it('says one minute, not 1 minutes', () => {
    expect(refreshedAgo(AT, at('2026-09-11T05:01:30Z'))).toBe('1 minute ago')
    expect(refreshedAgo(AT, at('2026-09-11T06:30:00Z'))).toBe('1 hour ago')
    expect(refreshedAgo(AT, at('2026-09-12T06:00:00Z'))).toBe('1 day ago')
  })

  it('never claims the data arrives in the future, however wrong the clock is', () => {
    expect(refreshedAgo(AT, at('2026-09-10T05:00:00Z'))).toBe('just now')
  })

  it('degrades rather than rendering "Invalid Date"', () => {
    expect(refreshedAgo('not a timestamp')).toBe('at an unknown time')
  })
})

describe('reading the season states', () => {
  it('finds a season, and admits when it has never heard of one', () => {
    expect(stateOf(makeMeta(), 2025)?.complete).toBe(true)
    expect(stateOf(makeMeta(), 1999)).toBeUndefined()
  })

  it('reports the season the figures describe', () => {
    expect(displayState(makeMeta())?.season).toBe(2025)
  })

  it('reports a newer season that has started', () => {
    expect(seasonInProgress(makeMeta())?.season).toBe(2026)
  })

  it('does not report a newer season that has not kicked off', () => {
    const meta = makeMeta({
      seasons: [
        { season: 2025, scheduled: 285, played: 285, complete: true },
        { season: 2026, scheduled: 272, played: 0, complete: false },
      ],
    })
    expect(seasonInProgress(meta)).toBeUndefined()
  })

  it('does not report the displayed season as "newer"', () => {
    const meta = makeMeta({ displaySeason: 2026, latestSeason: 2026 })
    expect(seasonInProgress(meta)).toBeUndefined()
  })
})

describe('describeCoverage', () => {
  it('names the complete season and the one being played', () => {
    const text = describeCoverage(makeMeta())
    expect(text).toContain('complete 2025 season')
    expect(text).toContain('2026 season is under way, 2 of 272 games played')
  })

  it('says outright when the figures themselves are a partial season', () => {
    // The case the promotion rule exists to postpone, and which --display-season
    // can still force.
    const meta = makeMeta({ displaySeason: 2026, latestSeason: 2026 })
    const text = describeCoverage(meta)
    expect(text).toContain('2026 so far')
    expect(text).toContain('2 of 272 games played')
    expect(text).toContain('not comparable with a finished one')
  })

  it('says only what there is to say when nothing newer has started', () => {
    const meta = makeMeta({
      latestSeason: 2025,
      seasons: [{ season: 2025, scheduled: 285, played: 285, complete: true }],
    })
    expect(describeCoverage(meta)).toBe('Figures describe the complete 2025 season.')
  })
})

describe('needsCoverageNotice', () => {
  it('is true while a newer season is being played', () => {
    expect(needsCoverageNotice(makeMeta())).toBe(true)
  })

  it('is true when the displayed season is itself unfinished', () => {
    expect(needsCoverageNotice(makeMeta({ displaySeason: 2026 }))).toBe(true)
  })

  it('is false in the quiet case, so there is no permanent banner', () => {
    const meta = makeMeta({
      latestSeason: 2025,
      seasons: [{ season: 2025, scheduled: 285, played: 285, complete: true }],
    })
    expect(needsCoverageNotice(meta)).toBe(false)
  })
})

describe('the generated meta.json', () => {
  const meta = parseMeta(JSON.parse(readFileSync('public/data/meta.json', 'utf8')), 'meta.json')

  it('matches the contract', () => {
    expect(meta.source).toBe('nflverse')
    expect(meta.seasons.length).toBeGreaterThanOrEqual(6)
  })

  it('describes a season it actually lists', () => {
    expect(stateOf(meta, meta.displaySeason)).toBeDefined()
    expect(meta.latestSeason).toBe(Math.max(...meta.seasons.map((s) => s.season)))
  })

  it('never shows figures from an unfinished season without saying so', () => {
    // Either the displayed season is complete, or the notice is on.
    const shown = displayState(meta)
    expect(shown?.complete === true || needsCoverageNotice(meta)).toBe(true)
  })

  it('agrees with the games actually shipped for the displayed season', () => {
    const games: { season: number }[] = JSON.parse(
      readFileSync('public/data/games-index.json', 'utf8'),
    )
    const shipped = games.filter((g) => g.season === meta.displaySeason).length
    const state = displayState(meta)
    if (!state) throw new Error('meta does not describe its own display season')
    // Every shipped game is a played game; there cannot be more of them than
    // the schedule says were played.
    expect(shipped).toBeLessThanOrEqual(state.played)
  })
})
