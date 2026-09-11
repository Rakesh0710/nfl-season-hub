/**
 * One player.
 *
 * Only exists for players the dataset records production for. A page that
 * repeated a roster row with a photograph on it would not be worth a route, so
 * 2,274 of the 3,137 rostered players have one and the rest are not linked.
 * Both counts move with the weekly refresh; `validate.py` re-checks the rule,
 * not the numbers.
 *
 * Which numbers appear is decided by which numbers exist, not by the position
 * in the file — see `lib/playerStats.ts`. Mahomes has a tackle and a reception
 * in 2025, and both show.
 */

import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PlayerSkeleton } from '@/components/Skeletons'
import { ErrorState } from '@/components/States'
import SeasonTabs from '@/components/SeasonTabs'
import WeeklyTrend from '@/components/WeeklyTrend'
import { BAR_TRACK, teamAccent } from '@/lib/colors'
import { getMeta, getPlayer, getTeamsIndex } from '@/lib/data'
import { NO_VALUE, orDash } from '@/lib/football'
import { headshotAt, logoAt } from '@/lib/logos'
import { formatStat, groupsIn, primaryGroup, type StatGroup } from '@/lib/playerStats'
import { useAsync } from '@/lib/useAsync'
import type { Meta, PlayerProfile, PlayerStatLine, TeamSummary } from '@/types/nfl'

type PlayerPageData = { player: PlayerProfile; team: TeamSummary | undefined }

export default function PlayerPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const meta = useAsync<Meta>('meta', getMeta)
  const state = useAsync<PlayerPageData>(`player/${id}`, async () => {
    // The index is already cached if they arrived from a team page, and it
    // supplies the colour and logo the profile is framed in.
    const [player, index] = await Promise.all([getPlayer(id), getTeamsIndex()])
    return { player, team: index.find((t) => t.id === player.team) }
  })

  if (state.status === 'loading') return <PlayerSkeleton />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const { player, team } = state.data
  const accent = team ? teamAccent(BAR_TRACK, team.primaryColor, team.secondaryColor) : '#a3a3a3'
  const displaySeason = meta.status === 'success' ? meta.data.displaySeason : undefined

  /**
   * One season governs the stat groups and the weekly chart together.
   *
   * The file carries every season's weeks — a hundred bars for a six-season
   * career — so they have to be cut somewhere, and cutting them by the same
   * season the stat block above describes is the only cut that leaves the two
   * agreeing with each other. The career table below deliberately stays whole:
   * that is the section whose job is the long view.
   */
  const asked = Number(params.get('season'))
  const seasons = player.seasons.map((s) => s.season)
  const current =
    player.seasons.find((s) => s.season === asked) ??
    player.seasons.find((s) => s.season === displaySeason) ??
    player.seasons.at(-1)
  const weeks = player.weeks.filter((w) => w.season === current?.season)
  const chart = primaryGroup(weeks)

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link to="/" className="hover:text-neutral-300">
          League
        </Link>
        <span aria-hidden> / </span>
        <Link to={`/team/${player.team}`} className="hover:text-neutral-300">
          {team?.name ?? player.team}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-neutral-300">{player.name}</span>
      </nav>

      <Identity player={player} team={team} accent={accent} />

      {seasons.length > 1 && (
        <SeasonTabs
          seasons={[...seasons].reverse()}
          value={current?.season ?? null}
          onChange={(next) => setParams({ season: String(next) }, { replace: true })}
          label={`${player.name} season`}
        />
      )}

      {current && (
        <section aria-labelledby="season-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="season-heading" className="text-lg font-bold tracking-tight">
              {current.season} season
            </h2>
            <p className="text-xs text-muted">
              {current.games} {current.games === 1 ? 'game' : 'games'} with a recorded stat line
            </p>
          </div>
          <StatGroups line={current.stats} />
        </section>
      )}

      {chart && weeks.length > 1 && (
        <section aria-labelledby="trend-heading">
          <h2 id="trend-heading" className="mb-3 text-lg font-bold tracking-tight">
            Week by week
          </h2>
          <WeeklyTrend weeks={weeks} group={chart} color={accent} />
        </section>
      )}

      {player.seasons.length > 1 && (
        <section aria-labelledby="career-heading">
          <h2 id="career-heading" className="mb-3 text-lg font-bold tracking-tight">
            Season by season
          </h2>
          <Career player={player} chart={chart} />
        </section>
      )}
    </div>
  )
}

function Identity({
  player,
  team,
  accent,
}: {
  player: PlayerProfile
  team: TeamSummary | undefined
  accent: string
}) {
  const facts = [
    player.age !== undefined ? `Age ${player.age}` : null,
    player.height !== undefined ? feetAndInches(player.height) : null,
    player.weight !== undefined ? `${player.weight} lb` : null,
    player.experience !== undefined
      ? player.experience === 0
        ? 'Rookie'
        : `${player.experience} ${player.experience === 1 ? 'season' : 'seasons'}`
      : null,
  ].filter((part): part is string => Boolean(part))

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* The stored headshots are 3-6 MB. `headshotAt` asks the CDN for the
          size actually drawn, which is 20 KB. */}
      {player.headshot ? (
        <img
          src={headshotAt(player.headshot, 96)}
          alt=""
          width={96}
          height={96}
          className="size-24 shrink-0 rounded-full bg-neutral-900 object-cover"
          style={{ outline: `2px solid ${accent}`, outlineOffset: '2px' }}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-24 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-2xl font-bold text-neutral-600"
          style={{ outline: `2px solid ${accent}`, outlineOffset: '2px' }}
        >
          {player.position}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-neutral-900"
            style={{ backgroundColor: accent }}
          >
            {player.position}
          </span>
          {player.number !== undefined && (
            <span className="text-sm text-muted tabular-nums">#{player.number}</span>
          )}
          <Link
            to={`/team/${player.team}`}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            {team && (
              <img src={logoAt(team.logo, 18)} alt="" width={18} height={18} className="size-4.5" />
            )}
            {team?.name ?? player.team}
          </Link>
        </div>

        <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          {player.name}
        </h1>

        <p className="mt-1 text-sm text-muted">{facts.length > 0 ? facts.join(' · ') : NO_VALUE}</p>
        <p className="mt-0.5 text-xs text-muted">
          {orDash(player.college)}
          {player.draft?.year !== undefined && (
            <>
              {' · '}
              {player.draft.pick !== undefined
                ? `Drafted ${player.draft.year}, pick ${player.draft.pick}`
                : `Entered the league in ${player.draft.year}`}
              {player.draft.club ? ` by ${player.draft.club}` : ''}
            </>
          )}
        </p>
      </div>
    </header>
  )
}

/** 74 -> 6'2". */
function feetAndInches(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

function StatGroups({ line }: { line: PlayerStatLine }) {
  const groups = groupsIn(line)
  if (groups.length === 0) {
    return <p className="text-sm text-neutral-400">No recorded production in this season.</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <h3 className="text-sm font-semibold text-neutral-100">{group.title}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {group.fields
              .filter((f) => line[f.key] !== undefined)
              .map((field) => (
                <div key={field.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-muted">{field.label}</dt>
                  <dd className="text-sm font-semibold text-neutral-100 tabular-nums">
                    {formatStat(line, field)}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function Career({ player, chart }: { player: PlayerProfile; chart: StatGroup | undefined }) {
  // The columns are whatever the career as a whole contains, so a player who
  // changed role mid-career keeps both sets rather than losing the older one.
  const merged: PlayerStatLine = Object.assign({}, ...player.seasons.map((s) => s.stats))
  const fields = (
    chart ? [chart, ...groupsIn(merged).filter((g) => g.id !== chart.id)] : groupsIn(merged)
  )
    .flatMap((group) => group.fields)
    .filter((field) => merged[field.key] !== undefined)
    .slice(0, 6)

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full min-w-md border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left">
            <th scope="col" className="px-3 py-2 text-xs font-medium text-muted">
              Season
            </th>
            <th scope="col" className="px-3 py-2 text-xs font-medium text-muted">
              Team
            </th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted">
              Games
            </th>
            {fields.map((field) => (
              <th
                key={field.key}
                scope="col"
                className="px-3 py-2 text-right text-xs font-medium text-muted"
              >
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...player.seasons].reverse().map((season) => (
            <tr key={season.season} className="border-b border-neutral-800/60 last:border-0">
              <th
                scope="row"
                className="px-3 py-2 text-left font-medium text-neutral-100 tabular-nums"
              >
                {season.season}
              </th>
              <td className="px-3 py-2 text-neutral-400">
                <Link
                  to={`/team/${season.team}`}
                  className="hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                  {season.team}
                </Link>
              </td>
              <td className="px-3 py-2 text-right text-neutral-300 tabular-nums">{season.games}</td>
              {fields.map((field) => (
                <td key={field.key} className="px-3 py-2 text-right text-neutral-300 tabular-nums">
                  {formatStat(season.stats, field)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
