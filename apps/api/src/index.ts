/**
 * @replaylab/api
 * Backend entrypoint placeholder.
 */
import { CONTRACTS_VERSION } from '@replaylab/contracts';
import { DB_PACKAGE_VERSION } from '@replaylab/db';

export const API_VERSION = '0.1.0';

export function getSystemInfo() {
  return {
    apiVersion: API_VERSION,
    contractsVersion: CONTRACTS_VERSION,
    dbPackageVersion: DB_PACKAGE_VERSION,
  };
}

export { createApp, type AppOptions } from './app.js';
export * from './auth/index.js';
export * from './services/project-service.js';
export * from './services/in-memory-project-store.js';
export * from './services/prisma-project-store.js';
export * from './services/authorized-replay-service.js';
export * from './routes/api-router.js';
