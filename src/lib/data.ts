/**
 * The frontend's only door to the data.
 *
 * Every fetch of a static JSON file goes through here, so components never
 * touch `fetch`, never build a URL, and never see an untyped value.
 */

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
 */
const cache = new Map<string, Promise<unknown>>()

async function request<T>(path: string): Promise<T> {
  const url = `${DATA_ROOT}/${path}`

  const existing = cache.get(url)
  if (existing) return existing as Promise<T>

  const pending = (async (): Promise<T> => {
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
      return (await response.json()) as T
    } catch {
      throw new DataError('malformed', url, `The data at ${url} is not valid JSON.`)
    }
  })()

  cache.set(url, pending)
  pending.catch(() => cache.delete(url)) // let failures be retried
  return pending
}

/** All 32 teams, for the league dashboard. */
export function getTeamsIndex(): Promise<TeamSummary[]> {
  return request<TeamSummary[]>('teams-index.json')
}

/** One team: roster, depth chart, draft class, stats and that season's games. */
export function getTeam(id: string): Promise<Team> {
  return request<Team>(`team/${encodeURIComponent(id)}.json`)
}

/** Every game across all seasons, for the game browser. */
export function getGamesIndex(): Promise<GameSummary[]> {
  return request<GameSummary[]>('games-index.json')
}

/** One game, including the ordered plays the replay animates. */
export function getGame(id: string): Promise<Game> {
  return request<Game>(`game/${encodeURIComponent(id)}.json`)
}

/** Drop cached responses. Exposed for tests and manual retries. */
export function clearDataCache(): void {
  cache.clear()
}
