import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiClientError } from './api-client';

describe('ApiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('attaches the Authorization header when token provider returns a token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch;

    const client = new ApiClient({
      baseUrl: 'http://localhost:3001',
      getToken: () => 'test-bearer-token',
    });

    const result = await client.get('/test-endpoint');

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [calledUrl, calledInit] = call!;
    expect(calledUrl).toBe('http://localhost:3001/test-endpoint');
    expect(calledInit.headers.get('Authorization')).toBe('Bearer test-bearer-token');
    expect(calledInit.headers.get('Accept')).toBe('application/json');
  });

  it('properly serializes body and content-type for POST requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'proj_123', name: 'My Project' }),
    });
    global.fetch = mockFetch;

    const client = new ApiClient({
      baseUrl: 'http://localhost:3001',
    });

    const body = { name: 'My Project' };
    const result = await client.post('/projects', body);

    expect(result).toEqual({ id: 'proj_123', name: 'My Project' });
    const postCall = mockFetch.mock.calls[0];
    expect(postCall).toBeDefined();
    const [, calledInit] = postCall!;
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers.get('Content-Type')).toBe('application/json');
    expect(calledInit.body).toBe(JSON.stringify(body));
  });

  it('handles query parameters correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ items: [] }),
    });
    global.fetch = mockFetch;

    const client = new ApiClient({
      baseUrl: 'http://localhost:3001',
    });

    await client.get('/runs', {
      params: { limit: 20, cursor: 'c_abc', active: true },
    });

    const queryCall = mockFetch.mock.calls[0];
    expect(queryCall).toBeDefined();
    const [calledUrl] = queryCall!;
    expect(calledUrl).toBe('http://localhost:3001/runs?limit=20&cursor=c_abc&active=true');
  });

  it('parses structured API errors into ApiClientError', async () => {
    const errorPayload = {
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient project permissions',
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => errorPayload,
    });
    global.fetch = mockFetch;

    const client = new ApiClient({
      baseUrl: 'http://localhost:3001',
    });

    await expect(client.get('/protected')).rejects.toThrow(ApiClientError);

    try {
      await client.get('/protected');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiClientError);
      const clientError = err as ApiClientError;
      expect(clientError.status).toBe(403);
      expect(clientError.code).toBe('FORBIDDEN');
      expect(clientError.message).toBe('Insufficient project permissions');
    }
  });

  it('handles 204 No Content responses correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const client = new ApiClient({
      baseUrl: 'http://localhost:3001',
    });

    const result = await client.delete('/projects/proj_123');
    expect(result).toBeUndefined();
  });
});
