import { jwtVerify, createRemoteJWKSet, SignJWT } from 'jose';

export interface AuthUser {
  id: string; // External subject identifier (UUID or string)
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthConfig {
  jwtSecret?: string; // Symmetric secret (for testing or local Supabase secret)
  jwksUri?: string;   // Remote JWKS URI (for standard Supabase / OIDC auth)
  issuer?: string;
  audience?: string;
}

/**
 * Gets authentication configuration from environment variables.
 * In production, SUPABASE_JWT_SECRET or SUPABASE_JWKS_URI must be configured.
 */
export function getAuthConfig(): AuthConfig {
  return {
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
    jwksUri: process.env.SUPABASE_JWKS_URI,
    issuer: process.env.SUPABASE_JWT_ISSUER,
    audience: process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated',
  };
}

/**
 * Verifies a JWT Bearer token and extracts verified claims.
 * Fails closed on any invalid, expired, malformed, or untrusted signature.
 */
export async function verifyToken(
  token: string,
  config: AuthConfig = getAuthConfig()
): Promise<AuthUser> {
  if (!token || typeof token !== 'string') {
    throw new Error('AUTH_MISSING_TOKEN: Bearer token is required');
  }

  const { jwtSecret, jwksUri, issuer, audience } = config;

  if (!jwtSecret && !jwksUri) {
    throw new Error('AUTH_CONFIG_ERROR: Neither SUPABASE_JWT_SECRET nor SUPABASE_JWKS_URI is configured');
  }

  let payload: Record<string, unknown>;

  try {
    if (jwtSecret) {
      const secretBytes = Buffer.from(jwtSecret, 'utf-8');
      const verification = await jwtVerify(token, secretBytes, {
        issuer: issuer || undefined,
        audience: audience || undefined,
      });
      payload = verification.payload as Record<string, unknown>;
    } else if (jwksUri) {
      const jwks = createRemoteJWKSet(new URL(jwksUri));
      const verification = await jwtVerify(token, jwks, {
        issuer: issuer || undefined,
        audience: audience || undefined,
      });
      payload = verification.payload as Record<string, unknown>;
    } else {
      throw new Error('AUTH_CONFIG_ERROR: No verification key source available');
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid token';
    throw new Error(`AUTH_INVALID_TOKEN: ${errorMsg}`);
  }

  const sub = payload.sub;
  if (!sub || typeof sub !== 'string' || sub.trim().length === 0) {
    throw new Error('AUTH_INVALID_TOKEN: Token is missing a valid subject (sub) claim');
  }

  // Extract email and metadata safely
  const email = typeof payload.email === 'string' ? payload.email : `${sub}@placeholder.local`;
  const userMetadata = (payload.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof userMetadata.name === 'string'
    ? userMetadata.name
    : typeof payload.name === 'string'
    ? payload.name
    : email.split('@')[0];
  const avatarUrl = typeof userMetadata.avatar_url === 'string'
    ? userMetadata.avatar_url
    : typeof payload.picture === 'string'
    ? payload.picture
    : undefined;

  return {
    id: sub,
    email,
    name,
    avatarUrl,
  };
}

/**
 * Helper to generate a test token for automated testing.
 */
export async function createTestToken(
  user: AuthUser,
  secret: string,
  options: { expiresIn?: string; audience?: string; issuer?: string } = {}
): Promise<string> {
  const secretBytes = Buffer.from(secret, 'utf-8');
  const signer = new SignJWT({
    email: user.email,
    name: user.name,
    user_metadata: {
      name: user.name,
      avatar_url: user.avatarUrl,
    },
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setAudience(options.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h');

  if (options.issuer) {
    signer.setIssuer(options.issuer);
  }

  return await signer.sign(secretBytes);
}
