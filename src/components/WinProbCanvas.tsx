/**
 * The canvas replay and its transport.
 *
 * React renders this shell once per play at most — the buttons, the readout,
 * the labels. It never touches the canvas, and it does not own the scrubber's
 * value either: `useReplay` writes the thumb position imperatively on every
 * frame, and React supplies only the parts that change per play (the accessible
 * value text) or per click (the speed).
 *
 * The playback position lives in exactly one place, the hook's cursor. Every
 * control here is a call into it, and everything on screen is drawn from it.
 */

import { useRef } from 'react'
import KeyPlayRail from '@/components/KeyPlayRail'
import PlayContext from '@/components/PlayContext'
import { legibleOn } from '@/lib/colors'
import { CARD_SURFACE, indexAtOffset, PLOT_PADDING } from '@/lib/replayCanvas'
import { clockLabel, periodLabel } from '@/lib/winprob'
import { SPEEDS, useReplay } from '@/lib/useReplay'
import type { Game, GamePlay } from '@/types/nfl'

const BUTTON =
  'rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400'

function segment(active: boolean) {
  return [
    'rounded px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
    active
      ? 'bg-neutral-100 text-neutral-900'
      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
  ].join(' ')
}

/** How far the arrow and page keys move, in plays. */
const KEY_JUMP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -10,
  PageUp: 10,
}

export default function WinProbCanvas({ game }: { game: Game }) {
  const color = legibleOn(CARD_SURFACE, game.home.color)
  const replay = useReplay(game, color)
  const { canvasRef, sliderRef, playing, playIndex, lastIndex, speed, keyIndices, hoverIndex } =
    replay

  // Whether a drag interrupted playback that should pick up again on release.
  const resumeAfterScrub = useRef(false)

  const play = game.plays[playIndex]
  const hovered = hoverIndex === null ? null : game.plays[hoverIndex]
  const finished = !playing && playIndex >= lastIndex

  /**
   * Where the pointer is, as a percentage across the plot.
   *
   * Held away from the edges so a tooltip centred on it stays inside the card.
   * The hairline drawn on the canvas is always exact; only the label is nudged.
   */
  const hoverLeft =
    hoverIndex === null
      ? 0
      : Math.min(88, Math.max(12, (hoverIndex / Math.max(1, lastIndex)) * 100))

  /** Only a mouse hovers. A touch gets tap-to-seek, with no tooltip to dismiss. */
  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType !== 'mouse') return
    replay.hoverAt(event.nativeEvent.offsetX)
  }

  function onCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const index = indexAtOffset(event.nativeEvent.offsetX, lastIndex, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    })
    if (index !== null) replay.seek(index)
  }

  function beginScrub() {
    // Playback is suspended for the length of a drag: letting the cursor run
    // on would move the target out from under the thumb. It picks up again
    // from wherever the drag ended, which is what a video scrubber does.
    resumeAfterScrub.current = playing
    if (playing) replay.pause()
  }

  function endScrub() {
    if (!resumeAfterScrub.current) return
    resumeAfterScrub.current = false
    replay.resume()
  }

  function onScrubberKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // The track is continuous so the thumb can follow the cursor smoothly,
    // which leaves the browser moving by a hundredth of the game per arrow
    // press — a quantity that means nothing here. One press is one play.
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      replay.seek(event.key === 'Home' ? 0 : lastIndex)
      return
    }
    const jump = KEY_JUMP[event.key]
    if (jump === undefined) return
    event.preventDefault()
    replay.nudge(jump)
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">{game.home.name} win probability</h2>
        <p className="text-xs text-muted tabular-nums">
          Play {playIndex + 1} of {game.plays.length}
        </p>
      </div>

      {/* The canvas is sized entirely by CSS. resizeCanvas reads that size back
          and matches the backing store to it, so the element must not carry
          width/height attributes of its own. */}
      <div className="relative h-64 w-full sm:h-80">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Win probability line for ${game.home.name} against ${game.away.name}, one point per play, with ${keyIndices.length} key plays marked. Final score ${game.home.id} ${game.home.finalScore}, ${game.away.id} ${game.away.finalScore}.`}
          className="block h-full w-full cursor-crosshair"
          onPointerMove={onPointerMove}
          onPointerLeave={() => replay.hoverAt(null)}
          onClick={onCanvasClick}
        />
        {hovered && (
          // Inset to the plot so the label sits over the point the hairline
          // marks. Decorative: the same play is one keyboard step away on the
          // scrubber, which announces it properly.
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: PLOT_PADDING.left,
              right: PLOT_PADDING.right,
              top: PLOT_PADDING.top,
              bottom: PLOT_PADDING.bottom,
            }}
          >
            <div
              className={`absolute max-w-48 -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-950/95 px-2 py-1.5 text-[11px] whitespace-nowrap text-neutral-300 tabular-nums shadow-lg ${
                hovered.homeWinProb > 0.5 ? 'bottom-0' : 'top-0'
              }`}
              style={{ left: `${hoverLeft}%` }}
            >
              <span className="text-neutral-400">
                {periodLabel(hovered.quarter)} {clockLabel(hovered.clockSeconds)}
              </span>
              <span className="mx-1.5 text-neutral-700">|</span>
              <span className="font-semibold text-neutral-100">
                {game.away.id} {hovered.scoreAway}–{hovered.scoreHome} {game.home.id}
              </span>
              <span className="mx-1.5 text-neutral-700">|</span>
              <span style={{ color }}>{Math.round(hovered.homeWinProb * 100)}%</span>
              {hovered.isKeyPlay && <span className="ml-1.5 text-amber-300">Key</span>}
            </div>
          </div>
        )}
      </div>

      {/* Inset to the plot, not the card, so the thumb and the key-play markers
          line up with the curve drawn above them. */}
      <div style={{ marginLeft: PLOT_PADDING.left, marginRight: PLOT_PADDING.right, color }}>
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={lastIndex}
          step="any"
          defaultValue={0}
          className="scrubber"
          aria-label="Replay position"
          aria-valuetext={play ? describePosition(play, playIndex, game) : undefined}
          onInput={(event) => replay.seek(event.currentTarget.valueAsNumber)}
          onKeyDown={onScrubberKeyDown}
          onPointerDown={beginScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
        />
        <KeyPlayRail
          game={game}
          keyIndices={keyIndices}
          currentIndex={playIndex}
          color={color}
          onSelect={replay.seek}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={replay.toggle} className={BUTTON}>
            {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
          </button>
          {/* Never disabled. Disabling it on reaching play 0 - which pressing it
              does - moved focus to the body, so a keyboard user lost their place
              the moment the button worked. Restarting from the start is harmless. */}
          <button type="button" onClick={replay.restart} className={BUTTON}>
            Restart
          </button>
        </div>

        <div
          role="group"
          aria-label="Playback speed"
          className="flex gap-1 rounded-lg border border-neutral-800 p-1"
        >
          {SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              aria-pressed={speed === rate}
              onClick={() => replay.setSpeed(rate)}
              className={segment(speed === rate)}
            >
              {rate}&times;
            </button>
          ))}
        </div>
      </div>

      {play && <div className="mt-3">{<PlayContext play={play} game={game} color={color} />}</div>}

      <p className="mt-2 text-[11px] text-muted">
        Win probability is the pre-snap value going into each play. 50% is even odds; above the
        dashed line favours {game.home.id}.
      </p>
    </section>
  )
}

/**
 * What a screen reader announces for the scrubber.
 *
 * The raw value is a play index, which on its own says nothing about where you
 * are in the game, so the announcement carries the period, the clock and the
 * score as well.
 */
function describePosition(play: GamePlay, index: number, game: Game): string {
  return [
    `Play ${index + 1} of ${game.plays.length}`,
    `${periodLabel(play.quarter)} ${clockLabel(play.clockSeconds)}`,
    `${game.away.id} ${play.scoreAway}, ${game.home.id} ${play.scoreHome}`,
    `${game.home.id} ${Math.round(play.homeWinProb * 100)} percent`,
  ].join(', ')
}
