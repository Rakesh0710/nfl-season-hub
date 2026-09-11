/**
 * The league dashboard — the season-outlook screen.
 *
 * Teams are fetched once and cached by the data layer; sorting and filtering
 * are pure derivations of that array, so neither ever touches the network.
 */

import { domAnimation, LazyMotion, m, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import LeagueControls from '@/components/LeagueControls'
import { ErrorState } from '@/components/States'
import { LeagueSkeleton } from '@/components/Skeletons'
import TeamCard from '@/components/TeamCard'
import { getMeta, getTeamsIndex } from '@/lib/data'
import {
  DEFAULT_VIEW,
  describeView,
  divisionsByConference,
  filterTeams,
  sortTeams,
  viewFromParams,
  viewToParams,
  type LeagueView,
} from '@/lib/league'
import { describeCoverage, needsCoverageNotice } from '@/lib/season'
import { useAsync } from '@/lib/useAsync'
import type { Meta, TeamSummary } from '@/types/nfl'

export default function LeaguePage() {
  const state = useAsync<TeamSummary[]>('teams-index', getTeamsIndex)
  const meta = useAsync<Meta>('meta', getMeta)
  const [params, setParams] = useSearchParams()

  const teams = state.status === 'success' ? state.data : undefined

  // The view lives in the query string, so a filtered dashboard is shareable
  // and survives a refresh. Unknown values fall back to the default.
  const divisions = useMemo(
    () => (teams ? [...divisionsByConference(teams).values()].flat() : []),
    [teams],
  )
  const view = useMemo(() => viewFromParams(params, divisions), [params, divisions])
  const setView = (next: LeagueView) => setParams(viewToParams(next), { replace: true })

  // Recomputed only when the data or the view changes, so interacting with the
  // controls never re-sorts more than once and never touches the network.
  const visible = useMemo(
    () => (teams ? sortTeams(filterTeams(teams, view), view) : []),
    [teams, view],
  )

  if (state.status === 'loading') return <LeagueSkeleton />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const total = state.data.length

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">League</h1>
        <p className="mt-1 max-w-prose text-sm text-neutral-400">
          All {total} teams by season outlook. Choose a team to open its roster, stats and games.
        </p>
      </header>

      {meta.status === 'success' && needsCoverageNotice(meta.data) && (
        <CoverageNotice meta={meta.data} />
      )}

      <LeagueControls teams={state.data} view={view} onChange={setView} />

      {/* A heading, not a paragraph: the cards below are h3, and without a
          level between them and the page title the outline skipped h1 to h3.
          It keeps announcing itself when the filters change. */}
      <h2 aria-live="polite" className="mt-4 text-sm font-normal text-neutral-400">
        {describeView(view, visible.length, total)}
      </h2>

      {visible.length === 0 ? (
        <EmptyState onReset={() => setView(DEFAULT_VIEW)} />
      ) : view.sort === 'division' ? (
        <GroupedTeams teams={visible} />
      ) : (
        <TeamGrid teams={visible} />
      )}

      <p className="mt-10 max-w-prose text-xs text-muted">
        Projected wins are market-implied: each game&rsquo;s closing point spread is converted to a
        win probability and summed across the regular season. They are not a preseason Vegas
        over/under, which nflverse stopped publishing after 2020.
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
function TeamGrid({ teams }: { teams: TeamSummary[] }) {
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
function GroupedTeams({ teams }: { teams: TeamSummary[] }) {
  const groups = teams.reduce<Map<string, TeamSummary[]>>((acc, team) => {
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
