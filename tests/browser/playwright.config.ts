import { defineConfig } from '@playwright/test';

// tests/browser/run.mts starts the static server, which serves the repository root so that the page
// can import the package build, and runs Playwright in tests/browser once the server listens. The server listens on a
// port that the system assigns, and run.mjs passes its address in TEMPLATE_BROWSER_URL, which becomes
// use.baseURL. Loading the configuration needs no address, so that tools that only read it, such as
// knip, load it; the test requires its baseURL when it runs (tests/browser/render.spec.ts). A timeout of 0 gives a case no
// time limit (T28.146).
export default defineConfig({
  testDir: '.',
  timeout: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.TEMPLATE_BROWSER_URL,
    browserName: 'chromium',
  },
});
