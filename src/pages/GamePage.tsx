/**
 * The game page.
 *
 * A game's play-by-play is by far the largest file the site serves, so it is
 * fetched here and nowhere else: neither the league dashboard nor a team page
 * touches one.
 */

import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '@/components/States'
import { GameSkeleton } from '@/components/Skeletons'
import WinProbCanvas from '@/components/WinProbCanvas'
import { readableTextOn } from '@/lib/colors'
import { shortDate, weekLabel } from '@/lib/football'
import { getGame } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'
import type { Game, GameTeam } from '@/types/nfl'

export default function GamePage() {
  const { id = '' } = useParams<{ id: string }>()
  const state = useAsync<Game>(`game/${id}`, () => getGame(id))

  if (state.status === 'loading') return <GameSkeleton />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const game = state.data
  const homeWon = game.home.finalScore > game.away.finalScore
  const awayWon = game.away.finalScore > game.home.finalScore

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to="/" className="hover:text-neutral-300">
          League
        </Link>
        <span aria-hidden> / </span>
        <Link to={`/team/${game.home.id}`} className="hover:text-neutral-300">
          {game.home.id}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-neutral-300">{weekLabel(game)}</span>
      </nav>

      <header>
        <h1 className="sr-only">
          {game.away.name} at {game.home.name}, {shortDate(game.date)}
        </h1>
        {/* A phone cannot fit two club names either side of a score: each side
            got 46px and clipped. Mobile therefore stacks the two teams as a
            scoreboard, and only sm+ mirrors them across a centre column. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <Side team={game.away} won={awayWon} label="Away" />
          <span className="hidden shrink-0 text-xs text-neutral-600 sm:block">Final</span>
          <Side team={game.home} won={homeWon} label="Home" mirrorOnDesktop />
        </div>
        <p className="mt-3 text-xs text-neutral-500 sm:text-center">
          Final · {shortDate(game.date)} {game.date.slice(0, 4)} · Season {game.season} ·{' '}
          {weekLabel(game)}
        </p>
      </header>

      <WinProbCanvas game={game} />

      <p className="text-xs text-neutral-500">
        Win probability from nflverse play-by-play. Scrub the timeline or select a key play to jump
        to a moment.
      </p>
    </div>
  )
}

function Side({
  team,
  won,
  label,
  mirrorOnDesktop = false,
}: {
  team: GameTeam
  won: boolean
  label: string
  mirrorOnDesktop?: boolean
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 ${
        mirrorOnDesktop ? 'sm:flex-row-reverse sm:text-right' : ''
      }`}
    >
      <img src={team.logo} alt="" width={48} height={48} className="size-10 shrink-0 sm:size-12" />
      <div className="min-w-0 flex-1">
        <span
          className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: team.color, color: readableTextOn(team.color) }}
        >
          {team.id}
        </span>
        <p className="truncate text-sm font-semibold text-neutral-100 sm:text-base">{team.name}</p>
        <p className="text-[11px] text-neutral-500">{label}</p>
      </div>
      <p
        className={`shrink-0 text-3xl font-bold tabular-nums sm:text-4xl ${
          won ? 'text-neutral-100' : 'text-neutral-500'
        }`}
      >
        {team.finalScore}
      </p>
    </div>
  )
}
