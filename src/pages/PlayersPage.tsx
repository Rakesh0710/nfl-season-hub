/**
 * Finding a player.
 *
 * The profiles existed before this page did, and were reachable only by
 * knowing to open a team, scroll to the fourth section and click a name. Two
 * thousand pages behind a path nobody would guess is the same as no pages, so
 * this is the way in: type a name.
 *
 * All of them are filtered in the browser. There is no server to ask, the
 * index is 75 KB gzipped, and filtering an array of that size is faster than
 * the keystroke that triggered it — a debounce would only add latency.
 *
 * Nothing here writes a count down: the visible totals come from the file,
 * because the data refreshes weekly and prose does not.
 */

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PlayersSkeleton } from '@/components/Skeletons'
import { ErrorState } from '@/components/States'
import { getPlayersIndex, getTeamsIndex } from '@/lib/data'
import { headshotAt } from '@/lib/logos'
import { describeSearch, positionsIn, searchPlayers, type PlayerFilter } from '@/lib/playerSearch'
import { useAsync } from '@/lib/useAsync'
import type { PlayerSummary, TeamSummary } from '@/types/nfl'

/**
 * How many results are drawn at once.
 *
 * Every one carries a headshot, and rendering them all would ask the browser
 * for two thousand images to satisfy a search someone is still typing. The
 * count above the list always reports the true total.
 */
const SHOWN = 60

type PlayersData = { players: PlayerSummary[]; teams: TeamSummary[] }

export default function PlayersPage() {
  const [params, setParams] = useSearchParams()
  const state = useAsync<PlayersData>('players-index', async () => {
    const [players, teams] = await Promise.all([getPlayersIndex(), getTeamsIndex()])
    return { players, teams }
  })

  /**
   * The text box owns its own value; the URL mirrors it.
   *
   * Driving a text input from the query string looks tidy and drops
   * characters: `setSearchParams` is a navigation, so on a fast typist every
   * keystroke handler reads a filter from a render that has not happened yet
   * and writes over the one before it. Typing "garrett" left "t" in the box.
   * The two selects are still URL-driven — one change per interaction cannot
   * race itself.
   */
  const [query, setQuery] = useState(() => params.get('q') ?? '')

  const filter = useMemo<PlayerFilter>(
    () => ({ query, team: params.get('team'), position: params.get('pos') }),
    [query, params],
  )

  function mirror(next: URLSearchParams) {
    setParams(next, { replace: true })
  }

  function onQuery(value: string) {
    setQuery(value)
    const out = new URLSearchParams(params)
    if (value.trim()) out.set('q', value)
    else out.delete('q')
    mirror(out)
  }

  function onFacet(key: 'team' | 'pos', value: string | null) {
    const out = new URLSearchParams(params)
    if (value) out.set(key, value)
    else out.delete(key)
    mirror(out)
  }

  const players = state.status === 'success' ? state.data.players : undefined
  const results = useMemo(() => (players ? searchPlayers(players, filter) : []), [players, filter])

  if (state.status === 'loading') return <PlayersSkeleton />
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />

  const { teams } = state.data
  const total = state.data.players.length
  const byId = new Map(teams.map((team) => [team.id, team]))
  const positions = positionsIn(state.data.players)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Players</h1>
        {/* Counted from the file rather than written down: the data refreshes
            weekly, and a sentence with a number in it goes stale silently. */}
        <p className="mt-1 max-w-prose text-sm text-neutral-400">
          Every player nflverse records production for — {total.toLocaleString()} of them. Offensive
          linemen are mostly missing, because the dataset records a statistic for one only when he
          catches a pass or recovers a fumble.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="player-search"
            className="mb-1.5 block text-[11px] tracking-widest text-muted uppercase"
          >
            Search
          </label>
          <input
            id="player-search"
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Mahomes, Ja'Marr, Garrett…"
            autoComplete="off"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          />
        </div>

        <Select
          id="player-team"
          label="Team"
          value={filter.team}
          onChange={(team) => onFacet('team', team)}
          options={teams.map((team) => [team.id, team.name])}
          anyLabel="All teams"
        />

        <Select
          id="player-position"
          label="Position"
          value={filter.position}
          onChange={(position) => onFacet('pos', position)}
          options={positions.map((p) => [p, p])}
          anyLabel="All positions"
        />
      </div>

      <h2 aria-live="polite" className="mt-4 text-sm font-normal text-neutral-400">
        {describeSearch(filter, results.length, total)}
      </h2>

      {results.length === 0 ? (
        <EmptyState
          total={total}
          onReset={() => {
            setQuery('')
            mirror(new URLSearchParams())
          }}
        />
      ) : (
        <>
          {/* Above the list, not below it. The heading counts every match and
              the list holds sixty; someone reading top to bottom — a screen
              reader especially — needs that said before the list, not after
              they have walked it. */}
          {results.length > SHOWN && (
            <p className="mt-2 text-xs text-muted">
              Showing the first {SHOWN} of {results.length.toLocaleString()}. Keep typing, or filter
              by team or position, to narrow it.
            </p>
          )}
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.slice(0, SHOWN).map((player) => (
              <li key={player.id}>
                <Result player={player} team={byId.get(player.team)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  options: [string, string][]
  anyLabel: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] tracking-widest text-muted uppercase">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-40"
      >
        <option value="">{anyLabel}</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

function Result({ player, team }: { player: PlayerSummary; team: TeamSummary | undefined }) {
  return (
    <Link
      to={`/player/${player.id}`}
      className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-2.5 transition-colors hover:border-neutral-600 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
    >
      {/* Lazy, so a search that matches two thousand people fetches only the
          faces actually on screen. */}
      {player.headshot ? (
        <img
          src={headshotAt(player.headshot, 36)}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          className="size-9 shrink-0 rounded-full bg-neutral-800 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-bold text-neutral-500"
        >
          {player.position}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-neutral-100">{player.name}</span>
        <span className="block truncate text-xs text-muted">
          {player.position} · {team?.name ?? player.team}
        </span>
      </span>
    </Link>
  )
}

function EmptyState({ total, onReset }: { total: number; onReset: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-neutral-800 py-16 text-center">
      <p className="text-sm text-neutral-300">No players match.</p>
      <p className="mx-auto mt-2 max-w-prose text-xs text-muted">
        Only players with recorded production have a page, and {total.toLocaleString()} do. Most
        offensive linemen are not here: the dataset measures nothing individual for them.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-md bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Clear search
      </button>
    </div>
  )
}
