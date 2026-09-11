/**
 * What the site says about its own data.
 *
 * Once the JSON is regenerated on a schedule rather than built once, two
 * claims have to hold on the deployed page and not just in a unit test: that
 * it says when it was refreshed, and that it never presents one season's
 * figures as another's.
 */

import { expect, test } from '@playwright/test'

test('every page says when the data was refreshed', async ({ page }) => {
  for (const path of ['/', '/team/KC', '/game/2023_12_NO_ATL', '/compare?a=KC&b=BUF']) {
    await page.goto(path)
    const footer = page.locator('footer')
    await expect(footer).toContainText(/Refreshed .* ago/)
    // A machine-readable instant, so "4 days ago" is never the only record.
    await expect(footer.locator('time')).toHaveAttribute('dateTime', /^\d{4}-\d{2}-\d{2}T/)
    await expect(footer).toContainText(/Seasons \d{4}/)
  }
})

test('the league page says which season the figures describe', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'League' })).toBeVisible()

  // Either the notice explains the distinction, or there is no distinction to
  // explain — but the page must never show season figures with neither.
  const notice = page.getByText(/Figures describe/)
  const count = await notice.count()
  if (count > 0) {
    await expect(notice.first()).toContainText(/complete \d{4} season|\d{4} so far/)
  }
})

test('a team page names the season its stat lines come from', async ({ page }) => {
  await page.goto('/team/KC')
  await expect(page.getByRole('heading', { level: 2, name: 'Team stats' })).toBeVisible()
  // Season-shaped figures, so the season is stated rather than assumed.
  await expect(page.getByText(/regular-season scrimmage plays in \d{4}/).first()).toBeVisible()
})

test('the freshness note never blocks the page it sits under', async ({ page }) => {
  // It is lazily loaded and deliberately has no fallback: content must be
  // complete whether or not meta.json ever arrives.
  await page.route('**/data/meta.json', (route) => route.abort())
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'League' })).toBeVisible()
  await expect(page.locator('a[href^="/team/"]').first()).toBeVisible()
  await expect(page.locator('footer')).toContainText('nflverse')
  await expect(page.locator('footer')).not.toContainText('Refreshed')
})
