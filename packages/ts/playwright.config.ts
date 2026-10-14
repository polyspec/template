import { defineConfig } from '@playwright/test';

// tests/browser/run.mjs starts the static server, which serves the repository root so that the page
// can import the package build, and runs Playwright in packages/ts once the server listens. The server listens on a
// port that the system assigns, and run.mjs passes its address in TEMPLATE_BROWSER_URL, which becomes
// use.baseURL. Loading the configuration needs no address, so that tools that only read it, such as
// knip, load it; the test requires its baseURL when it runs (tests/browser/render.spec.ts).
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.TEMPLATE_BROWSER_URL,
    browserName: 'chromium',
  },
});
