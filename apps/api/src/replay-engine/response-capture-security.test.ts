import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tests with a STUBBED dispatcher: the real dispatcher cannot reach loopback targets by
// design (SSRF), so response-handling logic is exercised against crafted responses.
vi.mock('./safe-dispatcher.js', () => ({
  executeSafeRequest: vi.fn(),
}));

import { executeSafeRequest } from './safe-dispatcher.js';
import { executeFixtureReplay } from './replay-service.js';
import {
  MAX_CAPTURED_BODY_BYTES,
  REDACTED,
  TRUNCATED,
  redactSensitiveData,
  sanitizeDiffResult,
} from './redaction.js';

const mockedDispatch = vi.mocked(executeSafeRequest);

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    fixtureId: 'fix_1',
    projectId: 'prj_1',
    environmentId: 'env_1',
    environmentBaseUrl: 'https://api.example.test',
    request: { method: 'GET' as const, path: '/x' },
    ...overrides,
  };
}

function respond(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
  mockedDispatch.mockResolvedValueOnce({
    statusCode,
    headers,
    body,
    durationMs: 5,
  } as Awaited<ReturnType<typeof executeSafeRequest>>);
}

describe('Response capture security (unit, stubbed dispatcher)', () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
  });

  it('omits the response body by default', async () => {
    respond(200, { ok: true, token: 'tok_live_123' });
    const res = await executeFixtureReplay(baseParams());
    expect(res.body).toBeNull();
    expect(JSON.stringify(res)).not.toContain('tok_live_123');
  });

  it('redacts sensitive keys (nested + arrays) when capture is explicitly enabled', async () => {
    respond(200, {
      user: { name: 'a', password: 'hunter2', profile: { apiKey: 'k-999' } },
      items: [{ id: 1, access_token: 'at-1' }],
    });
    const res = await executeFixtureReplay(baseParams({ captureResponseBody: true }));
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('k-999');
    expect(serialized).not.toContain('at-1');
    expect(serialized).toContain(REDACTED);
    expect((res.body as { user: { name: string } }).user.name).toBe('a');
  });

  it('redacts captured bodies of HTTP error responses too', async () => {
    respond(500, { error: 'boom', session: 'sess-abc', secret: 's3cr3t' });
    const res = await executeFixtureReplay(baseParams({ captureResponseBody: true }));
    expect(res.status).toBe('HTTP_ERROR');
    expect(res.httpStatusCode).toBe(500);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('sess-abc');
    expect(serialized).not.toContain('s3cr3t');
  });

  it('size-limits captured bodies (over-limit body is replaced, not persisted)', async () => {
    respond(200, { blob: 'A'.repeat(MAX_CAPTURED_BODY_BYTES + 10) });
    const res = await executeFixtureReplay(baseParams({ captureResponseBody: true }));
    expect(res.body).toBe(TRUNCATED);
  });

  it('redacts response values embedded in diffs even when capture is disabled', async () => {
    respond(200, { status: 'ok', token: 'NEW-SECRET-TOKEN', note: 'changed' });
    const res = await executeFixtureReplay(
      baseParams({
        baseline: {
          statusCode: 200,
          body: { status: 'ok', token: 'OLD-SECRET-TOKEN', note: 'orig' },
        },
      })
    );
    expect(res.body).toBeNull();
    expect(res.diffFound).toBe(true);
    const serialized = JSON.stringify(res.diffDetails);
    expect(serialized).not.toContain('NEW-SECRET-TOKEN');
    expect(serialized).not.toContain('OLD-SECRET-TOKEN');
    expect(serialized).toContain('"orig"'); // non-sensitive diff values are preserved
  });

  it('applies mask rules to the comparison result', async () => {
    const baseline = { statusCode: 200, body: { id: 1, ts: 'old' } };
    respond(200, { id: 1, ts: 'new' });
    const masked = await executeFixtureReplay(
      baseParams({ baseline, maskRules: [{ path: '$.ts', action: 'IGNORE' }] })
    );
    expect(masked.diffFound).toBe(false);
    expect(masked.status).toBe('SUCCESS');

    respond(200, { id: 1, ts: 'new' });
    const unmasked = await executeFixtureReplay(baseParams({ baseline }));
    expect(unmasked.diffFound).toBe(true);
    expect(unmasked.status).toBe('ASSERTION_FAILURE');
  });

  it('redacts sensitive response headers', async () => {
    respond(200, {}, { 'set-cookie': 'a=1', 'x-amz-security-token': 'sts', 'x-request-id': 'r1' });
    const res = await executeFixtureReplay(baseParams());
    expect(res.headers['set-cookie']).toBe(REDACTED);
    expect(res.headers['x-amz-security-token']).toBe(REDACTED);
    expect(res.headers['x-request-id']).toBe('r1');
  });

  it('failure path: transport errors never leak dispatcher error details or secrets', async () => {
    mockedDispatch.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 10.1.2.3:443 Authorization: Bearer super-secret')
    );
    const res = await executeFixtureReplay(baseParams({ captureResponseBody: true }));
    expect(res.status).toBe('TRANSPORT_ERROR');
    expect(res.httpStatusCode).toBeNull();
    expect(res.body).toBeNull();
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('10.1.2.3');
  });

  it('failure path: SSRF block reports a generic message without target detail', async () => {
    mockedDispatch.mockRejectedValueOnce(new Error('SSRF_BLOCKED_DESTINATION: 169.254.169.254 restricted IP'));
    const res = await executeFixtureReplay(baseParams({ captureResponseBody: true }));
    expect(res.status).toBe('SSRF_BLOCKED');
    expect(JSON.stringify(res)).not.toContain('169.254.169.254');
  });

  it('redaction helpers do not mutate their inputs', () => {
    const input = { password: 'p', nested: { token: 't', ok: 1 } };
    const copy = JSON.parse(JSON.stringify(input));
    redactSensitiveData(input);
    sanitizeDiffResult({ differences: [{ path: '$.token', expected: 'a', actual: 'b' }] });
    expect(input).toEqual(copy);
  });
});
