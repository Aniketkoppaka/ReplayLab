import http from 'node:http';
import { createApp } from './app.js';
import { prisma } from '@replaylab/db';

/**
 * Production & local executable server entry point for ReplayLab API.
 * Configures graceful termination (SIGTERM, SIGINT), socket draining,
 * and database disconnects.
 */
export async function startServer(port: number = parseInt(process.env.PORT || '3001', 10)) {
  const app = createApp();
  const server = http.createServer(app);

  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[API] Received ${signal}. Initiating graceful shutdown...`);

    // Stop accepting new connections
    server.close(async (err) => {
      if (err) {
        console.error('[API] Error closing HTTP server:', err);
        process.exit(1);
      }

      console.log('[API] HTTP server closed.');

      // Disconnect Prisma persistence
      try {
        if (process.env.DATABASE_URL) {
          await prisma.$disconnect();
          console.log('[API] Database connection cleanly disconnected.');
        }
      } catch (dbErr) {
        console.error('[API] Error disconnecting database:', dbErr);
      }

      process.exit(0);
    });

    // Forced termination timeout after 10s if connections fail to drain
    setTimeout(() => {
      console.error('[API] Graceful shutdown timed out. Forcing process termination.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return new Promise<http.Server>((resolve, reject) => {
    server.listen(port, () => {
      console.log(`[API] ReplayLab API listening on port ${port} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
      resolve(server);
    });
    server.on('error', (err) => {
      reject(err);
    });
  });
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  startServer().catch((err) => {
    console.error('[API] Failed to start server:', err);
    process.exit(1);
  });
}
