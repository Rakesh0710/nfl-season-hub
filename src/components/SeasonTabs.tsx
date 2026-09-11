/**
 * Choosing which season of a team's games to look at.
 *
 * Buttons rather than a `<select>`, unlike the team pickers on the comparison
 * page: there are seven options at most, they are one word each, and switching
 * between them is the whole interaction. A dropdown would hide six of the
 * seven and cost a click each time.
 *
 * `aria-pressed` rather than a tablist, because these do not reveal panels —
 * they filter one list that is always there. Announcing a tab that swaps
 * panels would describe something the page does not do.
 */

export default function SeasonTabs({
  seasons,
  value,
  onChange,
  label,
}: {
  /** Newest first. */
  seasons: readonly number[]
  value: number | null
  onChange: (season: number) => void
  label: string
}) {
  if (seasons.length < 2) return null

  return (
    <div
      role="group"
      aria-label={label}
      className="mb-3 flex flex-wrap gap-1 rounded-lg border border-neutral-800 p-1"
    >
      {seasons.map((season) => {
        const active = season === value
        return (
          <button
            key={season}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(season)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
              active
                ? 'bg-neutral-100 text-neutral-900'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100',
            ].join(' ')}
          >
            {season}
          </button>
        )
      })}
    </div>
  )
}
