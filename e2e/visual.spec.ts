import { test, expect } from '@playwright/test';
import cases from '../tests/visual/cases.json' with { type: 'json' };

for (const scenario of cases) {
  test(scenario.name, async ({ page, baseURL }) => {
    const errors: string[] = [], forbiddenRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // The fixture may load local JS, CSS and fonts, but must never reach a real
    // repository endpoint or an external service, even if a component regresses.
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL || url.pathname.startsWith('/api/')) {
        forbiddenRequests.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.theme as 'dark' | 'light', reducedMotion: 'reduce' });
    await page.goto(`/tests/visual/index.html?theme=${scenario.theme}&automation=1`);
    await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
    await expect(page.getByText('workspace-ui-fixture', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Merge workspace review improvements', { exact: true }).first()).toBeVisible();
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.mouse.move(-1, -1);
    await expect(page).toHaveScreenshot(`${scenario.name}.png`);
    await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
    expect(errors, 'browser errors').toEqual([]);
    expect(forbiddenRequests, 'repository/external network requests').toEqual([]);
  });
}
