/**
 * The data layer's failure behaviour, which is most of its job.
 *
 * A static-file backend fails in ways an API does not: a missing file can come
 * back as an SPA fallback with a 200, and a stale deploy can serve JSON that
 * parses but no longer matches the contract. Both have to arrive at the UI as
 * something it can act on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDataCache, DataError, getGame, getTeam, getTeamsIndex } from '@/lib/data'
import { makeGame, makeLeague, makeTeam } from '@/test/fixtures'

/**
 * A real Response, not a stand-in: the layer reads the status, the headers and
 * the body, and a hand-built object would let a change to any of those pass.
 *
 * A Response body can only be read once, so every mock builds a fresh one per
 * call rather than resolving the same object twice — which is also what a
 * second real request would get.
 */
function respond(body: unknown, init: { status?: number; contentType?: string } = {}): Response {
  const { status = 200, contentType = 'application/json' } = init
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(status === 204 || status === 404 ? null : text, {
    status,
    headers: { 'content-type': contentType },
  })
}

/** A response that claims to be JSON and is not — a truncated or half-written file. */
function unparseable(): Response {
  return new Response('{"plays": [', { headers: { 'content-type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  clearDataCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function failure(promise: Promise<unknown>): Promise<DataError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof DataError) return error
    throw error
  }
  throw new Error('expected the request to fail')
}

describe('successful requests', () => {
  it('fetches from the data root and returns the contracted type', async () => {
    fetchMock.mockImplementation(async () => respond(makeLeague()))
    const teams = await getTeamsIndex()
    expect(fetchMock).toHaveBeenCalledWith('/data/teams-index.json')
    expect(teams).toHaveLength(8)
    expect(teams[0]?.conference).toBe('AFC')
  })

  it('encodes the id into the path', async () => {
    fetchMock.mockImplementation(async () => respond(makeGame()))
    await getGame('2023_12_NO_ATL')
    expect(fetchMock).toHaveBeenCalledWith('/data/game/2023_12_NO_ATL.json')
  })
})

describe('failures the UI can branch on', () => {
  it('reports a 404 as not-found', async () => {
    fetchMock.mockImplementation(async () => respond(null, { status: 404 }))
    expect((await failure(getGame('nope'))).kind).toBe('not-found')
  })

  it('reports a server error as a network failure, with the status', async () => {
    fetchMock.mockImplementation(async () => respond(null, { status: 503 }))
    const error = await failure(getGame('x'))
    expect(error.kind).toBe('network')
    expect(error.status).toBe(503)
  })

  it('reports an unreachable server as a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await failure(getTeamsIndex())).kind).toBe('network')
  })

  it('reports an SPA fallback serving index.html as not-found, not as a parse error', async () => {
    // `vite preview` answers a missing data file this way: 200, text/html.
    fetchMock.mockImplementation(async () =>
      respond('<!doctype html>', { contentType: 'text/html' }),
    )
    const error = await failure(getGame('missing'))
    expect(error.kind).toBe('not-found')
  })

  it('reports a truncated file as malformed', async () => {
    fetchMock.mockImplementation(async () => unparseable())
    expect((await failure(getTeam('KC'))).kind).toBe('malformed')
  })

  it('reports a contract violation as malformed, naming the field', async () => {
    const game = makeGame()
    fetchMock.mockImplementation(async () =>
      respond({ ...game, home: { ...game.home, finalScore: '17' } }),
    )
    const error = await failure(getGame('2023_12_NO_ATL'))
    expect(error.kind).toBe('malformed')
    expect(error.message).toContain('home.finalScore')
  })
})

describe('the request cache', () => {
  it('shares one request between callers asking at the same time', async () => {
    fetchMock.mockImplementation(async () => respond(makeLeague()))
    await Promise.all([getTeamsIndex(), getTeamsIndex(), getTeamsIndex()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves a later caller from cache', async () => {
    fetchMock.mockImplementation(async () => respond(makeTeam()))
    await getTeam('KC')
    await getTeam('KC')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps different files apart', async () => {
    fetchMock.mockImplementation(async () => respond(makeTeam()))
    await getTeam('KC')
    await getTeam('BUF')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('evicts a failure, so retrying issues a genuinely new request', async () => {
    fetchMock.mockImplementationOnce(async () => respond(null, { status: 503 }))
    await failure(getTeamsIndex())

    fetchMock.mockImplementationOnce(async () => respond(makeLeague()))
    await expect(getTeamsIndex()).resolves.toHaveLength(8)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('re-checks a cached body against the contract rather than trusting the entry', async () => {
    fetchMock.mockImplementation(async () => respond(makeTeam()))
    const first = await getTeam('KC')
    const second = await getTeam('KC')
    // Distinct objects: the second read ran the parser again over the cached
    // body instead of handing back a value the cache could not have typed.
    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })
})
