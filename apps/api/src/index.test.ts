import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { API_VERSION, getSystemInfo, createApp, startServer } from './index.js';

describe('api baseline smoke test', () => {
  it('exports api version and resolves workspace packages', () => {
    expect(API_VERSION).toBe('0.1.0');
    const info = getSystemInfo();
    expect(info.contractsVersion).toBe('0.1.0');
    expect(info.dbPackageVersion).toBe('0.1.0');
  });

  it('exports startServer lifecycle function', () => {
    expect(typeof startServer).toBe('function');
  });

  it('serves liveness /health with defensive security headers and CORS', async () => {
    const app = createApp({ useInMemoryStore: true });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'replaylab-api' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('handles OPTIONS pre-flight requests gracefully', async () => {
    const app = createApp({ useInMemoryStore: true });
    const res = await request(app).options('/api/v1/projects');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('GET, POST');
  });

  it('serves readiness /ready probe in in-memory mode', async () => {
    const app = createApp({ useInMemoryStore: true });
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.api).toBe('ok');
    expect(res.body.checks.database).toBe('in_memory');
  });

  it('serves 503 degraded readiness probe when database is unreachable', async () => {
    const prevDbUrl = process.env.DATABASE_URL;
    try {
      // Point to an invalid unreachable PostgreSQL port
      process.env.DATABASE_URL = 'postgresql://invalid_user:invalid_pass@127.0.0.1:54329/invalid_db?schema=public';
      const app = createApp();
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.database).toBe('unreachable');
    } finally {
      if (prevDbUrl) {
        process.env.DATABASE_URL = prevDbUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });
});
