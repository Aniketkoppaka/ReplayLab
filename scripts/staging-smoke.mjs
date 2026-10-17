/**
 * ReplayLab Staging Deployment Smoke Test Script
 *
 * Verifies live deployed endpoints:
 * 1. GET /health
 * 2. GET /ready
 * 3. 401 Unauthorized rejection on unauthenticated request
 * 4. Security Headers (X-Content-Type-Options, X-Frame-Options)
 * 5. Frontend application availability
 */

import https from 'node:https';
import http from 'node:http';

const API_URL = process.env.STAGING_API_URL || process.env.API_URL;
const WEB_URL = process.env.STAGING_WEB_URL || process.env.WEB_URL;

if (!API_URL && !WEB_URL) {
  console.log('[staging-smoke] STAGING_API_URL or STAGING_WEB_URL not provided.');
  console.log('[staging-smoke] Usage: STAGING_API_URL=https://api-staging.example.com STAGING_WEB_URL=https://staging.example.com node scripts/staging-smoke.mjs');
  process.exit(1);
}

async function request(urlStr, options = {}, body) {
  const url = new URL(urlStr);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timed out'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runSmokeTests() {
  console.log('=== ReplayLab Staging Smoke Test Suite ===\n');
  let passed = 0;
  let failed = 0;

  if (API_URL) {
    console.log(`Target API: ${API_URL}`);

    // Check 1: GET /health
    try {
      const res = await request(`${API_URL.replace(/\/+$/, '')}/health`);
      if (res.statusCode === 200) {
        const json = JSON.parse(res.body);
        if (json.status === 'healthy') {
          console.log('  ✓ [Check 1] Liveness probe GET /health returns 200 OK & status="healthy"');
          passed++;
        } else {
          console.error(`  ✗ [Check 1] Liveness status is not healthy: ${res.body}`);
          failed++;
        }
      } else {
        console.error(`  ✗ [Check 1] Liveness probe returned status ${res.statusCode}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ [Check 1] Failed to contact /health: ${err.message}`);
      failed++;
    }

    // Check 2: GET /ready
    try {
      const res = await request(`${API_URL.replace(/\/+$/, '')}/ready`);
      if (res.statusCode === 200) {
        const json = JSON.parse(res.body);
        if (json.status === 'ready' && json.checks?.database === 'ok') {
          console.log('  ✓ [Check 2] Readiness probe GET /ready returns 200 OK & database="ok"');
          passed++;
        } else {
          console.error(`  ✗ [Check 2] Readiness checks failed: ${res.body}`);
          failed++;
        }
      } else if (res.statusCode === 503) {
        console.warn(`  ! [Check 2] Readiness probe returned 503 (degraded DB dependency)`);
        failed++;
      } else {
        console.error(`  ✗ [Check 2] Readiness probe returned status ${res.statusCode}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ [Check 2] Failed to contact /ready: ${err.message}`);
      failed++;
    }

    // Check 3: Auth Boundary (POST /api/v1/projects requires token)
    try {
      const res = await request(`${API_URL.replace(/\/+$/, '')}/api/v1/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }, JSON.stringify({ name: 'Unauthorized Project Attempt' }));

      if (res.statusCode === 401) {
        console.log('  ✓ [Check 3] Unauthenticated API mutation correctly rejected with 401 Unauthorized');
        passed++;
      } else {
        console.error(`  ✗ [Check 3] Unauthenticated request did not return 401: status=${res.statusCode}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ [Check 3] Auth boundary check failed: ${err.message}`);
      failed++;
    }

    // Check 4: Security Headers
    try {
      const res = await request(`${API_URL.replace(/\/+$/, '')}/health`);
      const nosniff = res.headers['x-content-type-options'];
      const frameOptions = res.headers['x-frame-options'];
      if (nosniff === 'nosniff' && frameOptions === 'DENY') {
        console.log('  ✓ [Check 4] Security headers present (X-Content-Type-Options: nosniff, X-Frame-Options: DENY)');
        passed++;
      } else {
        console.error(`  ✗ [Check 4] Missing security headers: ${JSON.stringify(res.headers)}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ [Check 4] Security header check failed: ${err.message}`);
      failed++;
    }
  }

  if (WEB_URL) {
    console.log(`\nTarget Frontend: ${WEB_URL}`);

    // Check 5: Web UI loading
    try {
      const res = await request(`${WEB_URL.replace(/\/+$/, '')}/`);
      if (res.statusCode === 200 || res.statusCode === 307 || res.statusCode === 308) {
        console.log(`  ✓ [Check 5] Frontend root page reachable (HTTP ${res.statusCode})`);
        passed++;
      } else {
        console.error(`  ✗ [Check 5] Frontend returned unexpected status: ${res.statusCode}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ [Check 5] Failed to reach frontend: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Smoke Test Summary ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error('Fatal smoke test runner error:', err);
  process.exit(1);
});
