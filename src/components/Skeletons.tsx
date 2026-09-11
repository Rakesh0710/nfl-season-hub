/**
 * Loading shapes that match what is about to replace them.
 *
 * A spinner tells you to wait; a skeleton tells you what you are waiting for,
 * and reserves roughly the right space so the page does not jump when the data
 * lands. Each one is a single polite status message to assistive technology —
 * the shapes themselves are hidden, since a screen reader has nothing to gain
 * from a wall of empty boxes.
 */

const BLOCK = 'motion-safe:animate-pulse rounded-md bg-neutral-800'

function Bar({ className }: { className: string }) {
  return <div aria-hidden className={`${BLOCK} ${className}`} />
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export function LeagueSkeleton() {
  return (
    <Shell label="Loading the league">
      <Bar className="h-8 w-44" />
      <Bar className="mt-3 h-4 w-full max-w-md" />
      <Bar className="mt-6 h-12 w-full" />
      <Bar className="mt-4 h-4 w-56" />
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Twelve, not thirty-two: enough to fill the first screen at any width,
            without a hundred boxes pulsing below the fold. */}
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i} className="h-36 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
            <Bar className="h-9 w-9 rounded-full" />
            <Bar className="mt-3 h-4 w-3/4" />
            <Bar className="mt-2 h-3 w-1/2" />
            <Bar className="mt-4 h-1.5 w-full rounded-full" />
          </li>
        ))}
      </ul>
    </Shell>
  )
}

export function TeamSkeleton() {
  return (
    <Shell label="Loading the team">
      <Bar className="h-4 w-40" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center">
        <div className="flex items-center gap-4">
          <Bar className="h-16 w-16 rounded-full" />
          <div className="min-w-0 flex-1">
            <Bar className="h-7 w-64 max-w-full" />
            <Bar className="mt-2 h-4 w-40" />
          </div>
        </div>
        <Bar className="h-28 w-full rounded-xl" />
      </div>
      <Bar className="mt-6 h-9 w-full max-w-xl" />
      <div className="mt-8 space-y-8">
        <Bar className="h-52 w-full rounded-xl" />
        <Bar className="h-64 w-full rounded-xl" />
      </div>
    </Shell>
  )
}

export function GameSkeleton() {
  return (
    <Shell label="Loading the game">
      <Bar className="h-4 w-44" />
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
        <Bar className="h-14 flex-1" />
        <Bar className="hidden h-4 w-10 sm:block" />
        <Bar className="h-14 flex-1" />
      </div>
      <Bar className="mt-3 h-3 w-72 max-w-full sm:mx-auto" />
      {/* The same height the chart card settles at, so the replay does not
          shove the page around when it arrives. */}
      <Bar className="mt-6 h-[30rem] w-full rounded-xl sm:h-[34rem]" />
    </Shell>
  )
}

export function CompareSkeleton({ matchup = false }: { matchup?: boolean }) {
  return (
    <Shell label="Loading the comparison">
      <Bar className="h-8 w-40" />
      <Bar className="mt-3 h-4 w-full max-w-md" />
      {/* The two pickers, which appear before either team is chosen and are
          the only part of this page that is always present. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Bar className="h-10 flex-1" />
        <Bar className="h-10 flex-1" />
      </div>
      {matchup ? <MatchupShapes /> : <Bar className="mt-6 h-40 w-full" />}
    </Shell>
  )
}

/**
 * The comparison itself, waiting for two team files and the game index.
 *
 * Sized from the real thing rather than sketched: an identity card is 77px, a
 * metric block 118px, and a stat panel is five of them. A one-line "loading"
 * here instead measured a cumulative layout shift of 0.617 when 2,394px of
 * comparison landed on top of it — six times the threshold for "good", and by
 * some distance the worst number this project has measured.
 */
function MatchupShapes() {
  return (
    <div className="mt-6 space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <Bar className="h-[77px]" />
        <Bar className="h-[77px]" />
      </div>
      {['offense', 'defense'].map((unit) => (
        <div key={unit}>
          <Bar className="h-7 w-28" />
          <div className="mt-2 rounded-xl border border-neutral-800 px-4 py-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="py-3">
                <Bar className="h-5 w-28" />
                <div className="mt-2 space-y-1.5">
                  <Bar className="h-5" />
                  <Bar className="h-5" />
                </div>
                <Bar className="mt-1 h-4" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div>
        <Bar className="h-7 w-36" />
        <Bar className="mt-3 h-5 w-80 max-w-full" />
        <Bar className="mt-3 h-80" />
      </div>
    </div>
  )
}

/** Exported for the page, which shows it once the pickers are already drawn. */
export function MatchupSkeleton() {
  return (
    <Shell label="Loading the matchup">
      <MatchupShapes />
    </Shell>
  )
}

export function PlayerSkeleton() {
  return (
    <Shell label="Loading the player">
      <Bar className="h-4 w-56" />
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Bar className="size-24 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Bar className="h-5 w-40" />
          <Bar className="mt-2 h-8 w-64 max-w-full" />
          <Bar className="mt-2 h-4 w-52 max-w-full" />
        </div>
      </div>
      <Bar className="mt-8 h-7 w-36" />
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Bar className="h-40" />
        <Bar className="h-40" />
      </div>
      <Bar className="mt-8 h-7 w-32" />
      <Bar className="mt-3 h-72" />
    </Shell>
  )
}

export function PlayersSkeleton() {
  return (
    <Shell label="Loading the players">
      <Bar className="h-8 w-32" />
      <Bar className="mt-3 h-4 w-full max-w-lg" />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Bar className="h-10 flex-1" />
        <Bar className="h-10 sm:w-40" />
        <Bar className="h-10 sm:w-40" />
      </div>
      <Bar className="mt-4 h-4 w-48" />
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i}>
            <Bar className="h-[62px]" />
          </li>
        ))}
      </ul>
    </Shell>
  )
}
