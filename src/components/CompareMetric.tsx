/**
 * One statistic, two teams, one scale.
 *
 * The two bars share a single printed domain — that is the entire point, and
 * the reason this is not two `StatBar`s next to each other: bars on separate
 * scales invite a comparison they cannot support.
 *
 * The figures do not count up here. On the team page an animated number is a
 * flourish on a value you read once; side by side, two numbers moving while
 * you try to compare them is just harder to read. Only the bars animate, and
 * they do it in CSS — see `.bar-grow` — so this component pulls no motion
 * runtime into the three route chunks that share it.
 */

import { leads } from '@/lib/compare'
import type { TeamMetric } from '@/lib/stats'

/**
 * The four columns of a row, named once.
 *
 * The scale underneath is laid out with the same widths, because printed
 * endpoints that do not sit above the ends of the track are marking positions
 * they do not actually mark.
 */
const ID_COL = 'w-9 shrink-0'
const VALUE_COL = 'w-16 shrink-0'
const LEADS_COL = 'w-11 shrink-0'

export interface CompareSide {
  id: string
  value: number | undefined
  color: string
}

export default function CompareMetric({
  metric,
  a,
  b,
  lowerIsBetter = false,
}: {
  metric: TeamMetric
  a: CompareSide
  b: CompareSide
  lowerIsBetter?: boolean
}) {
  const winner =
    a.value === undefined || b.value === undefined ? null : leads(a.value, b.value, lowerIsBetter)

  return (
    <div className="py-3">
      <p className="text-sm text-neutral-300">{metric.label}</p>
      <div className="mt-2 space-y-1.5">
        <Row metric={metric} side={a} leads={winner === 'a'} />
        <Row metric={metric} side={b} leads={winner === 'b'} />
      </div>
      <div className="mt-1 flex items-center gap-2.5">
        <span aria-hidden className={ID_COL} />
        <div className="flex min-w-0 flex-1 justify-between text-[10px] text-muted tabular-nums">
          <span>{metric.format(metric.domain[0])}</span>
          <span>{metric.format(metric.domain[1])}</span>
        </div>
        <span aria-hidden className={VALUE_COL} />
        <span aria-hidden className={LEADS_COL} />
      </div>
    </div>
  )
}

/**
 * One team's value for one metric.
 *
 * The test id is here for the same reason `PlayContext` carries one: a row is
 * a label, a bar and a number, with no role of its own and none worth
 * inventing. It lets a test name the row it means instead of walking parent
 * elements, which is the kind of assertion that breaks on a wrapper `div`.
 */
function Row({
  metric,
  side,
  leads: isLeader,
}: {
  metric: TeamMetric
  side: CompareSide
  leads: boolean
}) {
  const [min, max] = metric.domain
  const known = typeof side.value === 'number' && Number.isFinite(side.value)

  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const toPct = (v: number) => ((clamp(v) - min) / (max - min)) * 100

  // A scale spanning zero is drawn outwards from the zero line, so a negative
  // value reads as a deficit rather than as a short bar.
  const diverging = min < 0 && max > 0
  const zero = diverging ? toPct(0) : 0
  const end = known && side.value !== undefined ? toPct(side.value) : 0
  const left = diverging ? Math.min(zero, end) : 0
  const width = diverging ? Math.abs(end - zero) : end

  return (
    <div className="flex items-center gap-2.5" data-testid={`metric-${metric.key}-${side.id}`}>
      <span className={`${ID_COL} text-xs font-semibold text-neutral-400 tabular-nums`}>
        {side.id}
      </span>

      <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-800">
        {diverging && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-neutral-600"
            style={{ left: `${zero}%` }}
          />
        )}
        {known && (
          // Keyed on the value so a new matchup remounts the bar and replays
          // the growth, which a CSS animation on a surviving element would not.
          <span
            key={side.value}
            className="bar-grow absolute inset-y-0 rounded-full"
            style={{
              backgroundColor: side.color,
              left: `${left}%`,
              width: `${width}%`,
              // Grow away from the zero line, not always from the left, or a
              // negative EPA bar would appear to travel across the axis.
              transformOrigin: diverging && end < zero ? 'right' : 'left',
            }}
          />
        )}
      </div>

      <span
        className={`${VALUE_COL} text-right text-sm font-semibold text-neutral-100 tabular-nums`}
      >
        {known && side.value !== undefined ? metric.format(side.value) : '—'}
      </span>

      {/* A word, not a colour or an arrow: the leader has to survive being read
          aloud, and on a two-row comparison there is nowhere for a legend. */}
      <span
        className={`${LEADS_COL} text-[10px] font-semibold tracking-wide text-emerald-400 uppercase`}
      >
        {isLeader ? 'leads' : ''}
      </span>
    </div>
  )
}
