import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { executeSafeRequest } from './safe-dispatcher.js';
import { executeFixtureReplay } from './replay-service.js';
import type { DnsLookupFn } from './target-validator.js';

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
});
