import express, { type Express } from 'express';
import { ProjectService } from './services/project-service.js';
import { InMemoryProjectStore } from './services/in-memory-project-store.js';
import { AuthorizedReplayService } from './services/authorized-replay-service.js';
import { createApiRouter } from './routes/api-router.js';

import { PrismaProjectStore } from './services/prisma-project-store.js';
import { prisma } from '@replaylab/db';

export interface AppOptions {
  projectService?: ProjectService;
  replayService?: AuthorizedReplayService;
  useInMemoryStore?: boolean;
  prismaClient?: typeof prisma;
}

export function createApp(options?: AppOptions): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));

  // Services initialization:
  // In production mode, DATABASE_URL is strictly required and InMemoryProjectStore is forbidden.
  if (process.env.NODE_ENV === 'production') {
    if (options?.useInMemoryStore) {
      throw new Error('CONFIGURATION_ERROR: InMemoryProjectStore cannot be used in production environment');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('CONFIGURATION_ERROR: DATABASE_URL must be configured in production environment');
    }
  }

  const dbClient = options?.prismaClient ?? prisma;

  // When explicitly requested (e.g. unit tests) or when DB is disabled in non-prod, use InMemoryProjectStore.
  const store =
    options?.useInMemoryStore || !process.env.DATABASE_URL
      ? new InMemoryProjectStore()
      : new PrismaProjectStore(dbClient);

  const projectService = options?.projectService ?? new ProjectService(store);
  const replayService =
    options?.replayService ?? new AuthorizedReplayService(projectService);

  // Defensive Security Headers & CORS
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Healthcheck (Liveness probe)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'replaylab-api' });
  });

  // Readiness probe: verifies persistence connectivity and required encryption keys
  app.get('/ready', async (_req, res) => {
    const checks: Record<string, string> = {
      api: 'ok',
    };

    let isReady = true;

    // Check encryption key configuration
    if (process.env.APP_ENCRYPTION_KEY) {
      if (process.env.APP_ENCRYPTION_KEY.length === 64) {
        checks.encryption = 'ok';
      } else {
        checks.encryption = 'misconfigured_length';
        isReady = false;
      }
    } else {
      checks.encryption = process.env.NODE_ENV === 'production' ? 'missing' : 'not_configured';
      if (process.env.NODE_ENV === 'production') {
        isReady = false;
      }
    }

    // Check database if not explicitly using in-memory store and DATABASE_URL is set
    if (!options?.useInMemoryStore && process.env.DATABASE_URL) {
      try {
        await dbClient.$queryRaw`SELECT 1`;
        checks.database = 'connected';
      } catch {
        checks.database = 'unreachable';
        isReady = false;
      }
    } else {
      checks.database = 'in_memory';
    }

    if (!isReady) {
      res.status(503).json({
        status: 'degraded',
        service: 'replaylab-api',
        checks,
      });
      return;
    }

    res.json({
      status: 'ready',
      service: 'replaylab-api',
      checks,
    });
  });

  // Mount API router
  app.use('/api/v1', createApiRouter(projectService, replayService));

  // 404 Catch-all
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  return app;
}
