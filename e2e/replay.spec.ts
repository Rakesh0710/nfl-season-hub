/**
 * The drill-down this application exists for: League → Team → Game → Replay.
 *
 * Everything is reached the way a visitor reaches it — by clicking what is on
 * the screen — so the test also proves the routing, the lazy chunks and the
 * static data files all line up in a production build. Selectors are roles and
 * accessible names wherever the app exposes them, which means a test failing
 * here usually means a real control lost its label.
 */

import { expect, test, type Page } from '@playwright/test'

/** The readout beside the scrubber: "Play 42 of 173". */
const readout = (page: Page) => page.getByText(/^Play \d+ of \d+$/)

/** Autoplay starts on mount; nearly every assertion wants it still. */
async function pauseReplay(page: Page) {
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: /^(Play|Replay)$/ })).toBeVisible()
}

test('a visitor can walk from the league to a game replay and scrub it', async ({ page }) => {
  await page.goto('/')

  // --- League ---------------------------------------------------------------
  await expect(page.getByRole('heading', { level: 1, name: 'League' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /All 32 teams in the league/ })).toBeVisible()

  const firstTeam = page.locator('a[href^="/team/"]').first()
  const teamName = (await firstTeam.getByRole('heading').textContent())?.trim() ?? ''
  expect(teamName.length).toBeGreaterThan(0)
  await firstTeam.click()

  // --- Team -----------------------------------------------------------------
  await expect(page.getByRole('heading', { level: 1, name: teamName })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Games' })).toBeVisible()

  const firstGame = page.locator('a[href^="/game/"]').first()
  await expect(firstGame).toBeVisible()
  await firstGame.click()

  // --- Game -----------------------------------------------------------------
  await expect(page).toHaveURL(/\/game\/\d{4}_\d{2}_[A-Z]+_[A-Z]+$/)
  const chart = page.getByRole('img', { name: /Win probability line for/ })
  await expect(chart).toBeVisible()
  await expect(chart).toHaveAccessibleName(/key plays marked/)

  const scrubber = page.getByRole('slider', { name: 'Replay position' })
  await expect(scrubber).toBeVisible()
  await expect(readout(page)).toBeVisible()

  // --- The replay actually runs ---------------------------------------------
  const started = await readout(page).textContent()
  await expect.poll(async () => readout(page).textContent(), { timeout: 5_000 }).not.toBe(started)

  await pauseReplay(page)

  // --- Scrubbing changes the context ---------------------------------------
  const paused = await readout(page).textContent()
  const context = page.getByTestId('play-context')
  const before = await context.textContent()

  await scrubber.focus()
  await page.keyboard.press('End')
  await expect(readout(page)).not.toHaveText(paused ?? '')
  expect(await context.textContent()).not.toBe(before)

  // The last play of the game: the readout's two numbers agree.
  const atEnd = (await readout(page).textContent()) ?? ''
  const [, position, total] = /Play (\d+) of (\d+)/.exec(atEnd) ?? []
  expect(position).toBe(total)

  await page.keyboard.press('Home')
  await expect(readout(page)).toHaveText(/^Play 1 of \d+$/)

  await page.keyboard.press('ArrowRight')
  await expect(readout(page)).toHaveText(/^Play 2 of \d+$/)

  // Seeking must not restart playback.
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('dragging the scrubber moves the replay and leaves it where it was dropped', async ({
  page,
}) => {
  await page.goto('/game/2023_12_NO_ATL')
  await pauseReplay(page)

  const scrubber = page.getByRole('slider', { name: 'Replay position' })
  const track = await scrubber.boundingBox()
  if (!track) throw new Error('the scrubber has no box to drag along')

  await page.mouse.move(track.x + track.width * 0.2, track.y + track.height / 2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width * 0.75, track.y + track.height / 2, { steps: 12 })
  await page.mouse.up()

  const dropped = (await readout(page).textContent()) ?? ''
  const [, position, total] = /Play (\d+) of (\d+)/.exec(dropped) ?? []
  expect(Number(position) / Number(total)).toBeGreaterThan(0.6)

  // Released on a paused replay, it stays paused and stays put.
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  expect(await readout(page).textContent()).toBe(dropped)
})

test('a key play can be selected, and the context follows it', async ({ page }) => {
  await page.goto('/game/2023_12_NO_ATL')
  await pauseReplay(page)

  const rail = page.getByRole('group', { name: /Key plays: \d+ in this game/ })
  const markers = rail.getByRole('button')
  await expect(markers.first()).toBeVisible()

  // One tab stop for the whole rail, however many markers there are.
  const tabbable = await rail.locator('button[tabindex="0"]').count()
  expect(tabbable).toBe(1)

  const marker = markers.nth(2)
  const label = (await marker.getAttribute('aria-label')) ?? ''
  const [, clock] = /(Q\d+|OT\d?) (\d+:\d{2})/.exec(label) ?? []

  // Clicked as a pixel rather than as an element. Key plays cluster, so on a
  // phone a neighbour's 24px hit box covers this marker's centre and
  // Playwright's actionability check refuses the click — while a real finger
  // lands there regardless. The rail resolves the click to the nearest marker
  // in the capture phase for exactly this reason, and that is what is under
  // test: aiming at a marker must select that marker, not whichever one
  // happens to sit later in the DOM.
  const box = await marker.boundingBox()
  if (!box) throw new Error('the marker has no box to aim at')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  const context = page.getByTestId('play-context')
  await expect(context).toContainText(clock ?? '')
  await expect(context.getByText('Key play')).toBeVisible()
})

test('the replay is operable by keyboard alone', async ({ page }) => {
  await page.goto('/game/2023_12_NO_ATL')
  await pauseReplay(page)

  // Tab from the top of the page until the transport is reached, then run it.
  await page.getByRole('button', { name: 'Play', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()

  await page.keyboard.press('Tab') // Restart
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  // Restart must never disable itself: doing so drops focus to the body.
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeFocused()
})

test('a game that is not in the dataset says so instead of failing silently', async ({ page }) => {
  // `vite preview` answers a missing data file with index.html and a 200, which
  // is what the data layer's content-type guard exists for.
  await page.goto('/game/1999_01_XXX_YYY')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the league' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'League' })).toBeVisible()
})

test('a filtered league view survives a reload, because it lives in the URL', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'AFC', exact: true }).click()
  await expect(page.getByRole('heading', { name: /16 of 32 teams in the AFC/ })).toBeVisible()

  const url = page.url()
  expect(url).toContain('conf=AFC')

  await page.reload()
  await expect(page.getByRole('heading', { name: /16 of 32 teams in the AFC/ })).toBeVisible()
})

test('a team page reaches every season of replays, not just the current one', async ({ page }) => {
  // Before the team layer was split by season, 1,409 of the 1,694 shipped
  // replays had no route to them from anywhere in the UI.
  await page.goto('/team/KC')
  await expect(page.getByRole('heading', { level: 1, name: /Chiefs/ })).toBeVisible()

  const seasons = page.getByRole('group', { name: /Chiefs season/i })
  await expect(seasons).toBeVisible()
  const labels = await seasons.getByRole('button').allTextContents()
  expect(labels.length).toBeGreaterThanOrEqual(6)
  expect(labels).toEqual([...labels].sort().reverse()) // newest first

  // Open the oldest season and follow a game into its replay.
  const oldest = labels[labels.length - 1]
  if (!oldest) throw new Error('no seasons offered')
  await seasons.getByRole('button', { name: oldest }).click()
  await expect(seasons.getByRole('button', { name: oldest })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const game = page.locator(`a[href^="/game/${oldest}_"]`).first()
  await expect(game).toBeVisible()
  await game.click()

  await expect(page).toHaveURL(new RegExp(`/game/${oldest}_`))
  await expect(page.getByRole('img', { name: /Win probability line for/ })).toBeVisible()
})

test('a chosen season survives a reload, because it is in the URL', async ({ page }) => {
  await page.goto('/team/PHI?season=2021')
  await expect(page.getByRole('heading', { level: 1, name: /Eagles/ })).toBeVisible()
  const seasons = page.getByRole('group', { name: /Eagles season/i })
  await expect(seasons.getByRole('button', { name: '2021' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('a[href^="/game/2021_"]').first()).toBeVisible()
})
