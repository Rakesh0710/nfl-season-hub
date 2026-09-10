/**
 * Bridges the promise-based data layer to React, so pages describe *what* they
 * need and never manage fetch lifecycles themselves.
 */

import { useEffect, useRef, useState } from 'react'
import { DataError } from '@/lib/data'

/** A request is always in exactly one of these states. */
export type AsyncState<T> =
  { status: 'loading' } | { status: 'error'; error: DataError } | { status: 'success'; data: T }

/** A settled result, tagged with the key it belongs to. */
type Settled<T> = { key: string; state: AsyncState<T> }

function toDataError(cause: unknown): DataError {
  if (cause instanceof DataError) return cause
  return new DataError('network', '', cause instanceof Error ? cause.message : 'Unknown error')
}

/**
 * Loads data whenever `key` changes and reports the result as a discriminated
 * union, so a component cannot read `data` without proving it succeeded.
 *
 * `key` identifies the resource, mirroring the URL key the data cache uses.
 * Keying on a string rather than a dependency array keeps the effect
 * statically analysable and makes an accidental refetch loop impossible.
 *
 * Loading is *derived*, not stored: a result tagged with a stale key simply
 * reads as loading. That avoids a redundant render on every key change, and
 * it is also what stops a slow request for one team from overwriting a fast
 * one for the next.
 */
export function useAsync<T>(key: string, load: () => Promise<T>): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  // `load` is a fresh closure every render, but only `key` should trigger a
  // refetch. This effect is declared first so the ref is current before the
  // fetch below reads it.
  const latestLoad = useRef(load)
  useEffect(() => {
    latestLoad.current = load
  })

  useEffect(() => {
    let active = true

    latestLoad
      .current()
      .then((data) => {
        if (active) setSettled({ key, state: { status: 'success', data } })
      })
      .catch((cause: unknown) => {
        if (active) setSettled({ key, state: { status: 'error', error: toDataError(cause) } })
      })

    return () => {
      active = false
    }
  }, [key])

  return settled?.key === key ? settled.state : { status: 'loading' }
}
