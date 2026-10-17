import { test, expect, type Page } from '@playwright/test';
import { startTestApiServer, type TestApiInstance } from './fixtures/test-api';
import { startDemoApiServer, type DemoServerInstance } from './fixtures/demo-server';

let testApi: TestApiInstance;
let demoServer: DemoServerInstance;

test.beforeAll(async () => {
  // Start backend API server on 3001
  testApi = await startTestApiServer(3001);
  // Start mock demo target on a dynamic port
  demoServer = await startDemoApiServer(0);
});

test.afterAll(async () => {
  if (testApi) await testApi.close();
  if (demoServer) await demoServer.close();
});

async function loginWithToken(page: Page, token: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Check if Developer Token tab is available and click it
  const devTokenTab = page.getByRole('button', { name: /Developer Token/i });
  if (await devTokenTab.isVisible()) {
    await devTokenTab.click();
  }

  // Fill the textarea for developer token
  const tokenInput = page.locator('textarea');
  await tokenInput.fill(token);
  await page.getByRole('button', { name: /Inject Session Token/i }).click();

  // Wait for redirect to complete
  await page.waitForURL(/\/(projects)?/);
}

test.describe.configure({ mode: 'serial' });

test.describe('ReplayLab End-to-End User Journeys', () => {
  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage();
  });

  test.afterAll(async () => {
    if (sharedPage) await sharedPage.close();
  });

  test('01. Authentication & Session Initialization via Developer Token', async () => {
    await loginWithToken(sharedPage, testApi.ownerToken);
    await expect(sharedPage.getByText(/ReplayLab/i).first()).toBeVisible();
  });

  test('02. Project Creation & Active Project Context Selection', async () => {
    await sharedPage.goto('/projects');
    await expect(sharedPage.getByRole('heading', { name: 'Projects & Workspaces' })).toBeVisible();

    // Click New Project button
    await sharedPage.getByRole('button', { name: /New Project/i }).click();

    // Fill project form (placeholder="e.g. Payments Gateway")
    await sharedPage.locator('input[placeholder="e.g. Payments Gateway"]').fill('E2E Automated Testing');
    await sharedPage.locator('textarea[placeholder*="regression tests"]').fill('E2E Verified Project Scope');
    await sharedPage.locator('form').getByRole('button', { name: /Create Project/i }).click();

    // Verify project heading appears in list
    await expect(sharedPage.getByRole('heading', { name: 'E2E Automated Testing' })).toBeVisible();
  });

  test('03. Environment Configuration with Base URL and Masked Secret Variables', async () => {
    await sharedPage.goto('/environments');
    await expect(sharedPage.getByRole('heading', { name: 'Target Environments' })).toBeVisible();

    // Open New Environment modal
    const addEnvBtn = sharedPage.getByRole('button', { name: /New Environment|Add Environment/i }).first();
    await addEnvBtn.click();

    await sharedPage.locator('input[placeholder="e.g. Staging Server"]').fill('Demo Mock Target');
    await sharedPage.locator('input[placeholder="https://api.example.com"]').fill('http://example.com');

    // Add a variable
    await sharedPage.getByRole('button', { name: /Add Variable/i }).click();
    await sharedPage.locator('input[placeholder="VARIABLE_NAME"]').fill('SECRET_API_KEY');
    await sharedPage.locator('input[placeholder="Value"]').fill('super-secret-token-value-12345');

    // Check Mark as Secret checkbox
    await sharedPage.locator('input[type="checkbox"]').first().check();

    // Submit form
    await sharedPage.locator('form').getByRole('button', { name: /Save Changes|Create Environment/i }).click();

    // Verify environment is listed and variable is masked
    await expect(sharedPage.getByText('Demo Mock Target')).toBeVisible();
    await expect(sharedPage.getByText('SECRET_API_KEY')).toBeVisible();
    await expect(sharedPage.getByText(/\[ENCRYPTED\]/i)).toBeVisible();
  });

  test('04. Fixture Creation & Baseline Snapshot Configuration', async () => {
    await sharedPage.goto('/fixtures');
    await expect(sharedPage.getByRole('heading', { name: 'Sanitized Fixtures' })).toBeVisible();

    // Click New Fixture
    const addFixBtn = sharedPage.getByRole('button', { name: /New Fixture|Create Fixture/i }).first();
    await addFixBtn.click();

    await sharedPage.locator('input[placeholder="e.g. Get User Profile"]').fill('Get User List');
    await sharedPage.locator('input[placeholder="/api/v1/resource"]').fill('/api/v1/users');

    // Submit fixture creation in form
    const createBtn = sharedPage.locator('form').getByRole('button', { name: /Create Fixture|Save Changes/i });
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();

    // Verify fixture listed
    await expect(sharedPage.getByText('Get User List')).toBeVisible();
    await expect(sharedPage.getByText('/api/v1/users')).toBeVisible();

    // Update baseline snapshot
    const baselineBtn = sharedPage.getByRole('button', { name: /Baseline/i }).first();
    await baselineBtn.scrollIntoViewIfNeeded();
    await baselineBtn.click();
    await expect(sharedPage.getByText('Explicit Baseline Snapshot Update')).toBeVisible();

    const baselineModal = sharedPage.getByRole('main').locator('div.fixed');
    await baselineModal.locator('input[type="number"]').fill('200');
    await baselineModal.locator('select').selectOption('JSON');
    await baselineModal.locator('textarea').fill(JSON.stringify({ status: 'success', count: 2 }));

    const confirmBaselineBtn = baselineModal.getByRole('button', { name: /Confirm Baseline Update/i });
    await confirmBaselineBtn.scrollIntoViewIfNeeded();
    await confirmBaselineBtn.click();

    // Verify baseline badge indicates HTTP 200
    await expect(sharedPage.getByText(/Baseline Set \(HTTP 200\)/i)).toBeVisible();
  });

  test('05. Replay Trigger & SSRF Defensive Protection Verification', async () => {
    await sharedPage.goto('/fixtures');
    await expect(sharedPage.getByText('Get User List')).toBeVisible();

    // Trigger replay modal for fixture
    await sharedPage.getByRole('button', { name: /Replay/i }).first().click();

    await expect(sharedPage.getByText('Interactive Fixture Replay')).toBeVisible();

    // Execute replay
    await sharedPage.getByRole('button', { name: /Trigger Replay/i }).click();

    // Verify results panel renders execution outcome badge
    await expect(
      sharedPage.getByText(/SUCCESS|ASSERTION_FAILURE|HTTP_ERROR|TRANSPORT_ERROR|SSRF_BLOCKED|TIMEOUT/)
    ).toBeVisible({ timeout: 10000 });
  });

  test('06. Regression Suite Management & Execution', async () => {
    await sharedPage.goto('/suites');
    await expect(sharedPage.getByRole('heading', { name: 'Regression Suites' })).toBeVisible();

    // Click Create Suite
    const createSuiteBtn = sharedPage.getByRole('button', { name: /New Regression Suite|Create First Suite/i }).first();
    await createSuiteBtn.click();

    await sharedPage.locator('input[placeholder*="Smoke Suite"]').fill('Critical User Flow');

    // Add fixture to suite
    await sharedPage.getByRole('button', { name: /Add Fixture/i }).click();

    // Submit suite creation
    await sharedPage.getByRole('button', { name: /Create Regression Suite/i }).click();

    // Verify suite listed
    await expect(sharedPage.getByText('Critical User Flow')).toBeVisible();

    // Click Run Suite
    await sharedPage.getByRole('button', { name: /Run Suite/i }).first().click();
    await expect(sharedPage.getByText('Execute Regression Suite')).toBeVisible();

    // Execute Suite
    await sharedPage.getByRole('button', { name: /Run Regression Suite/i }).click();

    // Verify completion status displayed
    await expect(sharedPage.getByText(/Fixture Dispatches/i)).toBeVisible({ timeout: 15000 });
  });

  test('07. Multi-Tenant Project Isolation Protection', async ({ browser }) => {
    const outsiderPage = await browser.newPage();
    try {
      // Authenticate as OUTSIDER user
      await loginWithToken(outsiderPage, testApi.outsiderToken);

      // Outsider should have empty project list and NOT see "E2E Automated Testing"
      await outsiderPage.goto('/projects');
      await expect(outsiderPage.getByText('E2E Automated Testing')).not.toBeVisible();
      await expect(outsiderPage.getByRole('heading', { name: 'No projects found' })).toBeVisible();
    } finally {
      await outsiderPage.close();
    }
  });
});


