/**
 * Stage 2 placeholder for the game replay.
 *
 * Proves a game file loads on demand with its ordered plays intact. The canvas
 * replay, scrubber and key-play markers are Stage 5.
 */

import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loading } from '@/components/States'
import { getGame } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'
import { elapsedSeconds, type Game } from '@/types/nfl'

export default function GamePage() {
  const { id = '' } = useParams<{ id: string }>()
  const state = useAsync<Game>(`game/${id}`, () => getGame(id))

  if (state.status === 'loading') return <Loading label="Loading the replay data" />
  if (state.status === 'error') return <ErrorState error={state.error} />

  const game = state.data
  const keyPlays = game.plays.filter((p) => p.isKeyPlay)
  const last = game.plays[game.plays.length - 1]

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to="/" className="hover:text-neutral-300">
          League
        </Link>
        <span aria-hidden> / </span>
        <Link to={`/team/${game.home.id}`} className="hover:text-neutral-300">
          {game.home.id}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-neutral-300">{game.gameId}</span>
      </nav>

      <h1 className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold tracking-tight">
        <span>{game.away.name}</span>
        <span className="tabular-nums">
          {game.away.finalScore}–{game.home.finalScore}
        </span>
        <span>{game.home.name}</span>
      </h1>
      <p className="mt-1 text-sm text-neutral-400">
        {game.date} · season {game.season}, week {game.week} · {game.gameType}
      </p>
      <p className="mt-4 text-sm text-neutral-400">
        Stage 2 placeholder — the animated canvas replay and scrubber arrive in Stage 5.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Plays" value={game.plays.length} />
        <Stat label="Key plays" value={keyPlays.length} />
        <Stat label="Final win prob" value={`${Math.round(last.homeWinProb * 100)}%`} />
        <Stat label="Game seconds" value={elapsedSeconds(last, game.gameType)} />
      </dl>

      <h2 className="mt-10 text-sm font-semibold tracking-widest text-neutral-500 uppercase">
        First five key plays
      </h2>
      <ol className="mt-3 space-y-2">
        {keyPlays.slice(0, 5).map((play) => (
          <li key={play.playId} className="rounded-md border border-neutral-800 px-3 py-2 text-sm">
            <div className="flex items-center gap-3 text-xs text-neutral-500 tabular-nums">
              <span>
                Q{play.quarter} {Math.floor(play.clockSeconds / 60)}:
                {String(play.clockSeconds % 60).padStart(2, '0')}
              </span>
              <span>
                {play.scoreAway}–{play.scoreHome}
              </span>
              <span>{Math.round(play.homeWinProb * 100)}% home</span>
            </div>
            <p className="mt-1 text-neutral-300">{play.description}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-800 px-4 py-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
