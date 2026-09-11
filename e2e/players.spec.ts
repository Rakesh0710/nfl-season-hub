/**
 * Finding a player by name.
 *
 * The reason this route exists is that 2,274 pages were reachable only by
 * knowing to open a team and scroll to its roster. So the test that matters is
 * the one that starts where a visitor starts — the header — and ends on a
 * player's page.
 */

import { expect, test } from '@playwright/test'

test('a visitor can find a player from the header, by name', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Players', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Players' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /All 2,?\d+ players/ })).toBeVisible()

  await page.getByLabel('Search').fill('mahomes')
  const first = page.locator('a[href^="/player/"]').first()
  await expect(first).toContainText('Patrick Mahomes')

  await first.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Patrick Mahomes' })).toBeVisible()
})

test('the search finds a punctuated name typed plainly', async ({ page }) => {
  await page.goto('/players?q=jamarr')
  await expect(page.locator('a[href^="/player/"]').first()).toContainText("Ja'Marr Chase")
})

test('the search is in the URL, so a result list is shareable', async ({ page }) => {
  await page.goto('/players')
  await page.getByLabel('Search').fill('allen')
  await page.getByLabel('Position').selectOption('QB')

  await expect.poll(() => page.url()).toContain('q=allen')
  expect(page.url()).toContain('pos=QB')

  await page.reload()
  await expect(page.getByLabel('Search')).toHaveValue('allen')
  await expect(page.getByLabel('Position')).toHaveValue('QB')
  await expect(page.locator('a[href^="/player/"]').first()).toContainText('Allen')
})

test('filtering by team narrows to that squad', async ({ page }) => {
  await page.goto('/players?team=KC')
  await expect(page.getByRole('heading', { name: /players for KC/ })).toBeVisible()
  const cards = page.locator('a[href^="/player/"]')
  await expect(cards.first()).toBeVisible()
  for (const text of await cards.allTextContents()) {
    expect(text).toContain('Kansas City Chiefs')
  }
})

test('a search that matches nobody offers a way back', async ({ page }) => {
  await page.goto('/players?q=zzzzzzz')
  await expect(page.getByText('No players match.')).toBeVisible()
  await page.getByRole('button', { name: /clear search/i }).click()
  await expect(page.getByRole('heading', { name: /All 2,?\d+ players/ })).toBeVisible()
})

/**
 * The default listing, not a narrow search.
 *
 * This test used to load `/players?q=allen`, and passed while the unfiltered
 * page shipped 775 KB of headshots: 55 of the 2,269 stored URLs use a delivery
 * type `headshotAt` did not match, and went down the wire at their stored size
 * — 3.8 MB in A.J. Brown's case. Sixty faces the visitor did not ask for is
 * where an image bug is worth catching.
 */
test('every thumbnail on the default listing is sized, not the stored original', async ({
  page,
}) => {
  const sizes: number[] = []
  page.on('response', async (r) => {
    if (!r.url().includes('static.www.nfl.com')) return
    expect(r.url(), 'thumbnail should carry a width').toMatch(/w_\d+/)
    sizes.push(Number((await r.allHeaders())['content-length'] ?? 0))
  })

  await page.goto('/players', { waitUntil: 'networkidle' })
  expect(sizes.length).toBeGreaterThan(10)
  expect(Math.max(...sizes), 'a 36px thumbnail is a few KB').toBeLessThan(30_000)
  expect(
    sizes.reduce((a, b) => a + b, 0),
    'the whole listing',
  ).toBeLessThan(400_000)
})

test('a private-delivery headshot is resized too, not served at 3.8 MB', async ({ page }) => {
  const sizes: number[] = []
  page.on('response', async (r) => {
    if (r.url().includes('static.www.nfl.com')) {
      sizes.push(Number((await r.allHeaders())['content-length'] ?? 0))
    }
  })

  // A.J. Brown: stored under /image/private/, which the first version of
  // `headshotAt` passed through untouched.
  await page.goto('/player/00-0035676', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: 'A.J. Brown' })).toBeVisible()
  expect(sizes.length).toBeGreaterThan(0)
  expect(Math.max(...sizes)).toBeLessThan(50_000)
})

/**
 * Also the guard on the dropped-keystroke bug, and the only one there can be.
 *
 * The box used to take its value from the query string; `setSearchParams` is a
 * navigation, so React re-rendered it with a stale value between keypresses
 * and typing "garrett" left "t" in it. jsdom cannot reproduce that — every
 * update flushes inside `act`, so the stale render never happens — which is
 * why this assertion lives out here on real keys rather than in
 * `PlayersPage.test.tsx`.
 */
test('the search is operable by keyboard alone, and keeps every key pressed', async ({ page }) => {
  await page.goto('/players')
  await page.getByLabel('Search').focus()
  await page.keyboard.type('garrett')

  await expect(page.getByLabel('Search')).toHaveValue('garrett')
  await expect.poll(() => page.url()).toContain('q=garrett')

  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Team')).toBeFocused()
  await expect(page.locator('a[href^="/player/"]').first()).toContainText('Garrett')
})
