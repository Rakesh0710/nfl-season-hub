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

test('result thumbnails are sized, never the stored multi-megabyte original', async ({ page }) => {
  const sizes: number[] = []
  page.on('response', async (r) => {
    if (!r.url().includes('static.www.nfl.com')) return
    expect(r.url(), 'thumbnail should carry a width').toMatch(/w_\d+/)
    sizes.push(Number((await r.allHeaders())['content-length'] ?? 0))
  })

  await page.goto('/players?q=allen', { waitUntil: 'networkidle' })
  expect(sizes.length).toBeGreaterThan(0)
  expect(Math.max(...sizes)).toBeLessThan(100_000)
})

test('the search is operable by keyboard alone', async ({ page }) => {
  await page.goto('/players')
  await page.getByLabel('Search').focus()
  await page.keyboard.type('garrett')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Team')).toBeFocused()
  await expect(page.locator('a[href^="/player/"]').first()).toContainText('Garrett')
})
