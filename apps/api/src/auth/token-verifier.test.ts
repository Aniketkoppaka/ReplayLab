import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import http from 'node:http';
import { verifyToken, type AuthConfig } from './token-verifier.js';

describe('Adversarial JWT Verification Security Audit', () => {
  const symmetricSecret = 'test-symmetric-secret-key-at-least-32-chars!!';
  const wrongSecret = 'an-entirely-different-secret-key-32-chars-long';
  const trustedIssuer = 'https://supabase.replaylab.dev/auth/v1';
  const trustedAudience = 'authenticated';

  const baseConfig: AuthConfig = {
    jwtSecret: symmetricSecret,
    issuer: trustedIssuer,
    audience: trustedAudience,
  };

  it('verifies a valid token signed with HS256, correct issuer, and correct audience', async () => {
    const token = await new SignJWT({
      email: 'verified.user@replaylab.dev',
      user_metadata: { name: 'Verified User' },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('usr_valid_001')
      .setIssuer(trustedIssuer)
      .setAudience(trustedAudience)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(Buffer.from(symmetricSecret, 'utf-8'));

    const user = await verifyToken(token, baseConfig);
    expect(user.id).toBe('usr_valid_001');
    expect(user.email).toBe('verified.user@replaylab.dev');
    expect(user.name).toBe('Verified User');
  });

  describe('Algorithm Confusion & Header Tampering', () => {
    it('fails closed when token uses "none" algorithm', async () => {
      // Create token with alg: 'none'
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'usr_attacker',
          iss: trustedIssuer,
          aud: trustedAudience,
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      await expect(verifyToken(unsignedToken, baseConfig)).rejects.toThrow(
        /AUTH_INVALID_TOKEN/
      );
    });

    it('fails closed when token algorithm is mismatched (e.g. HS384/HS512 instead of HS256)', async () => {
      const token = await new SignJWT({ email: 'mismatch@replaylab.dev' })
        .setProtectedHeader({ alg: 'HS384' })
        .setSubject('usr_mismatch')
        .setIssuer(trustedIssuer)
        .setAudience(trustedAudience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(Buffer.from(symmetricSecret, 'utf-8'));

      await expect(verifyToken(token, baseConfig)).rejects.toThrow(/AUTH_INVALID_TOKEN/);
    });

    it('fails closed when token is signed with a forged/different secret', async () => {
      const token = await new SignJWT({ email: 'forged@replaylab.dev' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('usr_forged')
        .setIssuer(trustedIssuer)
        .setAudience(trustedAudience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(Buffer.from(wrongSecret, 'utf-8'));

      await expect(verifyToken(token, baseConfig)).rejects.toThrow(/signature/i);
    });
  });

  describe('Claim Validation Invariants', () => {
    it('fails closed when token is expired', async () => {
      const expiredToken = await new SignJWT({ email: 'expired@replaylab.dev' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('usr_expired')
        .setIssuer(trustedIssuer)
        .setAudience(trustedAudience)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(Buffer.from(symmetricSecret, 'utf-8'));

      await expect(verifyToken(expiredToken, baseConfig)).rejects.toThrow(
        /AUTH_INVALID_TOKEN: "exp" claim/i
      );
    });

    it('fails closed when issuer (iss) does not match expected trusted issuer', async () => {
      const wrongIssuerToken = await new SignJWT({ email: 'impostor@replaylab.dev' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('usr_impostor')
        .setIssuer('https://rogue-auth.example.com')
        .setAudience(trustedAudience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(Buffer.from(symmetricSecret, 'utf-8'));

      await expect(verifyToken(wrongIssuerToken, baseConfig)).rejects.toThrow(
        /AUTH_INVALID_TOKEN: unexpected "iss"/i
      );
    });

    it('fails closed when audience (aud) does not match expected audience', async () => {
      const wrongAudToken = await new SignJWT({ email: 'aud@replaylab.dev' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('usr_wrong_aud')
        .setIssuer(trustedIssuer)
        .setAudience('untrusted-third-party-app')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(Buffer.from(symmetricSecret, 'utf-8'));

      await expect(verifyToken(wrongAudToken, baseConfig)).rejects.toThrow(
        /AUTH_INVALID_TOKEN: unexpected "aud"/i
      );
    });

    it('fails closed when subject (sub) claim is missing or empty', async () => {
      const missingSubToken = await new SignJWT({ email: 'nosub@replaylab.dev' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(trustedIssuer)
        .setAudience(trustedAudience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(Buffer.from(symmetricSecret, 'utf-8'));

      await expect(verifyToken(missingSubToken, baseConfig)).rejects.toThrow(
        /Token is missing a valid subject/i
      );
    });

    it('fails closed on malformed or empty token strings', async () => {
      await expect(verifyToken('', baseConfig)).rejects.toThrow(/AUTH_MISSING_TOKEN/);
      await expect(verifyToken('not.a.valid.jwt', baseConfig)).rejects.toThrow(
        /AUTH_INVALID_TOKEN/
      );
    });
  });

  describe('Remote JWKS Verification & Key Rotation Defenses', () => {
    let jwksServer: http.Server;
    let jwksPort: number;
    let publicKeyJwk: Record<string, unknown>;
    let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

    beforeAll(async () => {
      // Generate standard RS256 key pair
      const keyPair = await generateKeyPair('RS256', { extractable: true });
      privateKey = keyPair.privateKey;
      publicKeyJwk = await exportJWK(keyPair.publicKey);
      publicKeyJwk.kid = 'replaylab-test-key-1';
      publicKeyJwk.alg = 'RS256';
      publicKeyJwk.use = 'sig';

      jwksServer = http.createServer((req, res) => {
        if (req.url === '/.well-known/jwks.json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ keys: [publicKeyJwk] }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => {
        jwksServer.listen(0, '127.0.0.1', () => {
          const addr = jwksServer.address();
          if (typeof addr === 'object' && addr !== null) {
            jwksPort = addr.port;
          }
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
    });

    it('verifies token signed with private key corresponding to remote JWKS', async () => {
      const jwksConfig: AuthConfig = {
        jwksUri: `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`,
        issuer: trustedIssuer,
        audience: trustedAudience,
      };

      const token = await new SignJWT({
        email: 'jwks.user@replaylab.dev',
        user_metadata: { name: 'JWKS User' },
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'replaylab-test-key-1' })
        .setSubject('usr_jwks_001')
        .setIssuer(trustedIssuer)
        .setAudience(trustedAudience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      const user = await verifyToken(token, jwksConfig);
      expect(user.id).toBe('usr_jwks_001');
      expect(user.email).toBe('jwks.user@replaylab.dev');
    });

    it('fails closed when remote JWKS lacks the matching kid', async () => {
      const jwksConfig: AuthConfig = {
        jwksUri: `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`,
        issuer: trustedIssuer,
        audience: trustedAudience,
      };

      const rogueKeyPair = await generateKeyPair('RS256');
      const token = await new SignJWT({ email: 'unknown.kid@replaylab.dev' })
        .setProtectedHeader({ alg: 'RS256', kid: 'unknown-key-id-999' })
        .setSubject('usr_unknown_kid')
        .setIssuer(trustedIssuer)
        .setAudience(trustedAudience)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(rogueKeyPair.privateKey);

      await expect(verifyToken(token, jwksConfig)).rejects.toThrow(/AUTH_INVALID_TOKEN/);
    });
  });
});
