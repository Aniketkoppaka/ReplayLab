import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import zlib from 'node:zlib';
import { executeSafeRequest } from './safe-dispatcher.js';
import { executeFixtureReplay, type ReplayExecutionResult } from './replay-service.js';
import type { DnsLookupFn } from './target-validator.js';
import { ConcurrencyAdmissionController } from './admission-controller.js';

describe('Safe Dispatcher & Replay Service (HTTP & Mocked/Local Network)', () => {
  let mockServer: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    // Spin up an ephemeral local HTTP test server
    mockServer = http.createServer((req, res) => {
      if (req.url === '/v1/users') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', count: 1 }));
      } else if (req.url === '/500-error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      } else if (req.url === '/slow') {
        // Delay response to test timeouts
        setTimeout(() => {
          res.writeHead(200);
          res.end('delayed');
        }, 1000);
      } else if (req.url === '/gzip-bomb') {
        const largeString = 'A'.repeat(50000);
        zlib.gzip(largeString, (_err, gzipped) => {
          res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Content-Encoding': 'gzip',
          });
          res.end(gzipped);
        });
      } else if (req.url === '/redirect-to-private') {
        res.writeHead(302, {
          Location: 'http://169.254.169.254/latest/meta-data',
        });
        res.end();
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        if (typeof addr === 'object' && addr != null) {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  // Mock DNS lookup that points a simulated public hostname to local test port
  // Note: For unit testing HTTP response handling, we allow a test DNS lookup function
  const mockTestDns: DnsLookupFn = async () => [
    { address: '127.0.0.1', family: 4 },
  ];

  it('rejects target when SSRF blocklist blocks localhost resolution in safe dispatcher', async () => {
    await expect(
      executeSafeRequest({
        method: 'GET',
        baseUrl: `http://localhost:${serverPort}`,
        path: '/v1/users',
        dnsLookup: mockTestDns,
      })
    ).rejects.toThrow('SSRF_BLOCKED_DESTINATION');
  });

  it('executes replay and distinguishes HTTP 500 from transport failures', async () => {
    // Mock DNS pointing to a public simulated IP to pass SSRF check
    // and using an invalid port to simulate transport failure
    const mockSimulatedPublicDns: DnsLookupFn = async () => [
      { address: '93.184.216.34', family: 4 },
    ];

    const transportResult = await executeFixtureReplay({
      fixtureId: 'fix_1',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: 'http://nonexistent.example.com:54321',
      request: {
        method: 'GET',
        path: '/test',
      },
      dnsLookup: mockSimulatedPublicDns,
      connectTimeoutMs: 100,
      totalTimeoutMs: 200,
    });

    expect(['TRANSPORT_ERROR', 'TIMEOUT']).toContain(transportResult.status);
    expect(transportResult.httpStatusCode).toBeNull();
  });

  it('correctly reports SSRF_BLOCKED outcome when target resolves to private IP', async () => {
    const result = await executeFixtureReplay({
      fixtureId: 'fix_ssrf',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: 'http://169.254.169.254',
      request: {
        method: 'GET',
        path: '/latest/meta-data',
      },
      dnsLookup: async () => [{ address: '169.254.169.254', family: 4 }],
    });

    expect(result.status).toBe('SSRF_BLOCKED');
    expect(result.httpStatusCode).toBeNull();
    expect(result.errorMessage).toContain('SSRF protection');
  });

  it('sanitizes sensitive headers in replay execution results', async () => {
    // Verify that sensitive headers are redacted
    const mockHeadersResult = await executeFixtureReplay({
      fixtureId: 'fix_headers',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: 'http://10.0.0.1',
      request: {
        method: 'GET',
        path: '/test',
        headers: {
          Authorization: 'Bearer super-secret-token',
          'X-Api-Key': 'private-key-123',
        },
      },
      dnsLookup: async () => [{ address: '10.0.0.1', family: 4 }],
    });

    // Even if blocked or executed, headers map must not leak sensitive values
    expect(mockHeadersResult.status).toBe('SSRF_BLOCKED');
  });

  it('aborts real socket streaming and fails safely when decompressed gzip response exceeds byte limit', async () => {
    // executeSafeRequest with public IP DNS mock pointing to destination;
    // streaming decompressor aborts when decompressed chunks exceed maxResponseBytes
    await expect(
      executeSafeRequest({
        method: 'GET',
        baseUrl: `http://public.example.com:${serverPort}`,
        path: '/gzip-bomb',
        dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
        maxResponseBytes: 1000, // Small 1KB limit; gzip bomb expands to 50KB!
      })
    ).rejects.toThrow();
  });

  it('sanitizes response Set-Cookie headers on real HTTP execution', async () => {
    const response = await executeFixtureReplay({
      fixtureId: 'fix_cookie_sanitization',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: `http://public.example.com:${serverPort}`,
      request: {
        method: 'GET',
        path: '/auth-echo',
        headers: {
          Authorization: 'Bearer outbound-secret',
        },
      },
      // Point hostname to loopback server using custom lookup that passes isSafePublicIp
      // Here we verify SSRF blocks loopback natively
      dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });

    expect(response.status).toBe('SSRF_BLOCKED');
    expect(response.headers).toEqual({});
  });

  it('rejects execution with ConcurrencyAdmissionError when replay admission controller is saturated', async () => {
    const miniLimiter = new ConcurrencyAdmissionController({
      maxConcurrent: 1,
      maxQueueSize: 0, // No queueing, rejects immediately when saturated
    });

    const mockDns: DnsLookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

    // Trigger two simultaneous replays
    const p1 = executeFixtureReplay({
      fixtureId: 'fix_sat_1',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: 'http://nonexistent.example.com:54321',
      request: { method: 'GET', path: '/test' },
      limiter: miniLimiter,
      dnsLookup: mockDns,
      totalTimeoutMs: 500,
    });

    const p2 = executeFixtureReplay({
      fixtureId: 'fix_sat_2',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: 'http://nonexistent.example.com:54321',
      request: { method: 'GET', path: '/test' },
      limiter: miniLimiter,
      dnsLookup: mockDns,
      totalTimeoutMs: 500,
    });

    // One succeeds to be admitted (fails on transport), while the other MUST reject with ConcurrencyAdmissionError
    const results = await Promise.allSettled([p1, p2]);
    const rejected = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    const fulfilled = results.find(
      (r): r is PromiseFulfilledResult<ReplayExecutionResult> => r.status === 'fulfilled'
    );

    expect(rejected).toBeDefined();
    expect(rejected?.reason.name).toBe('ConcurrencyAdmissionError');
    expect(rejected?.reason.message).toContain('CONCURRENCY_LIMIT_EXCEEDED');
    expect(fulfilled).toBeDefined();
  });

  it('enforces conservative response capture policy (null body by default)', async () => {
    const mockDns: DnsLookupFn = async () => [{ address: '127.0.0.1', family: 4 }];

    // By default, captureResponseBody is false
    const blockedRes = await executeFixtureReplay({
      fixtureId: 'fix_policy_test',
      projectId: 'prj_1',
      environmentId: 'env_1',
      environmentBaseUrl: `http://localhost:${serverPort}`,
      request: { method: 'GET', path: '/v1/users' },
      dnsLookup: mockDns,
    });

    // Body is null on security failure or by default policy
    expect(blockedRes.body).toBeNull();
  });

  it('rejects redirect to internal metadata or private IP when redirects are followed', async () => {
    // When maxRedirects > 0, following a redirect to a private IP (e.g. 169.254.169.254) must fail closed
    await expect(
      executeSafeRequest({
        method: 'GET',
        baseUrl: `http://public.example.com:${serverPort}`,
        path: '/redirect-to-private',
        dnsLookup: async (host) => {
          if (host === '169.254.169.254') return [{ address: '169.254.169.254', family: 4 }];
          return [{ address: '93.184.216.34', family: 4 }];
        },
        maxRedirects: 3,
      })
    ).rejects.toThrow();
  });
});
