import http from 'node:http';
import { createApp } from '../../apps/api/src/app.js';
import { ProjectService } from '../../apps/api/src/services/project-service.js';
import { InMemoryProjectStore } from '../../apps/api/src/services/in-memory-project-store.js';
import { AuthorizedReplayService } from '../../apps/api/src/services/authorized-replay-service.js';
import { createTestToken } from '../../apps/api/src/auth/token-verifier.js';

export interface TestApiInstance {
  server: http.Server;
  port: number;
  url: string;
  store: InMemoryProjectStore;
  ownerToken: string;
  outsiderToken: string;
  ownerId: string;
  outsiderId: string;
  jwtSecret: string;
  close: () => Promise<void>;
}

export async function startTestApiServer(preferredPort = 3001): Promise<TestApiInstance> {
  const jwtSecret = 'e2e-playwright-test-jwt-secret-key-32-chars-long!';
  process.env.SUPABASE_JWT_SECRET = jwtSecret;
  process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const store = new InMemoryProjectStore();
  const projectService = new ProjectService(store);
  const replayService = new AuthorizedReplayService(projectService, store);
  const app = createApp({ projectService, replayService });

  const ownerId = 'usr_e2e_owner';
  const outsiderId = 'usr_e2e_outsider';

  const ownerToken = await createTestToken({ id: ownerId, email: 'owner@replaylab.dev' }, jwtSecret);
  const outsiderToken = await createTestToken({ id: outsiderId, email: 'outsider@replaylab.dev' }, jwtSecret);

  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(preferredPort, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        const port = addr.port;
        resolve({
          server,
          port,
          url: `http://127.0.0.1:${port}`,
          store,
          ownerToken,
          outsiderToken,
          ownerId,
          outsiderId,
          jwtSecret,
          close: () => new Promise<void>((res) => server.close(() => res())),
        });
      } else {
        reject(new Error('Failed to get test API port'));
      }
    });

    server.on('error', reject);
  });
}
