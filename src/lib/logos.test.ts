import { describe, expect, it } from 'vitest'
import { logoAt } from '@/lib/logos'

const LOGO = 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png'

describe('logoAt', () => {
  it('asks the CDN for twice the drawn size, so a retina screen stays sharp', () => {
    expect(logoAt(LOGO, 40)).toBe(
      'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/ari.png&w=80&h=80',
    )
  })

  it('scales with the size the caller draws at', () => {
    expect(logoAt(LOGO, 22)).toContain('w=44&h=44')
    expect(logoAt(LOGO, 64)).toContain('w=128&h=128')
  })

  it('rounds to a whole pixel', () => {
    expect(logoAt(LOGO, 22.5)).toContain('w=45&h=45')
  })

  it('passes through a URL from anywhere else untouched', () => {
    // If the data source ever changes, the logo must still render — at full
    // size, but rendered — rather than pointing at a resizer that has never
    // heard of it.
    const elsewhere = 'https://example.test/logos/ari.svg'
    expect(logoAt(elsewhere, 40)).toBe(elsewhere)
  })

  it('does not treat a lookalike host as the CDN', () => {
    const spoof = 'https://a.espncdn.com.example.test/i/teamlogos/nfl/500/ari.png'
    expect(logoAt(spoof, 40)).toBe(spoof)
  })

  it('returns an unparseable value rather than throwing', () => {
    expect(logoAt('', 40)).toBe('')
  })
})
