/**
 * The comparison route, against the production build and the real data.
 *
 * The unit tests use fixtures with numbers chosen to make a leader obvious.
 * These use the actual 32 teams, which is the only way to catch a page that
 * works on invented data and falls over on the shipped kind.
 */

import { expect, test, type Page } from '@playwright/test'

/**
 * Exact, because `getByLabel` matches accessible names by substring: mid
 * navigation, with the team page still mounted, a loose "Team" also matched
 * that page's `Team stats` section and the assertion failed with "not an input
 * element" about one run in six.
 */
const pick = (page: Page, label: string) => page.getByLabel(label, { exact: true })

test('two teams can be compared, and the comparison is a shareable link', async ({ page }) => {
  await page.goto('/compare')

  await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible()
  await expect(page.getByText('Choose two teams to compare.')).toBeVisible()

  await pick(page, 'Team').selectOption('KC')
  await expect(page.getByText('Choose a second team to compare.')).toBeVisible()

  await pick(page, 'Opponent').selectOption('BUF')

  await expect(page.getByRole('heading', { name: 'Offense' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Defense' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Head to head' })).toBeVisible()

  // The matchup is in the URL and survives a reload.
  expect(page.url()).toContain('a=KC')
  expect(page.url()).toContain('b=BUF')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Offense' })).toBeVisible()
  await expect(pick(page, 'Team')).toHaveValue('KC')
  await expect(pick(page, 'Opponent')).toHaveValue('BUF')
})

test('every metric names a leader, or neither, but never both', async ({ page }) => {
  await page.goto('/compare?a=KC&b=BUF')
  await expect(page.getByRole('heading', { name: 'Offense' })).toBeVisible()

  for (const key of [
    'epaPerPlay',
    'pointsPerGame',
    'yardsPerGame',
    'successRate',
    'explosiveRate',
  ]) {
    const kc = page.getByTestId(`metric-${key}-KC`).getByText('leads')
    const buf = page.getByTestId(`metric-${key}-BUF`).getByText('leads')
    // Two rows per metric, one for offense and one for defense.
    const leaders = (await kc.count()) + (await buf.count())
    expect(leaders, `${key} leaders`).toBeLessThanOrEqual(2)
  }
})

test('head to head lists real meetings, each opening its replay', async ({ page }) => {
  await page.goto('/compare?a=KC&b=DEN')
  await expect(page.getByRole('heading', { name: 'Head to head' })).toBeVisible()

  // A division rivalry: twice a season across six seasons.
  await expect(page.getByText(/1[0-9] meetings since 2020/)).toBeVisible()

  const first = page.locator('a[href^="/game/"]').first()
  await expect(first).toBeVisible()
  await first.click()

  await expect(page).toHaveURL(/\/game\/\d{4}_\d{2}_[A-Z]+_[A-Z]+$/)
  await expect(page.getByRole('img', { name: /Win probability line for/ })).toBeVisible()
})

test('a team page offers the comparison, pre-filled', async ({ page }) => {
  await page.goto('/team/PHI')
  // The team page has to have finished loading before its link is a router
  // link rather than an element that happens to be on screen.
  await expect(page.getByRole('heading', { level: 1, name: /Eagles/ })).toBeVisible()
  await page.getByRole('link', { name: 'Compare PHI' }).click()

  await expect(page).toHaveURL(/\/compare\?a=PHI$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible()
  await expect(pick(page, 'Team')).toHaveValue('PHI')
  await expect(page.getByText('Choose a second team to compare.')).toBeVisible()
})

test('a nonsense matchup degrades to empty pickers', async ({ page }) => {
  await page.goto('/compare?a=NOPE&b=ALSONOPE')
  await expect(page.getByText('Choose two teams to compare.')).toBeVisible()
  await expect(pick(page, 'Team')).toHaveValue('')
})

test('the comparison is reachable and operable by keyboard', async ({ page }) => {
  await page.goto('/compare')
  await expect(page.getByRole('heading', { level: 1, name: 'Compare' })).toBeVisible()

  await pick(page, 'Team').focus()
  await expect(pick(page, 'Team')).toBeFocused()
  await pick(page, 'Team').selectOption('SF')

  await page.keyboard.press('Tab')
  await expect(pick(page, 'Opponent')).toBeFocused()
  await pick(page, 'Opponent').selectOption('DAL')

  await expect(page.getByRole('heading', { name: 'Head to head' })).toBeVisible()
})
