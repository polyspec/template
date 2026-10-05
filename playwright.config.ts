import { defineConfig } from '@playwright/test';

// tests/browser/run.mjs starts the static server, which serves the repository root so that the page
// can import the package build, and runs Playwright once the server listens. The server listens on a
// port that the system assigns, and run.mjs passes its address in TEMPLATE_BROWSER_URL.
const baseURL = process.env.TEMPLATE_BROWSER_URL;
if (baseURL === undefined || baseURL === '') throw new Error('TEMPLATE_BROWSER_URL is required; run the browser test with tests/browser/run.mjs');

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
  },
});
