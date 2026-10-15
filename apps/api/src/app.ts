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

  // When explicitly requested (e.g. unit tests) or when DB is disabled in non-prod, use InMemoryProjectStore.
  const store =
    options?.useInMemoryStore || !process.env.DATABASE_URL
      ? new InMemoryProjectStore()
      : new PrismaProjectStore(prisma);

  const projectService = options?.projectService ?? new ProjectService(store);
  const replayService =
    options?.replayService ?? new AuthorizedReplayService(projectService);

  // Healthcheck / metadata endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'replaylab-api' });
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
