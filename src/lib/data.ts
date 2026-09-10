/**
 * The frontend's only door to the data.
 *
 * Every fetch of a static JSON file goes through here, so components never
 * touch `fetch`, never build a URL, and never see an untyped value.
 */

import {
  ContractError,
  parseGame,
  parseGamesIndex,
  parseTeam,
  parseTeamsIndex,
} from '@/lib/contract'
import type { Game, GameSummary, Team, TeamSummary } from '@/types/nfl'

/** Root of the generated data, honouring Vite's base path. */
const DATA_ROOT = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/data`

/** Why a request failed, in terms a UI can branch on. */
export type DataErrorKind = 'not-found' | 'network' | 'malformed'

export class DataError extends Error {
  readonly kind: DataErrorKind
  readonly url: string
  readonly status?: number

  constructor(kind: DataErrorKind, url: string, message: string, status?: number) {
    super(message)
    this.name = 'DataError'
    this.kind = kind
    this.url = url
    this.status = status
  }
}

/**
 * Cache of in-flight and settled requests, keyed by URL.
 *
 * Storing the promise rather than the resolved value means two components
 * asking for the same file during the same tick share one network request.
 * A rejected entry is evicted so a failure can be retried.
 *
 * It holds the parsed-but-unchecked JSON, not the contracted type. Handing a
 * cached `Promise<unknown>` back as a `Promise<Team>` would need an assertion
 * on every hit — the cache cannot know which parser filled the entry — so the
 * validator runs again instead, over a value already in memory. On the largest
 * file the app loads, the 239 KB index of 1,693 games, that costs 0.23ms,
 * against the 0.57ms `JSON.parse` spends on the same file. Re-checking is
 * cheaper than the assertion would have been worth.
 */
const cache = new Map<string, Promise<unknown>>()

/** Fetches a URL and returns its JSON body as `unknown`. */
function fetchJson(url: string): Promise<unknown> {
  return (async () => {
    let response: Response
    try {
      response = await fetch(url)
    } catch {
      throw new DataError('network', url, `Could not reach ${url}. Check your connection.`)
    }

    if (response.status === 404) {
      throw new DataError('not-found', url, `No data exists at ${url}.`, 404)
    }
    if (!response.ok) {
      throw new DataError('network', url, `Request for ${url} failed.`, response.status)
    }

    // A misconfigured SPA fallback answers a missing file with index.html and
    // a 200. Catching it here turns a confusing parse error into 'not-found'.
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) {
      throw new DataError(
        'not-found',
        url,
        `Expected JSON at ${url} but the server returned "${contentType}".`,
        response.status,
      )
    }

    try {
      return await response.json()
    } catch {
      throw new DataError('malformed', url, `The data at ${url} is not valid JSON.`)
    }
  })()
}

/**
 * Fetches one file and checks it against the contract.
 *
 * The parser is what turns `unknown` into the declared type — there is no
 * assertion anywhere on this path. A file that parses as JSON but disagrees
 * with the contract is a 'malformed' error naming the field that disagreed,
 * rather than an `undefined` surfacing three components later.
 */
async function request<T>(path: string, parse: (value: unknown, at: string) => T): Promise<T> {
  const url = `${DATA_ROOT}/${path}`

  let pending = cache.get(url)
  if (!pending) {
    pending = fetchJson(url)
    cache.set(url, pending)
    pending.catch(() => cache.delete(url)) // let failures be retried
  }

  const body = await pending
  try {
    return parse(body, path)
  } catch (cause) {
    if (cause instanceof ContractError) {
      throw new DataError(
        'malformed',
        url,
        `${url} does not match the data contract — ${cause.message}`,
      )
    }
    throw cause
  }
}

/** All 32 teams, for the league dashboard. */
export function getTeamsIndex(): Promise<TeamSummary[]> {
  return request('teams-index.json', parseTeamsIndex)
}

/** One team: roster, depth chart, draft class, stats and that season's games. */
export function getTeam(id: string): Promise<Team> {
  return request(`team/${encodeURIComponent(id)}.json`, parseTeam)
}

/** Every game across all seasons, for the game browser. */
export function getGamesIndex(): Promise<GameSummary[]> {
  return request('games-index.json', parseGamesIndex)
}

/** One game, including the ordered plays the replay animates. */
export function getGame(id: string): Promise<Game> {
  return request(`game/${encodeURIComponent(id)}.json`, parseGame)
}

/** Drop cached responses. Exposed for tests and manual retries. */
export function clearDataCache(): void {
  cache.clear()
}
