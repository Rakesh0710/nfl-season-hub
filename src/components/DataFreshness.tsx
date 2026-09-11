/**
 * When the data was last generated, in the footer of every page.
 *
 * Loaded lazily by the layout. The shell is in the entry chunk, so importing
 * the data layer here directly would pull the fetch and contract code in front
 * of every first paint for a line of text nobody is waiting on — the same
 * reasoning that keeps the motion runtime out of the entry chunk.
 *
 * It renders nothing at all if the file is missing or unreadable. A footer
 * note is not worth an error state, and a wrong freshness claim is worse than
 * none.
 *
 * Freshness and span only. What the figures actually describe is explained on
 * the page showing them, where someone reading a number can see it.
 */

import { getMeta } from '@/lib/data'
import { refreshedAgo, seasonRange } from '@/lib/season'
import { useAsync } from '@/lib/useAsync'
import type { Meta } from '@/types/nfl'

export default function DataFreshness() {
  const state = useAsync<Meta>('meta', getMeta)
  if (state.status !== 'success') return null

  const meta = state.data
  return (
    <p className="mt-1">
      Refreshed {refreshedAgo(meta.generatedAt)} —{' '}
      {/* The exact instant lives on the element, so the coarse wording above is
          never the only record of it. */}
      <time dateTime={meta.generatedAt}>
        {new Date(meta.generatedAt).toISOString().slice(0, 10)}
      </time>
      . Seasons {seasonRange(meta)}.
    </p>
  )
}
