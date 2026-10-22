import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 360000,
  workers: 1,
  reporter: [['list']],
  outputDir: '.cache/e2e-results',
});
