import { describe, it, expect } from 'vitest';
import { parseEncryptionKey, encryptSecret, decryptSecret } from './crypto.js';

describe('AES-256-GCM Secret Crypto Service (ADR-0005)', () => {
  const validHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('validates 32-byte hex encryption key', () => {
    const keyBuf = parseEncryptionKey(validHexKey);
    expect(keyBuf.length).toBe(32);
  });

  it('rejects invalid key lengths or missing key', () => {
    expect(() => parseEncryptionKey('')).toThrow();
    expect(() => parseEncryptionKey('too-short')).toThrow();
    expect(() => parseEncryptionKey(undefined)).toThrow();
  });

  it('encrypts and successfully decrypts secret plaintext', () => {
    const secret = 'super-sensitive-api-token-xyz-12345';
    const encrypted = encryptSecret(secret, validHexKey);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toContain(secret);

    const decrypted = decryptSecret(encrypted, validHexKey);
    expect(decrypted).toBe(secret);
  });

  it('fails closed on tampered ciphertext or modified auth tag', () => {
    const secret = 'test-token';
    const encrypted = encryptSecret(secret, validHexKey);

    // Tamper with ciphertext
    const tamperedPayload = {
      ...encrypted,
      ciphertext: Buffer.from('corrupted-data').toString('base64'),
    };

    expect(() => decryptSecret(tamperedPayload, validHexKey)).toThrow(
      'Secret decryption failed'
    );

    // Tamper with auth tag
    const tamperedTagPayload = {
      ...encrypted,
      authTag: Buffer.from('wrong-auth-tag-12').toString('base64'),
    };

    expect(() => decryptSecret(tamperedTagPayload, validHexKey)).toThrow(
      'Secret decryption failed'
    );
  });

  it('binds ciphertext to context via Associated Authenticated Data (AAD)', () => {
    const secret = 'db-password-123';
    const aadContext = 'env:env_prod_01:key:DB_PASSWORD';
    const wrongContext = 'env:env_staging_02:key:DB_PASSWORD';

    const encrypted = encryptSecret(secret, validHexKey, aadContext);

    // Decrypt with correct AAD succeeds
    const decrypted = decryptSecret(encrypted, validHexKey, aadContext);
    expect(decrypted).toBe(secret);

    // Decrypt with mismatched AAD fails closed
    expect(() => decryptSecret(encrypted, validHexKey, wrongContext)).toThrow(
      'Secret decryption failed'
    );

    // Decrypt with omitted AAD fails closed
    expect(() => decryptSecret(encrypted, validHexKey)).toThrow(
      'Secret decryption failed'
    );
  });
});
