/**
 * The plays the ETL flagged, marked along the timeline.
 *
 * Which plays these are is `isKeyPlay` and nothing else — the rule lives in
 * `etl/build_data.py` and the UI never second-guesses it, so these markers and
 * the beads drawn on the curve always mean the same thing.
 *
 * The rail sits below the scrubber rather than on top of it: markers laid over
 * the track would eat the drag area that is the scrubber's main job. A game
 * carries fifteen of these on average and up to forty-one, so the group is a
 * single tab stop and the arrow keys walk it, rather than forty-one stops
 * between the scrubber and the Play button.
 */

import { useRef, useState } from 'react'
import { clockLabel, periodLabel } from '@/lib/winprob'
import type { Game } from '@/types/nfl'

export default function KeyPlayRail({
  game,
  keyIndices,
  currentIndex,
  color,
  onSelect,
}: {
  game: Game
  keyIndices: number[]
  currentIndex: number
  color: string
  onSelect: (index: number) => void
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(0)
  const lastIndex = Math.max(1, game.plays.length - 1)

  if (keyIndices.length === 0) return null

  function focusMarker(position: number) {
    const clamped = Math.min(keyIndices.length - 1, Math.max(0, position))
    setFocused(clamped)
    rail.current?.querySelectorAll('button')[clamped]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, position: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusMarker(event.key === 'Home' ? 0 : keyIndices.length - 1)
      return
    }
    if (step === undefined) return
    event.preventDefault()
    focusMarker(position + step)
  }

  return (
    <div
      ref={rail}
      role="group"
      aria-label={`Key plays: ${keyIndices.length} in this game`}
      className="relative h-6"
    >
      {keyIndices.map((index, position) => {
        const play = game.plays[index]
        const current = index === currentIndex
        return (
          <button
            key={index}
            type="button"
            tabIndex={position === focused ? 0 : -1}
            onFocus={() => setFocused(position)}
            onKeyDown={(event) => onKeyDown(event, position)}
            onClick={() => onSelect(index)}
            title={`${periodLabel(play.quarter)} ${clockLabel(play.clockSeconds)} — ${play.description}`}
            aria-label={`Key play ${position + 1} of ${keyIndices.length}, ${periodLabel(play.quarter)} ${clockLabel(play.clockSeconds)}: ${play.description}`}
            className="group absolute top-0 flex size-6 -translate-x-1/2 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-400"
            style={{ left: `${(index / lastIndex) * 100}%` }}
          >
            <span
              aria-hidden
              className={`block w-0.5 rounded-full transition-all group-hover:h-4 ${current ? 'h-4' : 'h-2.5'}`}
              style={{ backgroundColor: current ? '#e5e5e5' : color }}
            />
          </button>
        )
      })}
    </div>
  )
}
