// The built page at a path like the GitHub Pages project site (/photonring/), served from a
// fresh build: brief section 10, item 15. Run with npm run test:dist.
import { defineConfig } from '@playwright/test';
import { browserUse, expectTimeout } from './tests/helpers/browser-env.ts';

const CI = !!process.env.CI;
const url = 'http://localhost:4174/photonring/';

export default defineConfig({
  testDir: 'tests/dist',
  timeout: 120_000,
  expect: { timeout: expectTimeout() },
  workers: 1,
  // A request seen once is a finding; a retry would hide it.
  retries: 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: url,
    // Any host but localhost resolves to nothing, so a regression fails here and nothing leaves
    // the machine.
    ...browserUse(['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']),
    trace: CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command:
      'npm run build && npx vite preview -c vite.preview.config.ts --base /photonring/ --port 4174 --strictPort',
    url,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
