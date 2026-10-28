import { expect, test } from '@playwright/test';

test.describe('GSC dashboard access boundary', () => {
  test('renders the password screen before a private session exists', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('main h1')).toContainText('把所有 GSC 项目');
    await expect(page.locator('#dashboard-password')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  });

  test('does not expose private properties without a session cookie', async ({
    request,
  }) => {
    const response = await request.get('/api/properties');
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: '请输入看板访问密码。',
    });
  });

  test('keeps the Chinese route on the same private dashboard', async ({
    page,
  }) => {
    await page.goto('/zh');
    await expect(page.locator('main h1')).toContainText('把所有 GSC 项目');
  });

  test('protects portfolio and report APIs before validating private request parameters', async ({
    request,
  }) => {
    for (const path of ['/api/overview', '/api/report']) {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
      expect(response.headers()['cache-control']).toContain('no-store');
    }
  });
});
