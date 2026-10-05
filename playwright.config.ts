import { defineConfig } from '@playwright/test';

// tests/browser/run.mjs starts the static server, which serves the repository root so that the page
// can import the package build, and runs Playwright once the server listens.
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
  },
});
