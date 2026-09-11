/**
 * Two teams, side by side.
 *
 * The league dashboard ranks 32 teams and then cannot answer the question it
 * invites: is this one actually better than that one? Every stat bar on a team
 * page is drawn against a printed fixed scale precisely because a team file
 * carries no league distribution to rank against — a second team is the
 * reference point those bars have been missing.
 *
 * Nothing new is generated for this page. Both teams' numbers already live in
 * their team files, and the head-to-head comes from `games-index.json`, which
 * the ETL has always produced and both validators have always checked. This is
 * its first reader.
 */

import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CompareMetric from '@/components/CompareMetric'
import { CompareSkeleton, MatchupSkeleton } from '@/components/Skeletons'
import { ErrorState } from '@/components/States'
import TeamPicker from '@/components/TeamPicker'
import { BAR_TRACK, teamAccent } from '@/lib/colors'
import {
  matchupFromParams,
  matchupToParams,
  meetings,
  seriesRecord,
  winnerOf,
  type Matchup,
} from '@/lib/compare'
import { getGamesIndex, getTeam, getTeamsIndex } from '@/lib/data'
import { recordLabel } from '@/lib/league'
import { logoAt } from '@/lib/logos'
import { shortDate, weekLabel } from '@/lib/football'
import { TEAM_METRICS } from '@/lib/stats'
import { useAsync } from '@/lib/useAsync'
import type { GameSummary, Team, TeamSummary } from '@/types/nfl'

/** Both teams and the fixtures between them, or null while a side is unchosen. */
type Pair = { a: Team; b: Team; between: GameSummary[] } | null

/**
 * One shared empty array for the not-yet-loaded case.
 *
 * A fresh `[]` per render would be a new identity every time, so the memo
 * below would recompute on every render while the index is still in flight.
 */
const NO_TEAMS: readonly TeamSummary[] = []

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const index = useAsync<TeamSummary[]>('teams-index', getTeamsIndex)
  const teams = index.status === 'success' ? index.data : NO_TEAMS

  const matchup = useMemo(() => matchupFromParams(params, teams), [params, teams])
  const both = matchup.a !== null && matchup.b !== null

  function setMatchup(next: Matchup) {
    setParams(matchupToParams(next), { replace: true })
  }

  // Keyed on the pair, so choosing a different opponent refetches exactly once
  // and a half-chosen matchup never issues a request.
  const pair = useAsync<Pair>(`compare/${matchup.a ?? ''}|${matchup.b ?? ''}`, async () => {
    if (matchup.a === null || matchup.b === null) return null
    // The two team files are independent; the game index is usually the only
    // one of the three that is not already in the request cache.
    const [a, b, games] = await Promise.all([
      getTeam(matchup.a),
      getTeam(matchup.b),
      getGamesIndex(),
    ])
    return { a, b, between: meetings(games, a.id, b.id) }
  })

  // Matching the route-level skeleton, which sized itself from the same two
  // parameters. A short skeleton here after a tall one there pulled the footer
  // back up into the viewport and then pushed it down again — two shifts, and
  // most of this route's cumulative layout shift.
  if (index.status === 'loading') {
    return <CompareSkeleton matchup={params.has('a') && params.has('b')} />
  }
  if (index.status === 'error') return <ErrorState error={index.error} retry={index.retry} />
  if (pair.status === 'error') return <ErrorState error={pair.error} retry={pair.retry} />

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare</h1>
        <p className="mt-1 max-w-prose text-sm text-neutral-400">
          Any two teams on one scale, with every game they have played since 2020.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TeamPicker
          id="team-a"
          label="Team"
          teams={teams}
          value={matchup.a}
          exclude={matchup.b}
          onChange={(a) => setMatchup({ ...matchup, a })}
        />
        <span aria-hidden className="hidden pb-2.5 text-sm text-muted sm:block">
          vs
        </span>
        <TeamPicker
          id="team-b"
          label="Opponent"
          teams={teams}
          value={matchup.b}
          exclude={matchup.a}
          onChange={(b) => setMatchup({ ...matchup, b })}
        />
      </div>

      {/* One live region for the whole result, so choosing a team announces
          what is now on screen instead of nothing. */}
      <div aria-live="polite">
        {!both ? (
          <Prompt chosen={matchup.a ?? matchup.b} />
        ) : pair.status === 'loading' || pair.data === null ? (
          <MatchupSkeleton />
        ) : (
          <Comparison pair={pair.data} />
        )}
      </div>
    </div>
  )
}

function Prompt({ chosen }: { chosen: string | null }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-neutral-800 py-16 text-center">
      <p className="text-sm text-neutral-300">
        {chosen ? 'Choose a second team to compare.' : 'Choose two teams to compare.'}
      </p>
      <p className="mx-auto mt-2 max-w-prose text-xs text-muted">
        Offense and defense are drawn on one shared scale, so the bars can be read against each
        other rather than against a printed range alone.
      </p>
    </div>
  )
}

function Comparison({ pair }: { pair: NonNullable<Pair> }) {
  const { a, b, between } = pair
  const colorA = teamAccent(BAR_TRACK, a.primaryColor, a.secondaryColor)
  const colorB = teamAccent(BAR_TRACK, b.primaryColor, b.secondaryColor)
  const series = seriesRecord(between, a.id)

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="teams-heading">
        <h2 id="teams-heading" className="sr-only">
          {a.name} against {b.name}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Identity team={a} color={colorA} />
          <Identity team={b} color={colorB} />
        </div>
      </section>

      <section aria-labelledby="offense-heading">
        <h2 id="offense-heading" className="mb-2 text-lg font-bold tracking-tight">
          Offense
        </h2>
        <MetricPanel a={a} b={b} colorA={colorA} colorB={colorB} unit="offense" />
      </section>

      <section aria-labelledby="defense-heading">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="defense-heading" className="text-lg font-bold tracking-tight">
            Defense
          </h2>
          <span className="text-[11px] text-muted">lower is better</span>
        </div>
        <MetricPanel a={a} b={b} colorA={colorA} colorB={colorB} unit="defense" lowerIsBetter />
      </section>

      <section aria-labelledby="h2h-heading">
        <h2 id="h2h-heading" className="mb-2 text-lg font-bold tracking-tight">
          Head to head
        </h2>
        <HeadToHead a={a} b={b} games={between} record={series} />
      </section>
    </div>
  )
}

function Identity({ team, color }: { team: Team; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <span
        aria-hidden
        className="h-10 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <img
        src={logoAt(team.logo, 40)}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 object-contain"
      />
      <div className="min-w-0 flex-1">
        <Link
          to={`/team/${team.id}`}
          className="text-sm font-semibold text-neutral-100 hover:text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          {team.name}
        </Link>
        <p className="text-xs text-muted">
          {team.division} · last season {recordLabel(team.lastSeason)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-bold tabular-nums text-neutral-100">
          {team.projectedWins.toFixed(1)}
        </p>
        <p className="text-[10px] tracking-wide text-muted uppercase">projected</p>
      </div>
    </div>
  )
}

function MetricPanel({
  a,
  b,
  colorA,
  colorB,
  unit,
  lowerIsBetter,
}: {
  a: Team
  b: Team
  colorA: string
  colorB: string
  unit: 'offense' | 'defense'
  lowerIsBetter?: boolean
}) {
  const lineA = a.stats?.[unit]
  const lineB = b.stats?.[unit]

  return (
    <div className="divide-y divide-neutral-800/60 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-1">
      {TEAM_METRICS.map((metric) => (
        <CompareMetric
          key={metric.key}
          metric={metric}
          lowerIsBetter={lowerIsBetter}
          a={{ id: a.id, value: lineA?.[metric.key], color: colorA }}
          b={{ id: b.id, value: lineB?.[metric.key], color: colorB }}
        />
      ))}
    </div>
  )
}

function HeadToHead({
  a,
  b,
  games,
  record,
}: {
  a: Team
  b: Team
  games: readonly GameSummary[]
  record: { wins: number; losses: number; ties: number }
}) {
  if (games.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        {a.id} and {b.id} have not met in this dataset&rsquo;s six seasons.
      </p>
    )
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-400">
        {games.length} {games.length === 1 ? 'meeting' : 'meetings'} since 2020 ·{' '}
        <span className="font-semibold text-neutral-200 tabular-nums">
          {a.id} {recordLabel(record)}
        </span>{' '}
        · every game opens its replay
      </p>

      <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
        {games.map((game) => {
          const winner = winnerOf(game)
          const homeWon = winner === game.home
          return (
            <li key={game.gameId}>
              <Link
                to={`/game/${game.gameId}`}
                className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400 sm:gap-4 sm:px-4"
              >
                <span className="w-10 shrink-0 text-xs text-muted tabular-nums">{game.season}</span>
                <span className="hidden w-20 shrink-0 text-xs text-muted sm:block">
                  {weekLabel(game)}
                </span>
                <span className="hidden w-12 shrink-0 text-xs text-muted sm:block">
                  {shortDate(game.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200 tabular-nums">
                  <span className={homeWon ? 'font-semibold text-neutral-100' : ''}>
                    {game.home} {game.homeScore}
                  </span>
                  <span className="text-muted"> – </span>
                  <span className={winner === game.away ? 'font-semibold text-neutral-100' : ''}>
                    {game.awayScore} {game.away}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {winner === null ? 'tie' : `${winner} won`}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xs text-muted">
        Home team first. {a.id} and {b.id} are compared on this season&rsquo;s stat lines; the
        meetings span 2020&ndash;2025.
      </p>
    </div>
  )
}
