/**
 * Stage 2 placeholder for the league dashboard.
 *
 * Its job is to prove the routing and data layers work end to end, not to be
 * the finished dashboard - that is Stage 3.
 */

import { Link } from 'react-router-dom'
import { Loading, ErrorState } from '@/components/States'
import { getGamesIndex, getTeamsIndex } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'
import type { GameSummary, TeamSummary } from '@/types/nfl'

type LeagueData = { teams: TeamSummary[]; games: GameSummary[] }

export default function LeaguePage() {
  const state = useAsync<LeagueData>('league', async () => {
    const [teams, games] = await Promise.all([getTeamsIndex(), getGamesIndex()])
    return { teams, games }
  })

  if (state.status === 'loading') return <Loading label="Loading the league" />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const { teams, games } = state.data
  const seasons = [...new Set(games.map((g) => g.season))].sort()

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">League</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Stage 2 placeholder — routing and the typed data layer, not the finished dashboard.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Teams loaded" value={teams.length} />
        <Stat label="Games indexed" value={games.length} />
        <Stat label="Seasons" value={seasons.length} />
        <Stat label="Range" value={`${seasons[0]}–${seasons.at(-1)}`} />
      </dl>

      <h2 className="mt-10 text-sm font-semibold tracking-widest text-neutral-500 uppercase">
        Teams
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {teams.map((team) => (
          <li key={team.id}>
            <Link
              to={`/team/${team.id}`}
              className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-sm hover:border-neutral-600"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: team.primaryColor }}
              />
              <span className="truncate">{team.id}</span>
            </Link>
          </li>
        ))}
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
