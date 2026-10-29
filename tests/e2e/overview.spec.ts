import { expect, type Page, test } from '@playwright/test';
import {
  fixtureGa4Overview,
  fixtureGa4Report,
  fixtureOverview,
  fixtureProperties,
} from '../fixtures/overview';

/** UI tests replace only API transport, leaving hooks, state and navigation real. */
async function mockDashboard(page: Page, failure = false) {
  await page.route('**/api/properties', (route) =>
    route.fulfill({ json: { properties: fixtureProperties } })
  );
  await page.route('**/api/overview?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: fixtureOverview(
        {
          startDate: params.get('startDate') as string,
          endDate: params.get('endDate') as string,
        },
        failure
      ),
    });
  });
  await page.route('**/api/ga4/overview?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: fixtureGa4Overview(
        {
          startDate: params.get('startDate') as string,
          endDate: params.get('endDate') as string,
        },
        failure
      ),
    });
  });
  await page.route('**/api/report?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const overview = fixtureOverview({
      startDate: params.get('startDate') as string,
      endDate: params.get('endDate') as string,
    });
    const site = overview.sites.find(
      (entry) => entry.property.siteUrl === params.get('siteUrl')
    );
    return route.fulfill({
      json:
        site?.status === 'ready'
          ? { ...site.performance, queries: [] }
          : { error: 'Unknown site' },
    });
  });
  await page.route('**/api/ga4/report?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: fixtureGa4Report(params.get('siteUrl') as string, {
        startDate: params.get('startDate') as string,
        endDate: params.get('endDate') as string,
      }),
    });
  });
  // Every API the dashboard calls has to be answered here. An unhandled call
  // reaches the real Worker, comes back 401, and the hook locks the dashboard —
  // which detaches the DOM mid-test and looks like a UI bug.
  await page.route('**/api/bing/overview?*', (route) =>
    route.fulfill({
      json: {
        configured: false,
        available: false,
        totals: null,
        sites: [],
        missingFromBing: [],
        unmatchedBingSites: [],
        fetchedAt: new Date().toISOString(),
      },
    })
  );
  await page.route('**/api/umami/overview?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const range = {
      startDate: params.get('startDate') as string,
      endDate: params.get('endDate') as string,
    };
    return route.fulfill({
      json: {
        requestedRange: range,
        range,
        sites: [],
        websites: [],
        totals: null,
        fetchedAt: new Date().toISOString(),
      },
    });
  });
  // Detail-only sources: an explicit failure keeps the section honest without
  // ever returning 401.
  for (const path of ['**/api/bing/report?*', '**/api/umami/report?*']) {
    await page.route(path, (route) =>
      route.fulfill({ status: 503, json: { error: 'fixture: 未接入' } })
    );
  }
}

test.describe('portfolio performance overview', () => {
  test('opens the portfolio, filters changes, searches, sorts and keeps mobile overflow contained', async ({
    page,
  }) => {
    await mockDashboard(page);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: '全部站点总览' })
    ).toBeVisible();
    const table = page.locator('.portfolio-sites .site-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(table.locator('tbody tr').first()).toContainText(
      'alpha.example'
    );
    await page
      .getByRole('group', { name: '筛选站点状态' })
      .getByRole('button', { name: '下降' })
      .click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody tr')).toContainText('alpha.example');
    await page.getByRole('searchbox', { name: '搜索站点' }).fill('missing');
    await expect(page.getByText('没有符合当前条件的站点。')).toBeVisible();
    await page.getByRole('button', { name: '清除筛选' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await table.getByRole('button', { name: '点击变化', exact: true }).click();
    await expect(table.locator('tbody tr').first()).toContainText(
      'beta.example'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page
      .getByRole('button', { name: '曝光', exact: true })
      .last()
      .click();
    await expect(
      page.getByRole('img', { name: '曝光趋势图，含当前周期和上一周期对比' })
    ).toBeVisible();
  });

  test('shares presets and custom ranges with site details and returns to overview', async ({
    page,
  }) => {
    await mockDashboard(page);
    await page.goto('/zh');
    await expect(
      page.locator('.portfolio-sites .site-table tbody tr')
    ).toHaveCount(5);
    const response = page.waitForResponse(
      (result) =>
        result.url().includes('/api/overview?') &&
        result.url().includes('startDate')
    );
    await page.getByRole('button', { name: '7 天', exact: true }).click();
    await response;
    await expect(
      page.getByRole('button', { name: '7 天', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('开始', { exact: true }).fill('2026-10-01');
    await page.getByLabel('结束', { exact: true }).fill('2026-10-07');
    await expect(page.locator('.data-freshness')).toContainText(
      '2026-10-01 — 2026-10-07'
    );
    await page
      .locator('.portfolio-sites .site-table')
      .getByRole('button', { name: 'alpha.example' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'alpha.example', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '带来流量的关键词' })
    ).toBeVisible();
    await expect(page.getByLabel('开始', { exact: true })).toHaveValue(
      '2026-10-01'
    );
    await page.getByRole('button', { name: '全部站点总览' }).click();
    await expect(
      page.locator('.portfolio-sites .site-table tbody tr')
    ).toHaveCount(5);
  });

  test('shows failed properties without zero values, health labels or incomplete totals', async ({
    page,
  }) => {
    await mockDashboard(page, true);
    await page.goto('/');
    await expect(
      page.locator('.portfolio-sites .site-table tbody tr')
    ).toHaveCount(5);
    const row = page
      .locator('.portfolio-sites .site-table tbody tr')
      .filter({ hasText: 'beta.example' });
    await expect(row).toContainText('读取失败');
    await expect(row).toContainText('Google 权限不足。');
    await expect(row.locator('.volume-cell')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: '全部站点汇总' })
    ).toHaveCount(0);
    await expect(page.getByRole('alert').first()).toContainText(
      '汇总指标和总趋势暂不可用'
    );
  });
});
