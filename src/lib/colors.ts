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
  const [r, g, b] = rgb
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
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

/** The neutral track a bar fill is read against: Tailwind's neutral-800. */
export const BAR_TRACK = '#262626'

/** WCAG 1.4.11: a graphic that carries meaning needs this much against its background. */
export const GRAPHIC_CONTRAST = 3

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/**
 * A team color lifted until it is legible against a dark surface.
 *
 * The replay curve is the content, not decoration, so it owes the 3:1 that
 * WCAG asks of a meaningful graphic — and nine of the 32 primary colors miss
 * it against the card, the Jets' green managing 1.65:1. Rather than drop those
 * teams to a neutral, which would make a third of the league draw an identical
 * grey line, the hue is mixed toward white until it clears the bar. Every team
 * gets there while still looking like itself.
 *
 * Black is the exception it cannot help: Las Vegas and Pittsburgh have no hue
 * to keep, so they arrive at grey either way.
 */
export function legibleOn(surface: string, color: string, minimum = GRAPHIC_CONTRAST): string {
  const rgb = parseHex(color)
  if (!rgb) return '#a3a3a3' // neutral-400
  for (let mix = 0; mix <= 1; mix += 0.02) {
    const lifted = toHex([
      rgb[0] + (255 - rgb[0]) * mix,
      rgb[1] + (255 - rgb[1]) * mix,
      rgb[2] + (255 - rgb[2]) * mix,
    ])
    if (contrastRatio(lifted, surface) >= minimum) return lifted
  }
  return '#ffffff'
}

/**
 * A team color to draw data with — a bar fill, an accent stripe — on a dark UI.
 *
 * The value a bar encodes is read from where its fill stops against the track
 * behind it, so that is the pair owing WCAG's 3:1 for a meaningful graphic.
 * Twelve of the 32 primaries missed it against `BAR_TRACK`, Buffalo's royal
 * blue managing 1.34:1.
 *
 * The secondary color is tried before lightening, because a team's own second
 * color keeps more of its identity than a washed-out first one — Pittsburgh
 * gets its gold rather than a pale black.
 */
export function teamAccent(track: string, primary: string, secondary: string): string {
  if (contrastRatio(primary, track) >= GRAPHIC_CONTRAST) return primary
  if (contrastRatio(secondary, track) >= GRAPHIC_CONTRAST) return secondary
  return legibleOn(track, primary)
}

/**
 * A hex color as an `rgba()` string.
 *
 * Canvas gradients need per-stop alpha, and `globalAlpha` cannot vary along a
 * gradient, so the transparency has to travel inside the color itself.
 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(163, 163, 163, ${alpha})` // neutral-400
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}
