import { URL } from 'url';

export const DEFAULT_STAGING_FRONTEND_URL = 'https://replay-lab-gilt.vercel.app';
export const ALLOWED_STAGING_HOSTS = new Set([
  'replay-lab-gilt.vercel.app',
]);

/**
 * Validates the base URL for Playwright Staging E2E tests.
 *
 * Rules:
 * - Must be a valid URL.
 * - Must not contain embedded credentials (username/password).
 * - Remote staging environments must strictly use HTTPS.
 * - Localhost and loopback aliases (localhost, 127.0.0.1, ::1, *.localhost) are rejected unless explicit opt-in (ALLOW_LOCAL_STAGING_TESTING=true) is set.
 * - Non-default remote hosts are rejected unless explicitly allowed via ALLOW_CUSTOM_STAGING_HOST=true.
 */
export function validateStagingBaseUrl(
  rawUrl: string = DEFAULT_STAGING_FRONTEND_URL,
  options?: {
    allowLocalhost?: boolean;
    allowCustomHost?: boolean;
  }
): string {
  const allowLocalhost =
    options?.allowLocalhost ?? (process.env.ALLOW_LOCAL_STAGING_TESTING === 'true');
  const allowCustomHost =
    options?.allowCustomHost ?? (process.env.ALLOW_CUSTOM_STAGING_HOST === 'true');

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error(
      `[Staging Config Error] Invalid PLAYWRIGHT_BASE_URL: "${rawUrl}". ` +
      `Expected a well-formed URL (e.g. ${DEFAULT_STAGING_FRONTEND_URL}).`
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error(
      `[Staging Config Error] PLAYWRIGHT_BASE_URL cannot contain embedded credentials.`
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');

  if (isLoopback) {
    if (!allowLocalhost) {
      throw new Error(
        `[Staging Config Error] Targeting localhost (${parsed.origin}) is rejected in staging E2E mode.\n` +
        `Staging E2E tests must target deployed staging infrastructure (${DEFAULT_STAGING_FRONTEND_URL}).\n` +
        `To intentionally run staging tests against a local instance, set ALLOW_LOCAL_STAGING_TESTING=true.`
      );
    }
    return parsed.origin;
  }

  // Remote URLs must strictly use HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[Staging Config Error] Remote staging URL must strictly use HTTPS. Received protocol: "${parsed.protocol}".`
    );
  }

  // Reject unexpected remote hosts unless explicitly opted in
  if (!ALLOWED_STAGING_HOSTS.has(hostname) && !allowCustomHost) {
    throw new Error(
      `[Staging Config Error] Unexpected staging host "${hostname}". Expected configured staging host (${DEFAULT_STAGING_FRONTEND_URL}).\n` +
      `If testing an authorized preview deployment or custom staging domain, set ALLOW_CUSTOM_STAGING_HOST=true.`
    );
  }

  return parsed.origin;
}
