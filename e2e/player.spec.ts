/**
 * Player pages against the real 2,274 profiles.
 *
 * The constraint worth testing at this level is the one the brief sets: a
 * profile must say more than the roster row it was reached from. So this walks
 * the actual route in — team page, roster, a linked name — and checks the page
 * carries things no roster row does.
 */

import { expect, test } from '@playwright/test'

test('a roster links only the players it has something to say about', async ({ page }) => {
  await page.goto('/team/KC')
  await expect(page.getByRole('heading', { level: 1, name: /Chiefs/ })).toBeVisible()
  await page.getByRole('link', { name: 'Roster' }).click()

  const roster = page.locator('#roster')
  const linked = roster.locator('a[href^="/player/"]')
  await expect(linked.first()).toBeVisible()

  // Roughly two thirds of a roster has recorded production; the rest is plain
  // text rather than a link to a page repeating the same line.
  const links = await linked.count()
  expect(links).toBeGreaterThan(20)
})

test('a player page says more than the roster row it came from', async ({ page }) => {
  await page.goto('/player/00-0033873') // Patrick Mahomes

  await expect(page.getByRole('heading', { level: 1, name: 'Patrick Mahomes' })).toBeVisible()

  // None of these is on a roster row.
  await expect(page.getByText(/6'2"/)).toBeVisible()
  await expect(page.getByText(/230 lb/)).toBeVisible()
  await expect(page.getByText(/Drafted 2017/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /^\d{4} season$/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Week by week' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Season by season' })).toBeVisible()

  // The career table spans more than the one season the team page describes.
  const rows = page.getByRole('row')
  expect(await rows.count()).toBeGreaterThan(3)
})

test('the headshot is fetched at the size it is drawn, not the stored 4 MB', async ({ page }) => {
  const images: { url: string; bytes: number }[] = []
  page.on('response', async (r) => {
    if (!r.url().includes('static.www.nfl.com')) return
    images.push({ url: r.url(), bytes: Number((await r.allHeaders())['content-length'] ?? 0) })
  })

  await page.goto('/player/00-0033873', { waitUntil: 'networkidle' })
  expect(images.length).toBeGreaterThan(0)
  for (const image of images) {
    expect(image.url, 'headshot should carry a width').toMatch(/w_\d+/)
    // The originals are 3-6 MB. Anything near that means the resize was lost.
    expect(image.bytes, `${image.url} was ${image.bytes} bytes`).toBeLessThan(200_000)
  }
})

test('a week in the trend opens that game replay', async ({ page }) => {
  await page.goto('/player/00-0033873')
  await expect(page.getByRole('heading', { name: 'Week by week' })).toBeVisible()

  const week = page.locator('a[href^="/game/"]').first()
  await expect(week).toBeVisible()
  await week.click()

  await expect(page).toHaveURL(/\/game\/\d{4}_\d{2}_[A-Z]+_[A-Z]+$/)
  await expect(page.getByRole('img', { name: /Win probability line for/ })).toBeVisible()
})

test('a player id that has no profile says so', async ({ page }) => {
  await page.goto('/player/00-0000000')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible()
})
