import { defineConfig } from '@playwright/test';
import { browserUse, expectTimeout } from './tests/helpers/browser-env.ts';

// Browser tests run in the installed Google Chrome (channel 'chrome'), headless. On Apple Silicon
// its headless mode exposes the Metal GPU to WebGPU without extra flags.
//
// PHOTONRING_SERVER picks what is served: 'dev' (default, the Vite dev server with the GPU test
// harness) or 'preview' (a fresh production build with its CSP, page tests only, without those
// tagged @dev-server). PHOTONRING_ADAPTER picks the WebGPU adapter: tests/helpers/browser-env.ts.
const CI = !!process.env.CI;
const server = process.env.PHOTONRING_SERVER ?? 'dev';
if (server !== 'dev' && server !== 'preview') {
  throw new Error(`PHOTONRING_SERVER must be dev or preview, not ${server}`);
}
const preview = server === 'preview';
const port = preview ? 4173 : 5179;
const url = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: expectTimeout() },
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: url,
    ...browserUse(),
    trace: CI ? 'retain-on-failure' : 'off',
  },
  webServer: preview
    ? {
        // Always a fresh build: a stale or missing dist/ is never what gets tested.
        command: `npm run build && npx vite preview -c vite.preview.config.ts --port ${port} --strictPort`,
        url,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: `npx vite --port ${port} --strictPort`,
        url,
        reuseExistingServer: !CI,
      },
  projects: preview
    ? [{ name: 'e2e', testMatch: /e2e\/.*\.spec\.ts/, grepInvert: /@dev-server/ }]
    : [
        { name: 'gpu', testMatch: /gpu\/.*\.spec\.ts/ },
        { name: 'e2e', testMatch: /e2e\/.*\.spec\.ts/ },
        { name: 'bench', testMatch: /bench\/.*\.spec\.ts/ },
        { name: 'gallery', testMatch: /gallery\/.*\.spec\.ts/ },
      ],
});
