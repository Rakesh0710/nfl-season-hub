import { describe, expect, it } from 'vitest'
import { headshotAt, logoAt } from '@/lib/logos'

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

/**
 * Every one of these is a real URL shape out of `players-index.json`.
 *
 * The `private` case shipped broken: 55 of the 2,269 stored headshots use that
 * delivery type, `headshotAt` matched only `upload`, and so A.J. Brown's
 * thumbnail was his stored 3.8 MB PNG. There was no test here at all, which is
 * why nobody noticed.
 */
describe('headshotAt', () => {
  const UPLOAD = 'https://static.www.nfl.com/image/upload/f_auto,q_auto/league/abc123'
  const PRIVATE = 'https://static.www.nfl.com/image/private/f_auto,q_auto/league/abc123'

  it('adds the drawn width to the transformation, at twice the CSS size', () => {
    expect(headshotAt(UPLOAD, 36)).toBe(
      'https://static.www.nfl.com/image/upload/f_auto,q_auto,w_72/league/abc123',
    )
  })

  it('resizes a private-delivery headshot too, keeping its delivery type', () => {
    expect(headshotAt(PRIVATE, 96)).toBe(
      'https://static.www.nfl.com/image/private/f_auto,q_auto,w_192/league/abc123',
    )
  })

  it('leaves an asset path with slashes in it intact', () => {
    expect(headshotAt(`${UPLOAD}/2025/headshot`, 36)).toContain('/league/abc123/2025/headshot')
  })

  it('passes through anything not on that CDN', () => {
    const elsewhere = 'https://example.test/headshots/mahomes.png'
    expect(headshotAt(elsewhere, 36)).toBe(elsewhere)
  })

  it('does not treat a lookalike host as the CDN', () => {
    const spoof = 'https://static.www.nfl.com.example.test/image/upload/f_auto,q_auto/league/abc'
    expect(headshotAt(spoof, 36)).toBe(spoof)
  })

  it('passes through a CDN URL that already carries a width, rather than doubling it', () => {
    const sized = 'https://static.www.nfl.com/image/upload/f_auto,q_auto,w_72/league/abc123'
    expect(headshotAt(sized, 36)).toBe(sized)
  })

  it('returns an empty value rather than building a URL out of nothing', () => {
    expect(headshotAt('', 36)).toBe('')
  })
})
