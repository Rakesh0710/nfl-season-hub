/**
 * The route table: League -> Team -> Game.
 *
 * Pages are lazily loaded so a visitor to the league dashboard never downloads
 * the replay code, which matters once Stage 5 lands.
 */

import { lazy } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'

const LeaguePage = lazy(() => import('@/pages/LeaguePage'))
const TeamPage = lazy(() => import('@/pages/TeamPage'))
const GamePage = lazy(() => import('@/pages/GamePage'))
const ComparePage = lazy(() => import('@/pages/ComparePage'))
const PlayerPage = lazy(() => import('@/pages/PlayerPage'))
const PlayersPage = lazy(() => import('@/pages/PlayersPage'))

function NotFound() {
  return (
    <div className="py-16">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-neutral-400">That route does not exist.</p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-md bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700"
      >
        Back to the league
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LeaguePage />} />
        <Route path="team/:id" element={<TeamPage />} />
        <Route path="game/:id" element={<GamePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="player/:id" element={<PlayerPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
