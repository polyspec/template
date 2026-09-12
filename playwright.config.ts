import { defineConfig } from '@playwright/test';

// The static server serves the repository root so that the page can import the package build.
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: 'http://127.0.0.1:4173/tests/browser/index.html',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
