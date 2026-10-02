import { defineConfig } from '@playwright/test';

// The global setup bundles the test page script into dist/browser; the tests load it into a blank page.
export default defineConfig({
  testDir: 'tests/browser',
  globalSetup: './tests/browser/setup.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  outputDir: 'dist/test-results',
  use: {
    browserName: 'chromium',
  },
});
