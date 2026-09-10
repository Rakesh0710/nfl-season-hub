/**
 * Sort and filter controls for the league dashboard.
 *
 * Conference and division are dependent: narrowing the conference clears a
 * division that no longer belongs to it, so the two can never contradict each
 * other and produce an empty grid by accident.
 */

import {
  DEFAULT_DIRECTION,
  divisionsByConference,
  SORT_LABELS,
  type LeagueView,
  type SortKey,
} from '@/lib/league'
import type { Conference, TeamSummary } from '@/types/nfl'

const SORTS: SortKey[] = ['projected', 'record', 'division']
const CONFERENCES: (Conference | 'ALL')[] = ['ALL', 'AFC', 'NFC']

function segment(active: boolean) {
  return [
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
    active
      ? 'bg-neutral-100 text-neutral-900'
      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
  ].join(' ')
}

export default function LeagueControls({
  teams,
  view,
  onChange,
}: {
  teams: readonly TeamSummary[]
  view: LeagueView
  onChange: (next: LeagueView) => void
}) {
  const byConference = divisionsByConference(teams)
  const divisions =
    view.conference === 'ALL'
      ? [...byConference.values()].flat()
      : (byConference.get(view.conference) ?? [])

  function setConference(conference: Conference | 'ALL') {
    const stillValid =
      view.division !== 'ALL' &&
      (conference === 'ALL' || (byConference.get(conference) ?? []).includes(view.division))
    onChange({ ...view, conference, division: stillValid ? view.division : 'ALL' })
  }

  function setSort(sort: SortKey) {
    // Re-picking the active sort flips direction, which is the behaviour a
    // sortable column header trains people to expect.
    onChange(
      sort === view.sort
        ? { ...view, direction: view.direction === 'desc' ? 'asc' : 'desc' }
        : { ...view, sort, direction: DEFAULT_DIRECTION[sort] },
    )
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[11px] tracking-widest text-neutral-500 uppercase">
          Sort by
        </legend>
        <div className="flex flex-wrap gap-1 rounded-lg border border-neutral-800 p-1">
          {SORTS.map((key) => {
            const active = view.sort === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setSort(key)}
                className={segment(active)}
              >
                {SORT_LABELS[key]}
                {active && (
                  <span aria-hidden className="ml-1.5 inline-block">
                    {view.direction === 'desc' ? '↓' : '↑'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <fieldset>
          <legend className="mb-1.5 text-[11px] tracking-widest text-neutral-500 uppercase">
            Conference
          </legend>
          <div className="flex gap-1 rounded-lg border border-neutral-800 p-1">
            {CONFERENCES.map((conference) => (
              <button
                key={conference}
                type="button"
                aria-pressed={view.conference === conference}
                onClick={() => setConference(conference)}
                className={segment(view.conference === conference)}
              >
                {conference === 'ALL' ? 'All' : conference}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="division"
            className="mb-1.5 block text-[11px] tracking-widest text-neutral-500 uppercase"
          >
            Division
          </label>
          <select
            id="division"
            value={view.division}
            onChange={(event) => onChange({ ...view, division: event.target.value })}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-48"
          >
            <option value="ALL">All divisions</option>
            {divisions.map((division) => (
              <option key={division} value={division}>
                {division}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
