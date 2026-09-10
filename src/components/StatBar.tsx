/**
 * One statistic: a label, an animated figure, and a bar placing it on a fixed
 * scale.
 *
 * The scale endpoints are always drawn, because a bar with no axis says
 * nothing — a team file carries only its own numbers, so there is no league
 * distribution available here to compare against.
 */

import { m, useReducedMotion } from 'framer-motion'
import { useCountUp } from '@/lib/useCountUp'

export interface StatBarProps {
  label: string
  value: number | null | undefined
  /** [min, max] of the drawn scale. */
  domain: [number, number]
  /** Renders the animated figure; receives the in-flight value. */
  format: (value: number) => string
  /** Colour of the fill, normally the team accent. */
  color: string
  /** Shown under the label, e.g. "lower is better". */
  hint?: string
}

export default function StatBar({ label, value, domain, format, color, hint }: StatBarProps) {
  const reduceMotion = useReducedMotion()
  const known = typeof value === 'number' && Number.isFinite(value)
  const animated = useCountUp(known ? value : 0)
  const [min, max] = domain

  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const toPct = (v: number) => ((clamp(v) - min) / (max - min)) * 100

  // A scale spanning zero (EPA per play) is drawn from the zero line outwards,
  // so a negative value reads as a deficit rather than as a short bar.
  const diverging = min < 0 && max > 0
  const zero = diverging ? toPct(0) : 0
  const end = known ? toPct(value) : 0
  const left = diverging ? Math.min(zero, end) : 0
  const width = diverging ? Math.abs(end - zero) : end

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm text-neutral-300">{label}</span>
          {hint && <span className="ml-2 text-[11px] text-muted">{hint}</span>}
        </div>
        {/* The count-up rewrites this text every frame, so mid-animation the
            DOM reads "3.4" when the real figure is 21.3. Assistive technology
            is given the true value and the animated digits are hidden from it. */}
        <span className="shrink-0 text-base font-semibold tabular-nums text-neutral-100">
          <span aria-hidden="true">{known ? format(animated) : '—'}</span>
          <span className="sr-only">{known ? format(value) : 'not available'}</span>
        </span>
      </div>

      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-800">
        {diverging && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-neutral-600"
            style={{ left: `${zero}%` }}
          />
        )}
        {known && (
          <m.span
            className="absolute inset-y-0 rounded-full"
            style={{ backgroundColor: color, left: `${left}%` }}
            initial={{ width: reduceMotion ? `${width}%` : 0 }}
            animate={{ width: `${width}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.55, ease: 'easeOut' }}
          />
        )}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted tabular-nums">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}
