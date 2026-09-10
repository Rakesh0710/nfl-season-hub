/**
 * The team page.
 *
 * Sections are laid out in one scroll rather than behind tabs, with an anchor
 * nav for jumping. Games come first: they are the route into the replay, which
 * is the point of the whole application.
 */

import { domAnimation, LazyMotion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import DepthChart from '@/components/DepthChart'
import DraftClass from '@/components/DraftClass'
import GamesList from '@/components/GamesList'
import Roster from '@/components/Roster'
import { ErrorState, Loading } from '@/components/States'
import TeamHeader from '@/components/TeamHeader'
import TeamStats from '@/components/TeamStats'
import { accentOn } from '@/lib/colors'
import { getTeam, getTeamsIndex } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'
import type { Team, TeamSummary } from '@/types/nfl'

const SURFACE = '#0a0a0a'

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
  const state = useAsync<TeamPageData>(`team/${teamId}`, async () => {
    const [team, index] = await Promise.all([getTeam(teamId), getTeamsIndex()])
    return { team, teamsById: new Map(index.map((t) => [t.id, t])) }
  })

  if (state.status === 'loading') return <Loading label={`Loading ${teamId}`} />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const { team, teamsById } = state.data
  const accent = accentOn(SURFACE, team.primaryColor, team.secondaryColor)

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-10">
        <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
          <Link to="/" className="hover:text-neutral-300">
            League
          </Link>
          <span aria-hidden> / </span>
          <span className="text-neutral-300">{team.name}</span>
        </nav>

        <TeamHeader team={team} />

        <nav
          aria-label="Sections"
          className="flex flex-wrap gap-1 border-y border-neutral-800 py-2"
        >
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

        <Section id="games" title="Games">
          <GamesList games={team.games} teamId={team.id} teamsById={teamsById} />
        </Section>

        <Section id="stats" title="Team stats">
          <TeamStats stats={team.stats} color={accent} />
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

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-6">
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  )
}
