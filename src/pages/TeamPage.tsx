/**
 * Stage 2 placeholder for the team page.
 *
 * Proves the :id route param reaches the data layer and that an unknown team
 * fails gracefully. The real roster, depth chart and stats are Stage 4.
 */

import { Link, useParams } from 'react-router-dom'
import { ErrorState, Loading } from '@/components/States'
import { getTeam } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'
import type { Team } from '@/types/nfl'

export default function TeamPage() {
  const { id = '' } = useParams<{ id: string }>()
  const state = useAsync<Team>(`team/${id}`, () => getTeam(id.toUpperCase()))

  if (state.status === 'loading') return <Loading label={`Loading ${id.toUpperCase()}`} />
  if (state.status === 'error') return <ErrorState error={state.error} />

  const team = state.data
  const { wins, losses, ties } = team.lastSeason

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <Link to="/" className="hover:text-neutral-300">
          League
        </Link>
        <span aria-hidden> / </span>
        <span className="text-neutral-300">{team.name}</span>
      </nav>

      <div className="mt-3 flex items-center gap-4">
        <span
          aria-hidden
          className="size-10 shrink-0 rounded-md"
          style={{ backgroundColor: team.primaryColor }}
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
          <p className="text-sm text-neutral-400">
            {team.division} · last season {wins}-{losses}
            {ties ? `-${ties}` : ''} · {team.projectedWins} projected wins
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-neutral-400">
        Stage 2 placeholder — the roster, depth chart, draft class and stats arrive in Stage 4.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Roster" value={team.roster.length} />
        <Stat label="Depth positions" value={Object.keys(team.depthChart).length} />
        <Stat label="Draft picks" value={team.draftClass.length} />
        <Stat label="Games" value={team.games.length} />
      </dl>

      <h2 className="mt-10 text-sm font-semibold tracking-widest text-neutral-500 uppercase">
        Games — each links to a replay
      </h2>
      <ul className="mt-3 divide-y divide-neutral-800 border-y border-neutral-800">
        {team.games.map((game) => {
          const away = game.away === team.id
          return (
            <li key={game.gameId}>
              <Link
                to={`/game/${game.gameId}`}
                className="flex items-center justify-between gap-4 py-2.5 text-sm hover:text-emerald-400"
              >
                <span className="text-neutral-400 tabular-nums">Wk {game.week}</span>
                <span className="flex-1 truncate">
                  {away ? '@' : 'vs'} {away ? game.home : game.away}
                </span>
                <span className="tabular-nums text-neutral-400">
                  {game.awayScore}–{game.homeScore}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
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
