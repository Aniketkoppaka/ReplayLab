import http from 'node:http';

export interface DemoServerInstance {
  server: http.Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

/**
 * Creates and starts a deterministic HTTP mock server for ReplayLab E2E testing.
 * Provides deterministic responses for:
 * - /api/v1/users (200 OK JSON)
 * - /api/v1/users/mutated (returns altered payload to trigger diff)
 * - /api/v1/error (500 Internal Error)
 * - /api/v1/headers (echoes custom headers and sets cookie for redaction testing)
 */
export async function startDemoApiServer(preferredPort = 0): Promise<DemoServerInstance> {
  const server = http.createServer((req, res) => {
    // Redaction testing headers
    res.setHeader('Set-Cookie', 'session=secret-session-token; Path=/; HttpOnly');
    res.setHeader('X-Server-Version', 'ReplayLab-Demo-1.0');

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/v1/users') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'success',
          users: [
            { id: 1, name: 'Alice Smith', role: 'admin' },
            { id: 2, name: 'Bob Jones', role: 'member' },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/api/v1/users/mutated') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'success',
          users: [
            { id: 1, name: 'Alice Mutated', role: 'admin' }, // Difference in name!
            { id: 2, name: 'Bob Jones', role: 'member' },
          ],
        })
      );
      return;
    }

    if (url.pathname === '/api/v1/error') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
  });

  return new Promise((resolve, reject) => {
    server.listen(preferredPort, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        const port = addr.port;
        resolve({
          server,
          port,
          url: `http://127.0.0.1:${port}`,
          close: () => new Promise<void>((res) => server.close(() => res())),
        });
      } else {
        reject(new Error('Failed to obtain server address'));
      }
    });

    server.on('error', reject);
  });
}
