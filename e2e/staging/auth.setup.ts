import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authDir = path.join(__dirname, '..', '.auth');
const authFile = path.join(authDir, 'staging-user.json');

setup('Authenticate as Staging User via Supabase UI', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_STAGING_USER_EMAIL;
  const password = process.env.PLAYWRIGHT_STAGING_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      `[Playwright Staging Auth Error] Missing required staging credentials.\n` +
      `Please provide PLAYWRIGHT_STAGING_USER_EMAIL and PLAYWRIGHT_STAGING_USER_PASSWORD in the environment.\n` +
      `Never hardcode credentials into test files or version control.`
    );
  }

  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Navigate to login page
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // If Supabase tab exists (e.g., if dev auth is enabled), select it; otherwise default form is Supabase
  const supabaseTab = page.getByRole('button', { name: /Supabase Account/i });
  if (await supabaseTab.isVisible()) {
    await supabaseTab.click();
  }

  // Fill in login credentials
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await passwordInput.fill(password);

  // Submit login form
  const submitButton = page.locator('form').getByRole('button', { name: /^Sign In$/i });
  await submitButton.click();

  // Wait for redirect to /projects or dashboard
  await page.waitForURL(/\/(projects)?/, { timeout: 20000 });

  // Verify that an authenticated page element is present
  await expect(page.getByRole('heading', { name: /Projects & Workspaces/i })).toBeVisible({ timeout: 15000 });

  // Save the authenticated storage state (cookies + localStorage tokens)
  await page.context().storageState({ path: authFile });
});
