/**
 * The frame every page renders inside: header with the drill-down nav, the
 * main region, and the footer carrying the nflverse attribution the CC BY 4.0
 * licence requires.
 */

import { Link, NavLink, Outlet } from 'react-router-dom'

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100',
  ].join(' ')
}

export default function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-neutral-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-emerald-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-neutral-950"
      >
        Skip to content
      </a>

      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link to="/" className="text-base font-bold tracking-tight">
            NFL Season Hub
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              League
            </NavLink>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-neutral-500 sm:px-6">
          <p>
            Data from{' '}
            <a
              href="https://github.com/nflverse"
              className="text-neutral-300 underline underline-offset-2 hover:text-emerald-400"
              target="_blank"
              rel="noreferrer"
            >
              nflverse
            </a>
            , licensed{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              className="text-neutral-300 underline underline-offset-2 hover:text-emerald-400"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
            . Seasons 2020-2025. Not affiliated with the NFL.
          </p>
        </div>
      </footer>
    </div>
  )
}
