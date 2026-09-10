/**
 * Stage 5B: the canvas replay.
 *
 * React renders this shell once per play at most — the transport buttons, the
 * play readout, the labels. It never touches the canvas. `useReplay` owns the
 * frame loop and draws imperatively; the only thing crossing back into React is
 * the index of the play the cursor has reached, which is what the readout
 * below the chart is showing.
 *
 * The scrubber, key-play markers and performance pass follow in 5C–5E.
 */

import { accentOn, readableTextOn } from '@/lib/colors'
import { clockLabel, periodLabel } from '@/lib/winprob'
import { useReplay } from '@/lib/useReplay'
import type { Game } from '@/types/nfl'

/** The card the canvas sits on, for the contrast check on the team's accent. */
const SURFACE = '#0a0a0a'

const BUTTON =
  'rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-40'

export default function WinProbCanvas({ game }: { game: Game }) {
  const color = accentOn(SURFACE, game.home.color, '#a3a3a3')
  const { canvasRef, playing, playIndex, lastIndex, toggle, restart } = useReplay(game, color)

  const play = game.plays[playIndex]
  const finished = !playing && playIndex >= lastIndex

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">{game.home.name} win probability</h2>
        <p className="text-xs text-neutral-500 tabular-nums">
          Play {playIndex + 1} of {game.plays.length}
        </p>
      </div>

      {/* The canvas is sized entirely by CSS. resizeCanvas reads that size back
          and matches the backing store to it, so the element must not carry
          width/height attributes of its own. */}
      <div className="h-64 w-full sm:h-80">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Win probability line for ${game.home.name} against ${game.away.name}, one point per play. Final score ${game.home.id} ${game.home.finalScore}, ${game.away.id} ${game.away.finalScore}.`}
          className="block h-full w-full"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggle} className={BUTTON}>
          {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
        </button>
        <button type="button" onClick={restart} className={BUTTON} disabled={playIndex === 0}>
          Restart
        </button>
      </div>

      {/* Fixed height: play descriptions vary from four words to a full
          sentence, and letting the box grow makes the chart above it jump. */}
      {play && (
        <div className="mt-3 min-h-20 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400 tabular-nums">
            <span>
              {periodLabel(play.quarter)} {clockLabel(play.clockSeconds)}
            </span>
            <span>
              {game.away.id} {play.scoreAway} – {play.scoreHome} {game.home.id}
            </span>
            <span
              className="rounded px-1.5 py-0.5 font-semibold"
              style={{ backgroundColor: color, color: readableTextOn(color) }}
            >
              {Math.round(play.homeWinProb * 100)}% {game.home.id}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-neutral-200">{play.description}</p>
        </div>
      )}

      <p className="mt-2 text-[11px] text-neutral-500">
        Win probability is the pre-snap value going into each play. 50% is even odds; above the
        dashed line favours {game.home.id}.
      </p>
    </section>
  )
}
