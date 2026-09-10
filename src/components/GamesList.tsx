/**
 * The team's games — the user's route into the replay, so it is the first
 * section on the page and is never collapsed behind a tab.
 */

import { logoAt } from '@/lib/logos'
import { Link } from 'react-router-dom'
import {
  recordFromGames,
  shortDate,
  shortWeekLabel,
  teamNickname,
  toTeamGame,
  weekLabel,
} from '@/lib/football'
import type { GameSummary, TeamSummary } from '@/types/nfl'

const RESULT_STYLE: Record<string, string> = {
  W: 'bg-emerald-500/15 text-emerald-400',
  L: 'bg-red-500/15 text-red-400',
  T: 'bg-neutral-500/20 text-neutral-300',
}

export default function GamesList({
  games,
  teamId,
  teamsById,
}: {
  games: readonly GameSummary[]
  teamId: string
  teamsById: Map<string, TeamSummary>
}) {
  const rows = games.map((g) => toTeamGame(g, teamId))
  const record = recordFromGames(rows)

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">No games in this dataset for this team.</p>
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-400">
        {rows.length} games ·{' '}
        <span className="font-semibold text-neutral-200 tabular-nums">
          {record.wins}-{record.losses}
          {record.ties > 0 ? `-${record.ties}` : ''}
        </span>{' '}
        · every game opens its win-probability replay
      </p>

      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
        {rows.map(({ game, opponentId, isHome, teamScore, opponentScore, result }) => {
          const opponent = teamsById.get(opponentId)
          return (
            <li key={game.gameId}>
              <Link
                to={`/game/${game.gameId}`}
                className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400 sm:gap-4 sm:px-4"
              >
                <span className="w-11 shrink-0 text-xs text-muted sm:w-24">
                  <span className="sm:hidden">{shortWeekLabel(game)}</span>
                  <span className="hidden sm:inline">{weekLabel(game)}</span>
                </span>

                <span className="hidden w-12 shrink-0 text-xs text-muted sm:block">
                  {shortDate(game.date)}
                </span>

                {/* Its own column only where there is room for one. Below sm
                    those 24px are the difference between "Chargers" and "C…". */}
                <span className="hidden w-6 shrink-0 text-center text-xs text-neutral-400 sm:block">
                  {isHome ? 'vs' : '@'}
                </span>

                {opponent ? (
                  <img
                    src={logoAt(opponent.logo, 22)}
                    alt=""
                    width={22}
                    height={22}
                    loading="lazy"
                    className="size-[22px] shrink-0 object-contain"
                  />
                ) : (
                  <span className="size-[22px] shrink-0" aria-hidden />
                )}

                {/* Full name where it fits; the nickname on narrow screens,
                    because truncation made both Los Angeles clubs and both New
                    York clubs render as the same string. */}
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                  <span className="sm:hidden">
                    <span className="text-neutral-400">{isHome ? 'vs' : '@'}</span>{' '}
                    {opponent ? teamNickname(opponent.name) : opponentId}
                  </span>
                  <span className="hidden sm:inline">{opponent?.name ?? opponentId}</span>
                </span>

                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${RESULT_STYLE[result]}`}
                >
                  {result}
                </span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-neutral-300">
                  {teamScore}–{opponentScore}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
