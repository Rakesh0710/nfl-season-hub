/**
 * Six seasons, end to end.
 *
 * The dataset always held six seasons of replays, but everything around them —
 * the dashboard, the rosters, the stat lines, the records — described one. The
 * journey worth testing is therefore the whole one: choose a season on the
 * league page, open a team, and check that every part of that page moved with
 * it rather than just the games list.
 */

import { expect, test } from '@playwright/test'

test('the dashboard offers six seasons and opens on the newest', async ({ page }) => {
  await page.goto('/')
  const seasons = page.getByRole('group', { name: 'Season' })
  // `allTextContents` does not auto-wait, so the group has to be there first.
  await expect(seasons).toBeVisible()
  const labels = await seasons.getByRole('button').allTextContents()

  expect(labels.length).toBeGreaterThanOrEqual(6)
  expect(labels).toEqual([...labels].sort().reverse()) // newest first
  await expect(seasons.getByRole('button', { name: labels[0]! })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('choosing a season rewrites the standings without another request', async ({ page }) => {
  const fetched: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/data/')) fetched.push(r.url())
  })

  await page.goto('/', { waitUntil: 'networkidle' })
  const before = fetched.length
  const first = await page.locator('a[href^="/team/"]').first().textContent()

  await page.getByRole('group', { name: 'Season' }).getByRole('button', { name: '2021' }).click()
  await expect(page.getByRole('heading', { name: /in 2021/ })).toBeVisible()

  // Standings for every season arrived in one 2.6 KB file, so the switch is a
  // re-render. A season that cost a round trip would defeat the point of it.
  expect(fetched.length, fetched.slice(before).join('\n')).toBe(before)
  await expect(page.locator('a[href^="/team/"]').first()).not.toHaveText(first ?? '')
})

test('a chosen season reaches the team page, and the whole page follows', async ({ page }) => {
  await page.goto('/?season=2021')
  await expect(page.getByRole('heading', { name: /in 2021/ })).toBeVisible()

  // The card carries the season into the link, so the team page opens on it.
  const card = page.locator('a[href^="/team/"]').first()
  await expect(card).toHaveAttribute('href', /season=2021/)
  await card.click()

  await expect(
    page.getByRole('group', { name: /season/i }).getByRole('button', { name: '2021' }),
  ).toHaveAttribute('aria-pressed', 'true')
  // Not only the games: the record, the stat lines and the squad are 2021 too.
  await expect(page.getByRole('heading', { level: 2, name: 'Team stats' })).toBeVisible()
  // Both panels say it — offense and defense are each drawn from 2021 plays.
  await expect(page.getByText(/regular-season scrimmage plays in 2021/).first()).toBeVisible()
  for (const href of await page
    .locator('a[href^="/game/"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))) {
    expect(href, 'every game on a 2021 page is a 2021 game').toMatch(/\/game\/2021_/)
  }
})

test('the season survives a reload of the team page, because it is in the URL', async ({
  page,
}) => {
  await page.goto('/team/KC?season=2020')
  const record = await page.getByRole('heading', { level: 1 }).locator('..').textContent()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: /Chiefs/ })).toBeVisible()
  expect(await page.getByRole('heading', { level: 1 }).locator('..').textContent()).toBe(record)
})

test('an older roster links the players who have a page and leaves the rest as text', async ({
  page,
}) => {
  await page.goto('/team/KC?season=2020')
  const roster = page.locator('#roster').locator('..')
  await expect(roster.locator('a[href^="/player/"]').first()).toBeVisible()

  // A 2020 squad is full of players who have since retired. They are named,
  // not linked: the player layer covers who the dataset records production for,
  // and a link to a page that does not exist is worse than plain text.
  const names = await roster.locator('a[href^="/player/"]').count()
  const rows = await roster.getByRole('listitem').count()
  expect(names).toBeGreaterThan(0)
  expect(names).toBeLessThan(rows)
})

test('a player page charts one season at a time across a career', async ({ page }) => {
  // Mahomes has played every season in the dataset.
  await page.goto('/player/00-0033873')
  await expect(page.getByRole('heading', { level: 1, name: 'Patrick Mahomes' })).toBeVisible()
  const seasons = page.getByRole('group', { name: /season/i })
  await expect(seasons).toBeVisible()
  const labels = await seasons.getByRole('button').allTextContents()
  expect(labels.length).toBeGreaterThanOrEqual(6)

  await seasons.getByRole('button', { name: '2021' }).click()
  await expect(page.getByRole('heading', { name: '2021 season' })).toBeVisible()

  // The weekly chart follows the same season; the career table stays whole.
  const weeks = page.getByText(/of \d+ weeks/)
  await expect(weeks).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Season by season' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '2020' })).toBeVisible()
})
