import { defineConfig } from '@playwright/test';

// Browser tests run in the installed Google Chrome (channel 'chrome'), headless. On Apple Silicon
// its headless mode exposes the Metal GPU to WebGPU without extra flags.
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5179',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'gpu', testMatch: /gpu\/.*\.spec\.ts/ },
    { name: 'e2e', testMatch: /e2e\/.*\.spec\.ts/ },
  ],
});
