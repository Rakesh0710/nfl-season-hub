/**
 * Contrast helpers for team colors.
 *
 * NFL primary colors span nearly the whole luminance range — New Orleans' gold
 * (#D3BC8D) manages only 1.85:1 against white, while Pittsburgh's black gives
 * 21:1. Six teams fail WCAG AA with white text, so any label placed on a team
 * color has to choose its foreground by measurement rather than by assumption.
 */

/** WCAG AA for normal-size text. */
export const AA_CONTRAST = 4.5

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Parse `#rrggbb` (or `#rgb`). Returns null for anything unparseable. */
function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, '')
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Black or white — whichever is more readable on `background`. */
export function readableTextOn(background: string): '#000000' | '#ffffff' {
  return contrastRatio('#ffffff', background) >= contrastRatio('#000000', background)
    ? '#ffffff'
    : '#000000'
}

/**
 * A team color safe to use as an accent on a dark surface.
 *
 * Near-black colors (Pittsburgh, Las Vegas, Chicago) vanish against the app's
 * neutral-950 background, so they fall back to the secondary color when that
 * reads better, and to a neutral otherwise.
 */
export function accentOn(dark: string, primary: string, secondary: string): string {
  const MIN_ACCENT = 1.6
  if (contrastRatio(primary, dark) >= MIN_ACCENT) return primary
  if (contrastRatio(secondary, dark) >= MIN_ACCENT) return secondary
  return '#a3a3a3' // neutral-400
}
