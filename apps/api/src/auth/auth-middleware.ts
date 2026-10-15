import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type AuthUser, type AuthConfig } from './token-verifier.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Express middleware to authenticate requests via Bearer JWT token.
 * Extracts and verifies the token, mapping it to req.user.
 * Fails closed on missing, malformed, expired, or invalid tokens.
 */
export function authenticate(config?: AuthConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Missing Authorization header with Bearer token',
        },
      });
      return;
    }

    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Malformed Authorization header. Format must be "Bearer <token>"',
        },
      });
      return;
    }

    const token = parts[1];
    if (!token) {
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Bearer token cannot be empty',
        },
      });
      return;
    }

    try {
      const user = await verifyToken(token, config);
      req.user = user;
      next();
    } catch {
      // Do NOT leak raw token or cryptographic errors
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Invalid, expired, or untrusted authentication token',
        },
      });
    }
  };
}
