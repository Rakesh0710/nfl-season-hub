/**
 * Choosing one of the 32 teams.
 *
 * A native `<select>` rather than a custom combobox: 32 options grouped by
 * division is exactly what the platform control is for, and it arrives with
 * keyboard support, type-ahead and a phone's native picker already correct.
 *
 * The team already chosen on the other side is disabled rather than hidden, so
 * the list does not change length depending on what you picked first.
 */

import { divisionsByConference } from '@/lib/league'
import type { TeamSummary } from '@/types/nfl'

export default function TeamPicker({
  id,
  label,
  teams,
  value,
  exclude,
  onChange,
}: {
  id: string
  label: string
  teams: readonly TeamSummary[]
  value: string | null
  /** The other side's team, which cannot be picked here as well. */
  exclude?: string | null
  onChange: (id: string | null) => void
}) {
  const byDivision = [...divisionsByConference(teams).values()].flat()

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1.5 block text-[11px] tracking-widest text-muted uppercase">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <option value="">Choose a team…</option>
        {byDivision.map((division) => (
          <optgroup key={division} label={division}>
            {teams
              .filter((team) => team.division === division)
              .sort((x, y) => x.name.localeCompare(y.name))
              .map((team) => (
                <option key={team.id} value={team.id} disabled={team.id === exclude}>
                  {team.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
