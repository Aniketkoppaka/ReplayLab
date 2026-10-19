import { test, expect, type Page } from '@playwright/test';
import { ProjectResponseSchema } from '../../packages/contracts/src/project.js';

/**
 * ReplayLab Staging End-to-End User Journey
 *
 * This test runs against the deployed staging environment (Vercel frontend + Render API + Supabase).
 *
 * Safety & Isolation Guarantees:
 * 1. Uses unique timestamped project name to prevent collisions with shared data.
 * 2. Only invokes public HTTPBin endpoints with zero secrets or customer payload.
 * 3. Verifies Phase 11.1 fix: bodyType NONE skips body comparison and passes on status 200.
 * 4. Verifies Negative status assertion: status 404 expected vs status 200 actual produces ASSERTION_FAILURE.
 * 5. Cleans up by deleting the exact test-created project ID via authenticated API call, preserving any prior test failure.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Staging Live User Journey & Deterministic Replay Verification', () => {
  let page: Page;
  const runId = Date.now().toString().slice(-6);
  const testProjectName = `E2E Staging Project ${runId}`;
  let createdProjectId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    // Teardown: Safely delete only the exact project ID created by this test run
    if (createdProjectId) {
      const targetId = createdProjectId;
      const stagingApiUrl = 'https://replaylab-api-staging.onrender.com/api/v1';

      try {
        await page.evaluate(
          async ({ projectId, apiUrl }) => {
            // Extract genuine authenticated access token from Supabase session in localStorage
            let token: string | null = null;
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                try {
                  const parsed = JSON.parse(localStorage.getItem(key) || '{}');
                  if (parsed && typeof parsed.access_token === 'string' && parsed.access_token.length > 0) {
                    token = parsed.access_token;
                    break;
                  }
                } catch {
                  // Ignore JSON parse errors for non-matching keys
                }
              }
            }

            if (!token) {
              throw new Error(
                'Teardown aborted: no valid Supabase authentication session found in browser storage.'
              );
            }

            const res = await fetch(`${apiUrl}/projects/${projectId}`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            });

            // 204 No Content is the expected success response from DELETE /projects/:projectId
            if (res.status !== 204) {
              const errorText = await res.text().catch(() => '');
              throw new Error(
                `Project delete failed with HTTP status ${res.status}: ${errorText || res.statusText}`
              );
            }
          },
          { projectId: targetId, apiUrl: stagingApiUrl }
        );
      } catch (err) {
        // Log teardown failure separately without masking the original test outcome
        console.error(`[Teardown Failure] Failed to delete test project ${targetId}:`, err);
      }
    }

    if (page) {
      await page.close();
    }
  });

  test('01. Authenticated Access to Projects Page', async () => {
    await page.goto('/projects');

    await expect(page.getByRole('heading', { name: /Projects & Workspaces/i })).toBeVisible({ timeout: 15000 });
  });

  test('02. Project Creation & Selection', async () => {
    await page.goto('/projects');

    // Open creation modal
    await page.getByRole('button', { name: /New Project/i }).click();

    // Fill form
    await page.locator('input[placeholder="e.g. Payments Gateway"]').fill(testProjectName);
    await page.locator('textarea[placeholder*="regression tests"]').fill('Automated Staging Verification Journey');

    // Wait for the actual POST /projects response and click Create Project
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/projects') &&
          !res.url().includes('/environments') &&
          !res.url().includes('/fixtures') &&
          res.request().method() === 'POST' &&
          res.status() === 201
      ),
      page.locator('form').getByRole('button', { name: /Create Project/i }).click(),
    ]);

    // Validate the response body conforms to ProjectResponseSchema
    const responseJson = await createResponse.json();
    const parseResult = ProjectResponseSchema.safeParse(responseJson);
    if (!parseResult.success) {
      throw new Error(
        `[Project Creation Error] API response failed schema validation: ${JSON.stringify(parseResult.error.format())}`
      );
    }

    // Set createdProjectId strictly from validated server contract
    createdProjectId = parseResult.data.id;
    expect(createdProjectId).toBeTruthy();

    // Verify project card appears in list
    const projectCard = page.locator('div.rounded-xl', { hasText: testProjectName });
    await expect(projectCard).toBeVisible({ timeout: 10000 });

    // Select the newly created project to set active context
    const selectBtn = projectCard.getByRole('button', { name: /Select/i });
    if (await selectBtn.isVisible()) {
      await selectBtn.click();
    }

    // Verify it is active
    await expect(projectCard.getByText('Active')).toBeVisible({ timeout: 5000 });
  });

  test('03. Environment Configuration with HTTPBin Target', async () => {
    await page.goto('/environments');
    await expect(page.getByRole('heading', { name: 'Target Environments' })).toBeVisible({ timeout: 15000 });

    // Open modal
    await page.getByRole('button', { name: /New Environment|Add Environment/i }).first().click();

    await page.locator('input[placeholder="e.g. Staging Server"]').fill('HTTPBin Live Target');
    await page.locator('input[placeholder="https://api.example.com"]').fill('https://httpbin.org');

    // Submit form
    await page.locator('form').getByRole('button', { name: /Save Changes|Create Environment/i }).click();

    // Verify environment is listed
    await expect(page.getByText('HTTPBin Live Target')).toBeVisible({ timeout: 10000 });
  });

  test('04. Fixture Creation & Phase 11.1 Baseline Configuration (bodyType: NONE)', async () => {
    await page.goto('/fixtures');
    await expect(page.getByRole('heading', { name: 'Sanitized Fixtures' })).toBeVisible({ timeout: 15000 });

    // Open New Fixture modal
    await page.getByRole('button', { name: /New Fixture|Create Fixture/i }).first().click();

    const fixtureModal = page.locator('div.fixed', {
      has: page.getByRole('heading', { name: /Create Fixture/i }),
    });
    await expect(fixtureModal).toBeVisible();

    await fixtureModal.locator('input[placeholder="e.g. Get User Profile"]').fill('Get Status 200 Fixture');
    await fixtureModal.locator('input[placeholder="/api/v1/resource"]').fill('/status/200');

    // Submit fixture creation and wait for the API response
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/fixtures') &&
          res.request().method() === 'POST' &&
          res.status() === 201
      ),
      fixtureModal.getByRole('button', { name: /Create Fixture/i }).click(),
    ]);
    expect(createResponse.ok()).toBeTruthy();

    // Verify fixture listed
    await expect(page.getByText('Get Status 200 Fixture')).toBeVisible({ timeout: 10000 });

    // Open Baseline modal
    const baselineBtn = page.getByRole('button', { name: /Baseline/i }).first();
    await baselineBtn.scrollIntoViewIfNeeded();
    await baselineBtn.click();
    await expect(page.getByText('Explicit Baseline Snapshot Update')).toBeVisible();

    const baselineModal = page.getByRole('main').locator('div.fixed');
    await baselineModal.locator('input[type="number"]').fill('200');
    await baselineModal.locator('select').selectOption('NONE');

    const confirmBaselineBtn = baselineModal.getByRole('button', { name: /Confirm Baseline Update/i });
    await confirmBaselineBtn.scrollIntoViewIfNeeded();
    await confirmBaselineBtn.click();

    // Verify baseline badge indicates HTTP 200
    await expect(page.getByText(/Baseline Set \(HTTP 200\)/i)).toBeVisible({ timeout: 10000 });
  });

  test('05. Live Replay Execution & Phase 11.1 PASS Outcome Assertion', async () => {
    await page.goto('/fixtures');

    // Trigger replay modal for fixture
    await page.getByRole('button', { name: /Replay/i }).first().click();
    
    // Locate the replay modal container via its heading
    const replayModal = page.locator('div.fixed', {
      has: page.getByRole('heading', { name: 'Interactive Fixture Replay' }),
    });
    await expect(replayModal).toBeVisible();

    // Dispatch Replay against live HTTPBin
    await replayModal.getByRole('button', { name: /Trigger Replay/i }).click();

    // Verify live execution outcome returns SUCCESS with HTTP 200 scoped to the execution results panel
    // (This definitively proves the Phase 11.1 fix: bodyType NONE asserts HTTP 200 without diffing empty body)
    const resultPanel = replayModal.locator('div.pt-4.border-t.border-slate-800');
    await expect(resultPanel.locator('span', { hasText: 'SUCCESS' })).toBeVisible({ timeout: 15000 });
    await expect(resultPanel.locator('span.font-mono', { hasText: 'HTTP 200' })).toBeVisible({ timeout: 15000 });
  });

  test('06. Negative Baseline Status Assertion Verification', async () => {
    await page.goto('/fixtures');

    // Update baseline to expect HTTP 404 with bodyType NONE
    const baselineBtn = page.getByRole('button', { name: /Baseline/i }).first();
    await baselineBtn.scrollIntoViewIfNeeded();
    await baselineBtn.click();
    await expect(page.getByText('Explicit Baseline Snapshot Update')).toBeVisible();

    const baselineModal = page.locator('div.fixed', {
      has: page.getByRole('heading', { name: 'Explicit Baseline Snapshot Update' }),
    });
    await baselineModal.locator('input[type="number"]').fill('404');
    await baselineModal.locator('select').selectOption('NONE');

    const confirmBaselineBtn = baselineModal.getByRole('button', { name: /Confirm Baseline Update/i });
    await confirmBaselineBtn.scrollIntoViewIfNeeded();
    await confirmBaselineBtn.click();

    await expect(page.getByText(/Baseline Set \(HTTP 404\)/i)).toBeVisible({ timeout: 10000 });

    // Trigger replay again
    await page.getByRole('button', { name: /Replay/i }).first().click();
    
    const replayModal = page.locator('div.fixed', {
      has: page.getByRole('heading', { name: 'Interactive Fixture Replay' }),
    });
    await expect(replayModal).toBeVisible();

    await replayModal.getByRole('button', { name: /Trigger Replay/i }).click();

    // Expect ASSERTION_FAILURE because target returns 200 but baseline expects 404 scoped to result panel
    const resultPanel = replayModal.locator('div.pt-4.border-t.border-slate-800');
    await expect(resultPanel.locator('span', { hasText: 'ASSERTION_FAILURE' })).toBeVisible({ timeout: 15000 });
    await expect(resultPanel.locator('span.font-mono', { hasText: 'HTTP 200' })).toBeVisible({ timeout: 15000 });
  });
});
