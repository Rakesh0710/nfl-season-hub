/**
 * The league dashboard.
 *
 * Six seasons of it. Identity comes from `teams-index.json` and every season's
 * record from `standings.json` — 2.6 KB gzipped for all 192 rows, held at once
 * so that changing season is a re-render and not a fetch, the same reason
 * sorting and filtering never touch the network either.
 */

import { domAnimation, LazyMotion, m, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import LeagueControls from '@/components/LeagueControls'
import SeasonTabs from '@/components/SeasonTabs'
import { ErrorState } from '@/components/States'
import { LeagueSkeleton } from '@/components/Skeletons'
import TeamCard from '@/components/TeamCard'
import { getMeta, getStandings, getTeamsIndex } from '@/lib/data'
import {
  DEFAULT_VIEW,
  describeView,
  divisionsByConference,
  filterTeams,
  seasonsIn,
  sortTeams,
  teamsInSeason,
  viewFromParams,
  viewToParams,
  type LeagueView,
} from '@/lib/league'
import { describeCoverage, needsCoverageNotice } from '@/lib/season'
import { useAsync } from '@/lib/useAsync'
import type { Meta, SeasonRecord, TeamSeasonView, TeamSummary } from '@/types/nfl'

type LeagueData = { teams: TeamSummary[]; standings: SeasonRecord[]; meta: Meta | null }

export default function LeaguePage() {
  /**
   * Three files, one frame, and `meta.json` allowed to fail.
   *
   * `allSettled`, not `all`. The freshness file supplies the season to open on
   * and the coverage note; neither is load-bearing, because the seasons
   * themselves come from the standings — the data actually being shown. An
   * earlier version had it in `Promise.all` and a 0.2 KB file could take the
   * whole dashboard down, which an end-to-end test that aborts the request
   * caught at once.
   *
   * Fetching it separately fixed that and bought a layout shift instead: the
   * coverage note lands above the controls, so arriving a frame later pushed
   * the season tabs, the controls and the whole grid down 50 px. Measured at
   * 0.026 on the run where meta was slowest, and reproducible by delaying that
   * one request. Settling all three together means the page paints once.
   */
  const state = useAsync<LeagueData>('league', async () => {
    const [teams, standings, meta] = await Promise.all([
      getTeamsIndex(),
      getStandings(),
      getMeta().catch(() => null),
    ])
    return { teams, standings, meta }
  })
  const [params, setParams] = useSearchParams()

  const data = state.status === 'success' ? state.data : undefined

  // The view lives in the query string, so a filtered dashboard is shareable
  // and survives a refresh. Unknown values fall back to the default.
  const divisions = useMemo(
    () => (data ? [...divisionsByConference(data.teams).values()].flat() : []),
    [data],
  )
  const seasons = useMemo(() => (data ? seasonsIn(data.standings) : []), [data])
  const view = useMemo(
    () => viewFromParams(params, divisions, seasons),
    [params, divisions, seasons],
  )
  const setView = (next: LeagueView) => setParams(viewToParams(next), { replace: true })

  const displayed = data?.meta?.displaySeason
  const opensOn = displayed !== undefined && seasons.includes(displayed) ? displayed : seasons[0]
  const season = view.season ?? opensOn ?? 0
  const inSeason = useMemo(
    () => (data ? teamsInSeason(data.teams, data.standings, season) : []),
    [data, season],
  )

  // Recomputed only when the data or the view changes, so interacting with the
  // controls never re-sorts more than once and never touches the network.
  const visible = useMemo(() => sortTeams(filterTeams(inSeason, view), view), [inSeason, view])

  if (state.status === 'loading') return <LeagueSkeleton />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const { meta } = state.data
  const total = inSeason.length

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">League</h1>
        <p className="mt-1 max-w-prose text-sm text-neutral-400">
          All {total} teams, {seasons.at(-1)} to {seasons[0]}. Choose a season to see how it went,
          or a team to open its roster, stats and games for that year.
        </p>
      </header>

      {meta && needsCoverageNotice(meta) && <CoverageNotice meta={meta} />}

      {/* Above the sort and filter controls, because it changes what every
          number below means rather than which of them are shown. */}
      <div className="mt-4">
        <SeasonTabs
          seasons={seasons}
          value={season}
          onChange={(next) => setView({ ...view, season: next })}
          label="Season"
        />
      </div>

      <LeagueControls teams={state.data.teams} view={view} onChange={setView} />

      {/* A heading, not a paragraph: the cards below are h3, and without a
          level between them and the page title the outline skipped h1 to h3.
          It keeps announcing itself when the filters change. */}
      <h2 aria-live="polite" className="mt-4 text-sm font-normal text-neutral-400">
        {describeView(view, visible.length, total, season)}
      </h2>

      {visible.length === 0 ? (
        <EmptyState onReset={() => setView({ ...DEFAULT_VIEW, season: view.season })} />
      ) : view.sort === 'division' ? (
        <GroupedTeams teams={visible} />
      ) : (
        <TeamGrid teams={visible} />
      )}

      <p className="mt-10 max-w-prose text-xs text-muted">
        Expected wins are market-implied: each game&rsquo;s closing point spread is converted to a
        win probability and summed across the regular season. They are not a preseason Vegas
        over/under, which nflverse stopped publishing after 2020. Read against the record beside
        them, the gap is how far a season ran ahead of or behind what the market priced.
      </p>
    </div>
  )
}

/**
 * One animated grid. Keys are team ids, so re-sorting reorders the existing
 * DOM rather than remounting — the entrance animation does not replay.
 *
 * `LazyMotion` with only the DOM feature set, plus the lightweight `m`
 * components, keeps Framer Motion from pulling its full runtime into the
 * dashboard chunk. `strict` makes using a heavier `motion.*` component here a
 * runtime error rather than a silent regression.
 */
function TeamGrid({ teams }: { teams: TeamSeasonView[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <LazyMotion features={domAnimation} strict>
      <m.ul
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        initial={reduceMotion ? 'visible' : 'hidden'}
        animate="visible"
        variants={{
          // 32 cards finish in well under half a second, and they stay
          // interactive throughout because only opacity and transform animate.
          visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.012 } },
        }}
      >
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </m.ul>
    </LazyMotion>
  )
}

/** Division sort earns a heading per division — that is what makes it useful. */
function GroupedTeams({ teams }: { teams: TeamSeasonView[] }) {
  const groups = teams.reduce<Map<string, TeamSeasonView[]>>((acc, team) => {
    const list = acc.get(team.division) ?? []
    list.push(team)
    acc.set(team.division, list)
    return acc
  }, new Map())

  return (
    <div className="mt-4 space-y-8">
      {[...groups].map(([division, members]) => {
        const slug = division.replace(/\s+/g, '-')
        return (
          <section key={division} aria-labelledby={`div-${slug}`}>
            <h2
              id={`div-${slug}`}
              className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase"
            >
              {division}
            </h2>
            <TeamGrid teams={members} />
          </section>
        )
      })}
    </div>
  )
}

/**
 * What these figures cover, when that is not simply "the season".
 *
 * Shown above the controls rather than in a footnote: it changes how every
 * number below it should be read, and a reader who has already drawn a
 * conclusion from a partial stat line has been misled whatever the small print
 * says. It is not an alert — nothing is wrong — so it is a plain note.
 */
function CoverageNotice({ meta }: { meta: Meta }) {
  return (
    <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-300">
      {describeCoverage(meta)}
    </p>
  )
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-neutral-800 py-16 text-center">
      <p className="text-sm text-neutral-300">No teams match these filters.</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-md bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Clear filters
      </button>
    </div>
  )
}
