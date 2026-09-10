/**
 * The three things every data-backed screen has to say: still working,
 * something broke, or there is nothing here. Defined once so Stages 3-5
 * inherit consistent behaviour instead of reinventing it per page.
 */

import { Link } from 'react-router-dom'
import type { DataError } from '@/lib/data'

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 py-16 text-sm text-neutral-400"
    >
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-400"
      />
      {label}…
    </div>
  )
}

/** A dead end the user can act on: bad URL, missing file, network failure. */
export function ErrorState({ error, retry }: { error: DataError; retry?: () => void }) {
  const notFound = error.kind === 'not-found'
  return (
    <div role="alert" className="py-16">
      {/* h1: this replaces the page it was rendered for, so it is the only
          heading on screen and the document would otherwise have none. */}
      <h1 className="text-lg font-semibold text-neutral-100">
        {notFound ? 'Not found' : 'Something went wrong'}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-400">
        {notFound
          ? 'That team or game is not in this dataset. It may be from a season outside 2020-2025.'
          : error.message}
      </p>
      <div className="mt-5 flex gap-3">
        <Link
          to="/"
          className="rounded-md bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
        >
          Back to the league
        </Link>
        {retry && !notFound && (
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-500"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function Empty({ message }: { message: string }) {
  return <p className="py-16 text-sm text-neutral-400">{message}</p>
}
