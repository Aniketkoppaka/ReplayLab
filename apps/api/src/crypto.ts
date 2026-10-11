import crypto from 'node:crypto';

/**
 * Validates that an encryption key is a valid 32-byte (256-bit) buffer.
 * Accepts hex string (64 chars), base64 string, or Buffer.
 */
export function parseEncryptionKey(keyInput?: string): Buffer {
  const rawKey = keyInput ?? process.env.APP_ENCRYPTION_KEY;
  if (!rawKey || typeof rawKey !== 'string') {
    throw new Error('APP_ENCRYPTION_KEY is not configured or invalid');
  }

  const trimmed = rawKey.trim();
  let keyBuffer: Buffer;

  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    keyBuffer = Buffer.from(trimmed, 'hex');
  } else {
    // Try base64
    keyBuffer = Buffer.from(trimmed, 'base64');
  }

  if (keyBuffer.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must be exactly 32 bytes (256 bits). Received ${keyBuffer.length} bytes.`
    );
  }

  return keyBuffer;
}

export interface EncryptedSecretPayload {
  ciphertext: string; // Base64
  iv: string; // Base64 (12 bytes for AES-GCM)
  authTag: string; // Base64 (16 bytes for AES-GCM)
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Generates a unique 12-byte IV per encryption operation.
 */
export function encryptSecret(
  plaintext: string,
  keyInput?: string | Buffer
): EncryptedSecretPayload {
  const key = Buffer.isBuffer(keyInput)
    ? keyInput
    : parseEncryptionKey(keyInput);

  const iv = crypto.randomBytes(12); // Recommended IV size for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted secret.
 * FAILS CLOSED on any tampering, bad auth tag, or invalid key.
 */
export function decryptSecret(
  payload: { ciphertext: string; iv: string; authTag: string },
  keyInput?: string | Buffer
): string {
  try {
    const key = Buffer.isBuffer(keyInput)
      ? keyInput
      : parseEncryptionKey(keyInput);

    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    // Fail closed: never return corrupt ciphertext or plaintext fragment
    throw new Error('Secret decryption failed (invalid auth tag or key)');
  }
}
