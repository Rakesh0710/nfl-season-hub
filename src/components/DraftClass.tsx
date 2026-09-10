/**
 * The team's draft class. `pick` is the overall selection number, not the
 * pick within the round, so it is labelled accordingly.
 */

import { orDash } from '@/lib/football'
import type { DraftPick } from '@/types/nfl'

export default function DraftClass({ picks }: { picks: readonly DraftPick[] }) {
  if (picks.length === 0) {
    return <p className="text-sm text-neutral-400">No draft picks recorded for this season.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Draft class, in selection order</caption>
        <thead>
          <tr className="border-b border-neutral-800 text-[11px] tracking-widest text-muted uppercase">
            <th scope="col" className="px-3 py-2 font-medium">
              Rd
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Overall
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Player
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Pos
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              College
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/60">
          {picks.map((pick) => (
            <tr key={`${pick.round}-${pick.pick}-${pick.player}`}>
              <td className="px-3 py-2 text-neutral-400 tabular-nums">{orDash(pick.round)}</td>
              <td className="px-3 py-2 text-neutral-400 tabular-nums">{orDash(pick.pick)}</td>
              <td className="px-3 py-2 font-medium text-neutral-100">{orDash(pick.player)}</td>
              <td className="px-3 py-2 text-neutral-400">{orDash(pick.position)}</td>
              <td className="px-3 py-2 text-neutral-400">{orDash(pick.college)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
