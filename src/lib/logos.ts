/**
 * Team logos, requested at the size they are actually drawn.
 *
 * nflverse stores ESPN's 500x500 master for each club, which weighs 42-79 KB.
 * The league dashboard draws 32 of them at 40 CSS pixels: measured with
 * Lighthouse, that is 1.6 MB of image downloaded to paint a few thousand
 * pixels, and it was the single largest cost on the page — larger than the
 * whole JavaScript bundle by an order of magnitude.
 *
 * ESPN's image combiner resizes on their CDN, so asking for 80px instead of
 * 500 brings one logo from 42.0 KB to 4.0 KB. Nothing is proxied or re-hosted;
 * the same server serves the same asset at a sensible size.
 *
 * This belongs in the frontend rather than the ETL because the size wanted is
 * a property of where the logo is being rendered, not of the team. The stored
 * URL stays the canonical, full-resolution one.
 */

/** The only origin the data uses; anything else is passed through untouched. */
const ESPN_ORIGIN = 'https://a.espncdn.com'

/**
 * Retina and no further, matching the canvas's own device-pixel-ratio cap: a
 * third multiple doubles the bytes again for detail the eye cannot resolve.
 */
const MAX_DPR = 2

export function logoAt(url: string, cssPixels: number): string {
  if (!url.startsWith(`${ESPN_ORIGIN}/`)) return url

  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return url
  }

  const size = Math.round(cssPixels * MAX_DPR)
  return `${ESPN_ORIGIN}/combiner/i?img=${path}&w=${size}&h=${size}`
}
