/**
 * The contrast helpers, checked against the real 32 team colors.
 *
 * Two of the defects this project shipped and then fixed were contrast
 * failures that arithmetic alone would not have caught — nine teams whose
 * replay curve fell under 3:1 on the card, and twelve whose bar fill fell
 * under 3:1 on its track. These tests read the generated team index so that a
 * new palette, or a change to the surfaces, fails here rather than in an
 * audit.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  AA_CONTRAST,
  BAR_TRACK,
  contrastRatio,
  GRAPHIC_CONTRAST,
  legibleOn,
  readableTextOn,
  relativeLuminance,
  teamAccent,
  withAlpha,
} from '@/lib/colors'
import { CARD_SURFACE } from '@/lib/replayCanvas'
import { parseTeamsIndex } from '@/lib/contract'

const teams = parseTeamsIndex(
  JSON.parse(readFileSync('public/data/teams-index.json', 'utf8')),
  'teams-index.json',
)

describe('relativeLuminance', () => {
  it('spans black to white', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1)
  })

  it('accepts shorthand hex', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'))
  })

  it('treats an unparseable color as black rather than throwing', () => {
    expect(relativeLuminance('rebeccapurple')).toBe(0)
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#E31837', '#0f0f0f')).toBeCloseTo(contrastRatio('#0f0f0f', '#E31837'))
  })
})

describe('readableTextOn', () => {
  it('picks black on a pale team color and white on a dark one', () => {
    expect(readableTextOn('#D3BC8D')).toBe('#000000') // New Orleans gold
    expect(readableTextOn('#0B162A')).toBe('#ffffff') // Chicago navy
  })

  it('clears AA for every real team color', () => {
    for (const team of teams) {
      const ratio = contrastRatio(readableTextOn(team.primaryColor), team.primaryColor)
      expect(ratio, `${team.id} badge text`).toBeGreaterThanOrEqual(AA_CONTRAST)
    }
  })
})

describe('legibleOn', () => {
  it('leaves a color alone when it already clears the bar', () => {
    expect(legibleOn(CARD_SURFACE, '#ffffff')).toBe('#ffffff')
  })

  it('lifts every team color to 3:1 against the replay card', () => {
    for (const team of teams) {
      const ratio = contrastRatio(legibleOn(CARD_SURFACE, team.primaryColor), CARD_SURFACE)
      expect(ratio, `${team.id} replay curve`).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST)
    }
  })

  it('keeps the hue rather than dropping to a neutral', () => {
    // The Jets' green is 1.65:1 on the card and has to be lifted; it should
    // still be recognisably green afterwards.
    const lifted = legibleOn(CARD_SURFACE, '#125740')
    expect(lifted).not.toBe('#ffffff')
    const channel = (at: number) => parseInt(lifted.slice(at, at + 2), 16)
    const [r, g, b] = [channel(1), channel(3), channel(5)]
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })

  it('honours a custom minimum', () => {
    expect(
      contrastRatio(legibleOn(CARD_SURFACE, '#125740', 7), CARD_SURFACE),
    ).toBeGreaterThanOrEqual(7)
  })

  it('falls back to a legible neutral for an unparseable color', () => {
    expect(
      contrastRatio(legibleOn(CARD_SURFACE, 'not-a-color'), CARD_SURFACE),
    ).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST)
  })
})

describe('teamAccent', () => {
  it('reaches 3:1 against the bar track for every real team', () => {
    for (const team of teams) {
      const accent = teamAccent(BAR_TRACK, team.primaryColor, team.secondaryColor)
      expect(contrastRatio(accent, BAR_TRACK), `${team.id} bar fill`).toBeGreaterThanOrEqual(
        GRAPHIC_CONTRAST,
      )
    }
  })

  it('prefers the team second color over washing out the first', () => {
    // Pittsburgh: black primary, gold secondary. The gold is the identity worth
    // keeping; lightening black gives grey.
    expect(teamAccent(BAR_TRACK, '#101820', '#FFB612')).toBe('#FFB612')
  })

  it('keeps a primary that already passes', () => {
    expect(teamAccent(BAR_TRACK, '#E31837', '#FFB81C')).toBe('#E31837')
  })

  it('lightens the primary when neither team color passes', () => {
    const accent = teamAccent(BAR_TRACK, '#101820', '#0B162A')
    expect(accent).not.toBe('#101820')
    expect(contrastRatio(accent, BAR_TRACK)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST)
  })
})

describe('withAlpha', () => {
  it('produces a canvas-usable rgba string', () => {
    expect(withAlpha('#E31837', 0.22)).toBe('rgba(227, 24, 55, 0.22)')
  })

  it('degrades to a neutral rather than emitting NaN', () => {
    expect(withAlpha('#zzz', 0.5)).toBe('rgba(163, 163, 163, 0.5)')
  })
})
