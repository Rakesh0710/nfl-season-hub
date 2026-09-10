/**
 * Stage 5A: a static Recharts win-probability line.
 *
 * This exists to prove the data before any animation is built on top of it —
 * that plays are ordered, that the curve is plausible, and that swings line up
 * with real events. The canvas engine replaces it in Stage 5B.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { accentOn } from '@/lib/colors'
import { clockLabel, quarterBoundaries, toChartPoints, type ChartPoint } from '@/lib/winprob'
import type { Game } from '@/types/nfl'

const SURFACE = '#0a0a0a'

export default function WinProbChart({ game }: { game: Game }) {
  const data = toChartPoints(game)
  const homeColor = accentOn(SURFACE, game.home.color, '#a3a3a3')
  const marks = quarterBoundaries(game)
  const maxElapsed = data.length ? data[data.length - 1].elapsed : 3600

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">{game.home.name} win probability</h2>
        <p className="text-xs text-neutral-500">{data.length} plays</p>
      </div>

      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="#262626" vertical={false} />
            <XAxis
              dataKey="elapsed"
              type="number"
              domain={[0, maxElapsed]}
              ticks={marks.map((m) => m.at)}
              tickFormatter={(value: number) => marks.find((m) => m.at === value)?.label ?? ''}
              stroke="#525252"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              stroke="#525252"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            {/* Even odds: above this line the home team is favoured. */}
            <ReferenceLine y={0.5} stroke="#525252" strokeDasharray="3 3" />
            {marks.slice(1).map((m) => (
              <ReferenceLine key={m.at} x={m.at} stroke="#262626" />
            ))}
            <Tooltip
              cursor={{ stroke: '#525252' }}
              contentStyle={{
                background: '#0a0a0a',
                border: '1px solid #404040',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={() => ''}
              formatter={(_value, _name, item) => {
                const point = item?.payload as ChartPoint | undefined
                if (!point) return null
                const p = point.play
                return [
                  `${Math.round(p.homeWinProb * 100)}% ${game.home.id} · Q${p.quarter} ${clockLabel(p.clockSeconds)} · ${p.scoreAway}-${p.scoreHome} · ${p.description}`,
                  '',
                ]
              }}
            />
            <Line
              type="monotone"
              dataKey="homeWinProb"
              stroke={homeColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        Win probability is the pre-snap value going into each play. 50% is even odds; above the
        dashed line favours {game.home.id}.
      </p>
    </div>
  )
}
