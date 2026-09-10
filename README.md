# NFL Season Hub

A six-season NFL explorer where you drill from league standings down to any individual game
and watch its momentum replay in real time.

**League → Team → Game → Replay**

- **League dashboard** — all 32 teams, sortable by projected wins, last-season record, or division.
- **Team page** — roster, depth chart, draft class, projected win total, team stats, and that team's games.
- **Game replay** — an animated, scrubbable win-probability timeline with key plays marked, rendered
  on HTML Canvas at 60fps.

Data scope: **2020–2025** (six complete seasons).

## Architecture

No live server, no database. A Python ETL runs locally, emits small typed JSON files that are
committed to `public/data`, and the React app fetches them as static assets.

```
nflverse (raw play-by-play, rosters, draft, win totals)
        |
  [ Python ETL script — run once ]
        |
  trimmed, typed static JSON files
  (teams-index, team/<id>, games-index, game/<id>)
        |
    committed to /public/data
        |
  React + TypeScript app (fetches static JSON)
        |
    static deploy (Vercel)
```

## Tech stack

| Layer         | Choice                                | Why                                         |
| ------------- | ------------------------------------- | ------------------------------------------- |
| Data source   | nflverse (`nflreadpy`)                | Free, open, CC BY 4.0, 1999–2025            |
| ETL           | Python + pandas                       | Raw play-by-play → small, typed JSON        |
| Framework     | React + TypeScript + Vite             | Fast dev; TS as the data contract           |
| Routing       | React Router                          | Powers the League → Team → Game hierarchy   |
| Styling       | Tailwind CSS v4                       | Speed; easy theming with team colors        |
| Charts (v1)   | Recharts                              | Fast way to validate the win-prob data      |
| Replay engine | HTML Canvas + `requestAnimationFrame` | The 60fps flagship                          |
| UI animation  | Framer Motion                         | Page transitions, reveals, number count-ups |
| Linting       | oxlint + Prettier                     | Vite's current default linter               |
| Deploy        | Vercel (static)                       | No backend needed                           |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run lint       # oxlint
npm run format     # prettier --write .
```

## Project structure

```
src/
  components/   reusable UI
  pages/        route-level screens
  lib/          typed data-access layer (fetch + cache)
  types/        TypeScript interfaces mirroring the JSON contract
public/data/    ETL output (static JSON, committed)
etl/            Python ETL (own virtualenv)
```

## Build progress

- [x] **Stage 0** — Foundations & setup
- [x] **Stage 1** — Data layer (ETL)
- [x] **Stage 2** — App shell & routing
- [x] **Stage 3** — League dashboard
- [x] **Stage 4** — Team page
- [x] **Stage 5** — Game replay engine
- [x] **Stage 6** — Polish & cross-cutting
- [ ] **Stage 7** — Engineering credibility layer

## Routing and data access

Three routes — `/`, `/team/:id`, `/game/:id` — rendered inside one shared layout, with pages lazily
loaded so a league visitor never downloads the replay code.

All data access goes through [src/lib/data.ts](src/lib/data.ts). Components never call `fetch`,
never build a URL, and never see an untyped value. The cache stores the in-flight _promise_ rather
than the resolved value, so two components asking for the same file share one request; rejected
entries are evicted so failures can be retried.

`useAsync(key, load)` returns a discriminated union, so a component cannot read `data` without
first proving the request succeeded. Loading is derived from a stale key rather than stored, which
is also what prevents a slow request for one team from overwriting a fast one for the next.

### `vercel.json`

The file cannot carry comments — Vercel validates it with `additionalProperties: false`, so even a
`"comment"` key fails the build. The reasoning therefore lives here:

- **`"source": "/((?!data/).*)"`** — the SPA history fallback deliberately excludes `/data`.
  Without the exclusion a missing JSON file returns `index.html` with a 200, and the fetch layer
  reports a parse error instead of "not found". `vite preview` behaves exactly that way, which is
  why `src/lib/data.ts` _also_ rejects non-JSON content types; the two environments differ, so both
  guards are needed.
- **`stale-while-revalidate`, not `immutable`** — game files are not content-hashed and do change
  whenever the ETL is re-run, so `immutable` would strand visitors on stale data. Game files get a
  day of freshness and a week of stale-serving; the small index files get an hour.

### League dashboard

The view (sort, direction, conference, division) lives in the query string, so a filtered dashboard
is shareable and survives a refresh. Unrecognised or contradictory values fall back to defaults
rather than rendering an empty grid.

Team colours are applied by measurement, not assumption. Six teams — New Orleans, Tennessee,
Cincinnati, Cleveland, Miami and Carolina — fail WCAG AA with white text on their primary colour
(New Orleans' gold manages 1.85:1), so [src/lib/colors.ts](src/lib/colors.ts) computes the
foreground per team. Near-black primaries fall back to the secondary colour for the accent stripe,
which would otherwise be invisible on a near-black page.

Framer Motion is loaded through `LazyMotion` with only the `domAnimation` feature set, which cut
the dashboard chunk from 42.2 KB to 29.0 KB gzipped. `strict` mode makes reaching for a heavier
`motion.*` component a runtime error rather than a silent regression.

### Team page

Sections are laid out in one scroll with an anchor nav rather than behind tabs, and Games comes
first — it is the route into the replay, which is the point of the application.

Optional player fields are genuinely absent in the data: 163 players have no age and 182 no
college. `PlayerChip` builds its detail line by filtering, so a missing value leaves no separator
and no placeholder behind, and the line degrades to just a name.

nflverse returns the whole season's roster, not the 53-man active list — a team carries 95-110
names including released, reserve and practice-squad players. The roster therefore defaults to
active, with the full list one click away.

Stat bars print their scale endpoints, because a team file carries only its own numbers and there
is no league distribution here to rank against. EPA per play spans zero, so it is drawn outwards
from a zero line rather than as a short bar.

### Game replay

The replay is drawn on a `<canvas>` by a `requestAnimationFrame` loop, and the division of labour
is the whole design:

- `lib/replayCanvas.ts` is pure drawing — a context, a size and a play cursor in, pixels out. It
  never reads the clock or React state, so a frame is fully determined by its cursor position. The
  scrubber in 5C needs exactly that property.
- `lib/useReplay.ts` owns the loop. The cursor, the previous frame's timestamp and the pending
  frame handle live in refs; none of them causes a render. The two things a person can see —
  whether it is running, and which play it is on — are published through `useSyncExternalStore`,
  which fires only when the value changes.
- `components/WinProbCanvas.tsx` is an ordinary React shell that never touches the canvas.

Measured in Chrome: **60 canvas frames per second against 8 React renders per second** — 0.13
renders per frame, one per play rather than one per frame. Exactly one animation-frame callback is
ever outstanding, verified under repeated play, pause, restart and game changes.

The x axis is play order, not elapsed time. Several plays legitimately share one timestamp (a
kickoff and the snap after it are both logged at 15:00), so a 174-play game has only 146 distinct
elapsed seconds and a time axis silently collides points.

A frame may advance the cursor by at most 100ms of game time. `requestAnimationFrame` stops firing
in a hidden tab, so the first frame back can carry minutes of wall time and would otherwise skip
the replay to the final whistle; capping the step means a backgrounded tab holds its place. Device
pixel ratio is honoured but capped at 2 — backing-store pixels grow with its square, and a third
multiple buys nothing visible on a two-pixel line.

### Transport

There is exactly one playback position: a fractional play index in a ref. The canvas, the scrubber
thumb, the track fill and the readout all render from that one value, so they cannot disagree —
sampled 30 times during playback, the readout and the scrubber never diverged. Nothing derives
position from a frame count either, so a dropped frame slows the replay rather than pushing it out
of step.

The scrubber is a native `<input type="range">`: role, drag, and value announcement come for free.
Two things are added on top. Its track is continuous so the thumb can follow the cursor smoothly,
which would otherwise leave the browser moving by a hundredth of the game per arrow press, so the
arrow keys are handled explicitly — one play each, ten for page keys, Home and End for the
whistles. And `aria-valuetext` carries the period, clock, score and probability, because a bare
play index tells a screen-reader user nothing about where they are.

Seeking never changes whether the replay is running: paused stays paused, playing carries on from
the new position. A pointer drag is the exception — playback is suspended while the thumb is held,
because otherwise the target moves out from under it, and resumes on release.

Deferring a write is allowed to leave the thumb a fraction of a pixel behind, but never a whole
play behind. The readout moves the instant the cursor crosses a boundary, and a deferral that
straddled one made the slider report a different play from the text beside it — invisible on
screen at under a pixel, but a real disagreement between two things that share a source. Sampled
on every frame in-page, 1,080 frames across all three speeds, the thumb never lags the readout.

Syncing the thumb every frame is the most expensive thing outside the canvas. Measured by neutering
each write in turn on one build: moving the thumb costs about 10ms of layout per second, and
refilling the track about 17ms of style recalculation. Skipping writes finer than a thousandth of
the track — under a pixel at any width this control gets — cut both by roughly a third, to 39
layouts and 37 style recalculations a second, with no visible change to the thumb.

### Game context and key plays

`isKeyPlay` is the whole definition of a key play — a score, a turnover, or a win-probability swing
of at least ten points, decided once in `etl/build_data.py`. The UI reads the flag and never
applies a rule of its own, so the beads drawn on the curve and the markers on the timeline can
never disagree about which plays matter. Checked against the source across four games: marker count
and marker position match `isKeyPlay` exactly, 84 of them.

A game carries fifteen key plays on average and up to forty-one, so the marker rail is a single tab
stop with the arrow keys walking it, rather than forty-one stops between the scrubber and the Play
button. It sits below the track rather than on it, because markers laid over the scrubber would eat
the drag area that is the scrubber's main job.

Key plays cluster — a touchdown, its extra point and the following kickoff are consecutive plays —
so markers sit a median of fifteen pixels apart on a desktop, and three on a phone, against a 24px
hit area. Stacked hit boxes hand the click to whichever marker is later in the DOM: aiming at the
centre of each of the forty-one markers in the densest game landed on a different play **nineteen
times**. The rail therefore resolves a pointer click to the nearest marker itself, in the capture
phase, leaving keyboard activation (which arrives with a click detail of 0) to the focused button.
After the change, 168 of 168 aimed clicks land on the marker aimed at, at desktop and tablet widths.
On a phone two markers one play apart fall about 1.4px from each other, closer than a pointer
coordinate can address; the arrow keys reach every marker exactly.

The context box is ordered by what a reader needs first: clock and score, then down, distance and
possession, then the description, and only then win probability and EPA in the smallest, quietest
type. Down and distance are dropped entirely when the play has none — 26,227 plays across the six
seasons are kickoffs and the like — rather than printed as a placeholder that would read as missing
data instead of inapplicable.

Hovering the canvas draws a hairline and a compact tooltip; clicking seeks there. The pointer's
offset comes from the event, so hovering never measures the DOM, and the hovered play reaches React
only when it changes to a different play. Measured while playing at 2x with the pointer sweeping the
plot at 60 moves a second: **59.9fps unthrottled, 59.5fps with the CPU throttled 6x**.

### Team colour on the replay

The curve is the content, not decoration, so it owes the 3:1 that WCAG 1.4.11 asks of a meaningful
graphic. Nine of the 32 primary colours missed that against the card — the Jets' green managed
1.65:1 — and a further thirteen were being replaced wholesale by a neutral, which made a third of
the league draw an identical grey line.

`legibleOn` keeps the hue and mixes it toward white until it clears the bar. All 32 teams now pass,
between 3.01:1 and 10.36:1, and nine were already legible and are untouched. Contrast is measured
against the card — `bg-neutral-900/40` over `bg-neutral-950`, so `#0f0f0f` — not against the page
behind it; measuring against the page put three teams a hundredth or two under the bar while the
arithmetic said they passed. Verified from rendered pixels, not from the arithmetic.

The League dashboard and Team page still use the older decorative threshold; those are Stage 6's
accessibility pass.

### Measured, not asserted

Recharts was the Stage 5A baseline, used to validate the data before any animation was built on it.
It has been removed now that the canvas engine is verified — one runtime dependency and 9.3 MB of
`node_modules` gone. The shipped bundle is unchanged, because the dev-only branch guarding it had
already kept it out: the game chunk dropped from **105 kB gzipped to 3.8 kB** when the canvas
replaced it.

Frame cadence is measured from the timestamps of the app's own draw calls, in headless Chrome with
the GPU enabled — `--disable-gpu` forces software rasterisation and roughly doubles every canvas
number. A 218-play game, playing at 1x:

| CPU throttle | fps  | median frame | p95 frame | frames > 33ms | JS per frame |
| ------------ | ---- | ------------ | --------- | ------------- | ------------ |
| none         | 60.0 | 16.7ms       | 17.4ms    | 0             | 0.41ms       |
| 4x           | 60.0 | 16.7ms       | 17.5ms    | 0             | 0.41ms       |
| 6x           | 60.0 | 16.6ms       | 17.7ms    | 0             | 0.57ms       |
| 10x          | 60.0 | 16.7ms       | 18.5ms    | 0             | 0.99ms       |
| 20x          | 59.2 | 16.5ms       | 25.0ms    | 2             | 1.72ms       |

Sixty holds to a tenfold CPU handicap, and a phone-sized canvas behaves the same. Every canvas call
together costs **0.14ms of a 16.7ms frame**, of which the axis labels are 0.03ms — which is why the
static background is redrawn every frame rather than cached to an offscreen bitmap. That
optimisation was flagged as a candidate at two earlier checkpoints; profiling it showed the blit
would cost more than the redraw, so it was not written.

Resizing repaints exactly once per size change, and not at all when a viewport change does not
alter the canvas. Scrubbing at 60 pointer moves a second holds 60fps with a p95 frame of 16.9ms.
Leaving the page mid-playback leaves zero animation callbacks outstanding.

### Polish pass

**Motion.** Routes cross-fade over 0.18s and Team sections fade up the first time they are scrolled
to. The route fade is plain CSS: the shell lives in the entry chunk, so importing a motion runtime
there put **26 kB gzipped in front of every first visit** — including game pages, which never used
it — for one fade. Framer Motion stays where it earns its place, in the lazily loaded chunk the
League and Team pages share. Both animations only ever add opacity: content is hittable within
50ms of a navigation, well before the 180ms fade ends, and every section reaches full opacity
whether or not the observer fires. `prefers-reduced-motion`
removes all of it — sections render solid from their first frame, and the skeleton pulse resolves to
`animation-name: none`. The projected-wins figure counts up like the stat bars already did, with the
animated digits hidden from assistive technology and the settled value in an `sr-only` span, because
mid-count-up the DOM reads a number that was never true.

**States.** Each route now has a skeleton shaped like the page it precedes, and the shell picks the
matching one for the chunk it is still downloading — otherwise a navigation showed a spinner for the
chunk and then a different skeleton for the data, two waiting states for one click.

**Text contrast.** Every distinct text style on every page was measured against its composited
background — Tailwind v4 serialises colours as `oklch()`, so each one is painted into a canvas and
read back rather than parsed. `text-neutral-600` came in at **2.46:1** and `text-neutral-500` at
**4.05:1**, both under the 4.5:1 normal-size text owes. Both now resolve to one `--color-muted`
token at 5.19:1 on a card, and the faintest tier separates itself by size and weight instead of by
fading further. The canvas carried the same greys: its axis labels were 4.04:1 and the even-odds
line 2.45:1, and both were lifted. Gridlines stay faint deliberately — they are scaffolding, and
the value they would carry is written on the labels beside them. All 88 text styles across four
pages now pass.

**Accessibility.** The audit found three further defects. The League outline skipped h1 to h3, because
the card headings had no level between them and the page title; the view summary is now the h2 it
should always have been. An error page rendered its heading as an h2, leaving the document with no
h1 at all — it replaces the page it was rendered for, so it owns the page heading. And twelve of the
32 team colours drew bar fills below 3:1 against the neutral-800 track behind them, Buffalo's royal
blue at **1.34:1**; `teamAccent` now tries the secondary colour before lightening the primary, so
Pittsburgh keeps its gold rather than fading to grey.

**Mobile.** At 320px the games list had squeezed opponents down to a single letter — "C…", "E…" —
because the fixed columns left 18px for the name. Folding the home/away marker into the name line
below `sm` returns 32px, and every opponent now renders in full with no clipping at 320, 360 and
390px. No page scrolls horizontally at any of the four widths tested.

## Decisions log

- **TypeScript `strict` from day one** rather than as a later pass — retrofitting strictness across
  an existing codebase costs more than writing under it from the start.
- **oxlint over ESLint** — it is what `create-vite` now scaffolds by default; same role, faster.
- **Tailwind v4 via the Vite plugin** — no `tailwind.config.js`; theme lives in CSS via `@theme`.
- **`nflreadpy` instead of `nfl_data_py`** — the latter is deprecated upstream and pins
  `pandas<2`/`numpy<2`, which have no Python 3.12 wheel, so it will not install on a current
  interpreter.
- **`projectedWins` is market-implied, not a Vegas over/under** — the nflverse win-totals dataset
  was discontinued after 2020. Each game's closing spread is converted to a win probability and
  summed across the regular season, which covers all six seasons instead of one.
- **The canvas replay draws imperatively; React never re-renders per frame** — the animation loop
  is an external system on the browser's frame clock, so its visible state reaches React through
  `useSyncExternalStore` rather than being mirrored into `useState`.
- **Data is validated, not assumed** — `etl/validate.py` checks all 1,693 games against the
  TypeScript contract and caught four real defects (non-chronological `play_id`, timeout rows with
  stale scores, playoff games inflating per-game rates, and a 2025 depth-chart schema change).

## Data

Six seasons, 2020-2025: **1,693 games and 273,325 plays**, plus a 32-team layer for the current
season. 1,727 files, 76.9 MB, which packs to ~13 MB in git. A game file averages 46 KB raw but
**6.6 KB gzipped**, so a replay loads on demand without a backend.

`etl/validate.py` enforces the TypeScript contract on every generated file and is itself verified
by fault injection. See [etl/README.md](etl/README.md) for the key-play rule, the missing-data
decisions, and the dataset quirks worth knowing.

## Attribution

Data from [nflverse](https://github.com/nflverse), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
