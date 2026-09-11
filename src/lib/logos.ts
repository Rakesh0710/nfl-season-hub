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

/**
 * The NFL's image CDN, which serves the player headshots nflverse points at.
 *
 * Two delivery types appear in the data — `upload` for 2,214 players and
 * `private` for 55 — and both take the same transformation. Matching only the
 * first left A.J. Brown's stored 3.8 MB PNG going down the wire for a 36-pixel
 * thumbnail; `w_72` makes the same image 2.5 KB.
 */
const HEADSHOT =
  /^(https:\/\/static\.www\.nfl\.com\/image\/(?:upload|private)\/)f_auto,q_auto\/(.+)$/

/**
 * A player headshot at the size it will be drawn.
 *
 * The same problem as the team logos, an order of magnitude worse: the stored
 * headshots are 3-6 MB PNGs. One of them is larger than every JavaScript
 * chunk, every stylesheet and every data file this site serves, combined.
 *
 * They sit on Cloudinary behind a `f_auto,q_auto` transformation, and adding a
 * width to it resizes on their CDN: measured across four players, 3-5 MB
 * becomes 6 KB at 160px and 20 KB at 320px. Anything not on that CDN, or not
 * carrying the transformation this appends to, is returned untouched.
 */
export function headshotAt(url: string, cssPixels: number): string {
  const match = HEADSHOT.exec(url)
  const prefix = match?.[1]
  const asset = match?.[2]
  if (prefix === undefined || asset === undefined) return url

  const width = Math.round(cssPixels * MAX_DPR)
  return `${prefix}f_auto,q_auto,w_${width}/${asset}`
}
