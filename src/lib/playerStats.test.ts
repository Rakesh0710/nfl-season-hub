import { describe, expect, it } from 'vitest'
import {
  formatStat,
  groupsIn,
  hasGroup,
  primaryGroup,
  STAT_GROUPS,
  type StatField,
} from '@/lib/playerStats'
import type { PlayerStatLine, PlayerWeek } from '@/types/nfl'

const group = (id: string) => {
  const found = STAT_GROUPS.find((g) => g.id === id)
  if (!found) throw new Error(`no ${id} group`)
  return found
}

const field = (groupId: string, key: keyof PlayerStatLine): StatField => {
  const found = group(groupId).fields.find((f) => f.key === key)
  if (!found) throw new Error(`no ${key} field`)
  return found
}

const week = (over: Partial<PlayerWeek> = {}): PlayerWeek => ({
  season: 2025,
  week: 1,
  opponent: 'LAC',
  stats: {},
  ...over,
})

describe('groupsIn', () => {
  it('shows a group only when the player has numbers in it', () => {
    const qb: PlayerStatLine = { completions: 24, attempts: 39, passingYards: 258 }
    expect(groupsIn(qb).map((g) => g.id)).toEqual(['passing'])
  })

  it('reads what is there rather than branching on position', () => {
    // Mahomes' real 2025 line has one tackle and one reception in it. A page
    // that decided "quarterback, so passing only" would hide both.
    const mahomes: PlayerStatLine = {
      completions: 315,
      passingYards: 3587,
      carries: 64,
      rushingYards: 422,
      tackles: 1,
      receptions: 1,
      receivingYards: -10,
    }
    expect(groupsIn(mahomes).map((g) => g.id)).toEqual([
      'passing',
      'rushing',
      'receiving',
      'defense',
    ])
  })

  it('keeps the declared order, not the order the fields happened to arrive in', () => {
    const line: PlayerStatLine = { tackles: 40, passingYards: 10 }
    expect(groupsIn(line).map((g) => g.id)).toEqual(['passing', 'defense'])
  })

  it('is empty for an empty line', () => {
    expect(groupsIn({})).toEqual([])
  })

  it('counts a zero that survived as present, and an absent field as absent', () => {
    expect(hasGroup({ sacks: 0 }, group('defense'))).toBe(true)
    expect(hasGroup({}, group('defense'))).toBe(false)
  })
})

describe('formatStat', () => {
  it('groups thousands, so 3587 reads as a passing total', () => {
    expect(formatStat({ passingYards: 3587 }, field('passing', 'passingYards'))).toBe('3,587')
  })

  it('gives EPA a decimal, because whole-number EPA is a different claim', () => {
    expect(formatStat({ passingEpa: 68.25 }, field('passing', 'passingEpa'))).toBe('68.3')
  })

  it('dashes a field the player has no value for', () => {
    expect(formatStat({}, field('passing', 'passingYards'))).toBe('—')
  })
})

describe('primaryGroup', () => {
  it('charts a running back on carries even though he also caught passes', () => {
    const weeks = [
      week({
        week: 1,
        stats: { carries: 18, rushingYards: 90, receptions: 2, receivingYards: 15 },
      }),
      week({ week: 2, stats: { carries: 21, rushingYards: 110 } }),
      week({ week: 3, stats: { carries: 14, rushingYards: 61 } }),
    ]
    expect(primaryGroup(weeks)?.id).toBe('rushing')
  })

  it('is not fooled by a one-off: a punter who threw a pass stays a kicker', () => {
    const weeks = [
      week({ week: 1, stats: { fgMade: 2, fgAtt: 2 } }),
      week({ week: 2, stats: { fgMade: 3, fgAtt: 4 } }),
      week({ week: 3, stats: { passingYards: 21, attempts: 1, completions: 1 } }),
    ]
    expect(primaryGroup(weeks)?.id).toBe('kicking')
  })

  it('has no opinion when there are no weeks', () => {
    expect(primaryGroup([])).toBeUndefined()
  })

  it('ignores weeks with nothing in the headline field', () => {
    const weeks = [week({ stats: { tackles: 4 } }), week({ week: 2, stats: {} })]
    expect(primaryGroup(weeks)?.id).toBe('defense')
  })
})

describe('the stat groups themselves', () => {
  it('each declares a headline that is one of its own fields', () => {
    for (const g of STAT_GROUPS) {
      expect(
        g.fields.map((f) => f.key),
        g.id,
      ).toContain(g.headline)
    }
  })

  it('never lists the same statistic in two groups', () => {
    const keys = STAT_GROUPS.flatMap((g) => g.fields.map((f) => f.key))
    expect(new Set(keys).size).toBe(keys.length)
  })
})
