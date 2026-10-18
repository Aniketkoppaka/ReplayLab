import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Playwright E2E configuration dedicated to the Staging Environment.
 *
 * Targets the deployed Vercel frontend and Render staging API.
 * Uses real Supabase credentials via environment variables and
 * persists session state under e2e/.auth/ (which is gitignored).
 *
 * Requirements:
 * - PLAYWRIGHT_BASE_URL (defaults to https://replay-lab-gilt.vercel.app)
 * - PLAYWRIGHT_STAGING_USER_EMAIL
 * - PLAYWRIGHT_STAGING_USER_PASSWORD
 *
 * Fails closed if invoked without credentials.
 */

import { validateStagingBaseUrl } from './e2e/staging/validate-staging-url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stagingBaseUrl = validateStagingBaseUrl(process.env.PLAYWRIGHT_BASE_URL);
const authFile = path.join(__dirname, 'e2e', '.auth', 'staging-user.json');

export default defineConfig({
  testDir: './e2e/staging',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/staging' }]],
  use: {
    baseURL: stagingBaseUrl,
    viewport: { width: 1280, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'staging-e2e',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
    },
  ],
  // Explicitly NO webServer: this config targets deployed staging infrastructure only
});
