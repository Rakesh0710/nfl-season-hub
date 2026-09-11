/**
 * The team page.
 *
 * Sections are laid out in one scroll rather than behind tabs, with an anchor
 * nav for jumping. Games come first: they are the route into the replay, which
 * is the point of the whole application.
 */

import { domAnimation, LazyMotion, m, useReducedMotion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import DepthChart from '@/components/DepthChart'
import DraftClass from '@/components/DraftClass'
import GamesList from '@/components/GamesList'
import Roster from '@/components/Roster'
import { ErrorState } from '@/components/States'
import { TeamSkeleton } from '@/components/Skeletons'
import TeamHeader from '@/components/TeamHeader'
import TeamStats from '@/components/TeamStats'
import { BAR_TRACK, teamAccent } from '@/lib/colors'
import { getMeta, getTeam, getTeamsIndex } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'
import type { Meta, Team, TeamSummary } from '@/types/nfl'

const SECTIONS = [
  { id: 'games', label: 'Games' },
  { id: 'stats', label: 'Team stats' },
  { id: 'depth', label: 'Depth chart' },
  { id: 'roster', label: 'Roster' },
  { id: 'draft', label: 'Draft class' },
]

type TeamPageData = { team: Team; teamsById: Map<string, TeamSummary> }

export default function TeamPage() {
  const { id = '' } = useParams<{ id: string }>()
  const teamId = id.toUpperCase()

  // The index is already cached if the visitor arrived from the dashboard; it
  // supplies opponent names and logos for the games list.
  // Already in the request cache: the footer fetches it on every page.
  const meta = useAsync<Meta>('meta', getMeta)
  const state = useAsync<TeamPageData>(`team/${teamId}`, async () => {
    const [team, index] = await Promise.all([getTeam(teamId), getTeamsIndex()])
    return { team, teamsById: new Map(index.map((t) => [t.id, t])) }
  })

  if (state.status === 'loading') return <TeamSkeleton />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const { team, teamsById } = state.data
  const accent = teamAccent(BAR_TRACK, team.primaryColor, team.secondaryColor)

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-10">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link to="/" className="hover:text-neutral-300">
            League
          </Link>
          <span aria-hidden> / </span>
          <span className="text-neutral-300">{team.name}</span>
        </nav>

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
          <TeamStats
            stats={team.stats}
            color={accent}
            season={meta.status === 'success' ? meta.data.displaySeason : undefined}
          />
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
    </LazyMotion>
  )
}

/**
 * A section that fades up the first time it is scrolled to.
 *
 * The reveal can only ever add opacity, never withhold it: the element is
 * rendered in place with its final layout, and a visitor who prefers reduced
 * motion — or whose browser never fires the observer — sees it immediately.
 * `once` means scrolling back up does not replay anything.
 */
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
