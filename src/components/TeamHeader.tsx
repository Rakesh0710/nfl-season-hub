/**
 * Identity block for a team page: logo, name, conference and division, last
 * season's record, and the projected-win visualisation.
 */

import { BAR_TRACK, teamAccent, readableTextOn } from '@/lib/colors'
import { recordLabel } from '@/lib/league'
import ProjectedWins from '@/components/ProjectedWins'
import type { Team } from '@/types/nfl'

export default function TeamHeader({ team }: { team: Team }) {
  const accent = teamAccent(BAR_TRACK, team.primaryColor, team.secondaryColor)
  const badgeText = readableTextOn(team.primaryColor)

  return (
    <header className="grid gap-5 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center">
      <div className="flex items-center gap-4">
        <img
          src={team.logo}
          alt=""
          width={64}
          height={64}
          className="size-14 shrink-0 object-contain sm:size-16"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-xs font-bold tracking-wide"
              style={{ backgroundColor: team.primaryColor, color: badgeText }}
            >
              {team.id}
            </span>
            <span className="text-xs text-neutral-400">
              {team.conference} · {team.division}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {team.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Last season{' '}
            <span className="font-semibold text-neutral-200 tabular-nums">
              {recordLabel(team.lastSeason)}
            </span>
          </p>
        </div>
      </div>

      <ProjectedWins projected={team.projectedWins} lastSeason={team.lastSeason} color={accent} />
    </header>
  )
}
