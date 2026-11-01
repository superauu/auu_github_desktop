import { defineConfig } from '@playwright/test';

// 本机 Windows 保留端口段会随重启漂移（如 5099-5198），撞上时用 VISUAL_PORT 换端口；
// CI 未设该变量，走默认值。
const PORT = process.env.VISUAL_PORT ?? '5179';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  updateSnapshots: 'none',
  snapshotPathTemplate: './tests/visual/baselines/playwright-{platform}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.005, threshold: 0.2 },
  },
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: `http://127.0.0.1:${PORT}`,
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/tests/visual/index.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
