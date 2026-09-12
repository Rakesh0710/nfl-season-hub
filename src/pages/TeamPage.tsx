/**
 * The team page.
 *
 * Sections are laid out in one scroll rather than behind tabs, with an anchor
 * nav for jumping. Games come first: they are the route into the replay, which
 * is the point of the whole application.
 */

import { domAnimation, LazyMotion, m, useReducedMotion } from 'framer-motion'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import DepthChart from '@/components/DepthChart'
import DraftClass from '@/components/DraftClass'
import GamesList from '@/components/GamesList'
import SeasonTabs from '@/components/SeasonTabs'
import Roster from '@/components/Roster'
import { ErrorState } from '@/components/States'
import { TeamBodySkeleton } from '@/components/Skeletons'
import TeamHeader from '@/components/TeamHeader'
import TeamStats from '@/components/TeamStats'
import { BAR_TRACK, teamAccent } from '@/lib/colors'
import { getMeta, getTeamSeason, getTeamsIndex } from '@/lib/data'
import { resolveSeason, teamSeasonsOf } from '@/lib/season'
import { useAsync } from '@/lib/useAsync'
import type { Meta, TeamSeason, TeamSummary } from '@/types/nfl'

const SECTIONS = [
  { id: 'games', label: 'Games' },
  { id: 'stats', label: 'Team stats' },
  { id: 'depth', label: 'Depth chart' },
  { id: 'roster', label: 'Roster' },
  { id: 'draft', label: 'Draft class' },
]

type TeamPageData = { team: TeamSeason; teamsById: Map<string, TeamSummary> }

export default function TeamPage() {
  const { id = '' } = useParams<{ id: string }>()
  const teamId = id.toUpperCase()
  const [params, setParams] = useSearchParams()
  const asked = params.get('season')

  /**
   * The season control outlives the season it selects.
   *
   * Changing season refetches, so if the control lived inside the loaded
   * content it would unmount while the next file arrived — and it did: pressing
   * a tab with the keyboard dropped focus to `<body>`, leaving a visitor to tab
   * in again from the top of the document. It is rendered from `meta.json`
   * instead, which does not change between seasons, so the button a person just
   * pressed is still under their finger when the page comes back.
   *
   * Both this and the fetch below resolve the season through the same
   * `resolveSeason`, so the pressed tab cannot disagree with the file on
   * screen. `meta.json` is one request either way — the footer fetches it on
   * every page and the data layer caches it.
   */
  const meta = useAsync<Meta>('meta', getMeta)
  const seasons = meta.status === 'success' ? teamSeasonsOf(meta.data) : []
  const selected = meta.status === 'success' ? resolveSeason(meta.data, asked) : undefined

  const state = useAsync<TeamPageData>(`team/${teamId}/${asked ?? 'default'}`, async () => {
    const current = await getMeta()
    // The index is already cached if the visitor arrived from the dashboard;
    // it supplies opponent names and logos for the games list.
    const [team, index] = await Promise.all([
      getTeamSeason(teamId, resolveSeason(current, asked)),
      getTeamsIndex(),
    ])
    return { team, teamsById: new Map(index.map((t) => [t.id, t])) }
  })

  const team = state.status === 'success' ? state.data.team : undefined
  const accent = team ? teamAccent(BAR_TRACK, team.primaryColor, team.secondaryColor) : BAR_TRACK

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-10">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link to="/" className="hover:text-neutral-300">
            League
          </Link>
          <span aria-hidden> / </span>
          <span className="text-neutral-300">{team?.name ?? teamId}</span>
        </nav>

        {/* Governs the whole page, not just the games below it. Every section
            describes the same year, so there is one control and no caveat
            about which parts of the page moved and which did not. */}
        {selected !== undefined && (
          <SeasonTabs
            seasons={seasons}
            value={selected}
            onChange={(next) => setParams({ season: String(next) }, { replace: true })}
            // Not the team's name. Focus now stays on this control across the
            // refetch, and the name resolves from "KC" to "Kansas City Chiefs"
            // as the file lands — renaming the group under whoever is standing
            // on it. The H1 above says whose season this is.
            label="Season"
          />
        )}

        {state.status === 'loading' ? (
          <TeamBodySkeleton />
        ) : state.status === 'error' ? (
          <ErrorState error={state.error} retry={state.retry} />
        ) : (
          <Loaded team={state.data.team} teamsById={state.data.teamsById} accent={accent} />
        )}
      </div>
    </LazyMotion>
  )
}

/** The page below the breadcrumb and the season control, once it has arrived. */
function Loaded({
  team,
  teamsById,
  accent,
}: {
  team: TeamSeason
  teamsById: Map<string, TeamSummary>
  accent: string
}) {
  return (
    <div className="space-y-10">
      <TeamHeader team={team} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-neutral-800 py-2">
        <nav aria-label="Sections" className="flex flex-wrap gap-1">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              {section.label}
            </a>
          ))}
        </nav>
        {/* The stat bars below are drawn against a printed scale because a
              team file has no league distribution in it. This is the way to
              give them a second team to be read against. */}
        <Link
          to={`/compare?a=${team.id}`}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
        >
          Compare {team.id}
        </Link>
      </div>

      <Section id="games" title="Games">
        <GamesList games={team.games} teamId={team.id} teamsById={teamsById} />
      </Section>

      <Section id="stats" title="Team stats">
        <TeamStats stats={team.stats} color={accent} season={team.season} />
      </Section>

      <Section id="depth" title="Depth chart">
        <DepthChart chart={team.depthChart} />
      </Section>

      <Section id="roster" title="Roster">
        <Roster players={team.roster} />
      </Section>

      <Section id="draft" title="Draft class">
        <DraftClass picks={team.draftClass} />
      </Section>
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <m.section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-6"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </m.section>
  )
}
