/**
 * One team on the league dashboard.
 *
 * The whole card is a single link, so there is exactly one tab stop per team
 * and the click target is the full surface rather than the name alone.
 */

import { m } from 'framer-motion'
import { Link } from 'react-router-dom'
import { logoAt } from '@/lib/logos'
import { BAR_TRACK, teamAccent, readableTextOn } from '@/lib/colors'
import { recordLabel } from '@/lib/league'
import type { TeamSummary } from '@/types/nfl'

/** The dashboard's win scale. Nobody projects past this, so the bar stays comparable. */
const MAX_WINS = 17

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    // An explicit tween, not Framer's default spring: the spring overshoots
    // its resting position, and 32 cards each bouncing reads as decoration
    // rather than as the content simply arriving.
    transition: { duration: 0.22, ease: 'easeOut' as const },
  },
}

export default function TeamCard({ team }: { team: TeamSummary }) {
  const accent = teamAccent(BAR_TRACK, team.primaryColor, team.secondaryColor)
  const badgeText = readableTextOn(team.primaryColor)
  const projected = team.projectedWins
  const share = Math.max(0, Math.min(1, projected / MAX_WINS))

  return (
    <m.li variants={cardVariants}>
      <Link
        to={`/team/${team.id}`}
        className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 transition-colors hover:border-neutral-600 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        {/* Team colour as an accent stripe, never behind body text. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: accent }}
        />

        <div className="flex items-center gap-3 pl-2">
          <img
            src={logoAt(team.logo, 40)}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="size-10 shrink-0 object-contain"
          />
          <div className="min-w-0">
            {/* The full name wraps rather than truncating: at four columns
                "Los Angeles Rams" and "Los Angeles Chargers" both clipped to
                "Los Angeles ..." and became indistinguishable. */}
            <h3 className="text-sm leading-tight font-semibold text-balance text-neutral-100 group-hover:text-white">
              {team.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-neutral-400">{team.division}</p>
          </div>
          {/* The one place text sits on the team colour, so the foreground is measured. */}
          <span
            className="ml-auto rounded-md px-2 py-1 text-xs font-bold tracking-wide"
            style={{ backgroundColor: team.primaryColor, color: badgeText }}
          >
            {team.id}
          </span>
        </div>

        <dl className="flex items-end justify-between gap-3 pl-2">
          <div>
            <dt className="text-[11px] tracking-wide text-muted uppercase">Last season</dt>
            <dd className="text-lg font-semibold tabular-nums">{recordLabel(team.lastSeason)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[11px] tracking-wide text-muted uppercase">Projected</dt>
            {/* One decimal is the honest precision for a market-derived
                estimate, but it makes near-neighbours look tied, so the exact
                figure stays available on hover. */}
            <dd
              className="text-lg font-semibold tabular-nums"
              title={`${projected} projected wins`}
            >
              {projected.toFixed(1)}
            </dd>
          </div>
        </dl>

        <div className="pl-2">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-neutral-800"
            role="img"
            aria-label={`${projected.toFixed(1)} projected wins out of ${MAX_WINS}`}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${share * 100}%`, backgroundColor: accent }}
            />
          </div>
        </div>
      </Link>
    </m.li>
  )
}
