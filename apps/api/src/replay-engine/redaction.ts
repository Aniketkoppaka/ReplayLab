/**
 * Redaction and size bounding for response data that may be persisted or returned by the API
 * (captured bodies and differential diff values).
 */

export const REDACTED = '[REDACTED]';
export const TRUNCATED = '[TRUNCATED]';

/** Maximum serialized size of a persisted response body capture (256 KiB). */
export const MAX_CAPTURED_BODY_BYTES = 256 * 1024;
/** Maximum serialized size of a single diff expected/actual value (4 KiB). */
export const MAX_DIFF_VALUE_BYTES = 4 * 1024;

const MAX_DEPTH = 32;

const SENSITIVE_KEY_PATTERN =
  /pass(word|wd|phrase)?|secret|token|api[-_]?key|apikey|authorization|auth|cookie|credential|private[-_]?key|session|bearer|signature|ssn/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Returns a deep copy of `value` with the values of sensitive keys replaced by `[REDACTED]`.
 * Never mutates the input. Depth is bounded; deeper structures are replaced by `[TRUNCATED]`.
 */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return TRUNCATED;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactSensitiveData(val, depth + 1);
  }
  return out;
}

function serializedBytes(value: unknown): number {
  try {
    const s = JSON.stringify(value);
    return s === undefined ? 0 : Buffer.byteLength(s, 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Redacts then bounds a captured body. Over-limit bodies are replaced, never persisted. */
export function sanitizeCapturedBody(body: unknown): unknown {
  if (body === null || body === undefined) return null;
  const redacted = redactSensitiveData(body);
  return serializedBytes(redacted) > MAX_CAPTURED_BODY_BYTES ? TRUNCATED : redacted;
}

/** Last path segment of a JSONPath-like diff path, e.g. `$.data.items[0].token` -> `token`. */
function lastSegment(path: string): string {
  const cleaned = path.replace(/\[\d+\]/g, '');
  const idx = cleaned.lastIndexOf('.');
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

interface DiffLike {
  path: string;
  expected?: unknown;
  actual?: unknown;
}

function sanitizeDiffValue(path: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (isSensitiveKey(lastSegment(path))) return REDACTED;
  const redacted = redactSensitiveData(value);
  return serializedBytes(redacted) > MAX_DIFF_VALUE_BYTES ? TRUNCATED : redacted;
}

/**
 * Sanitizes a diff result before it is persisted or returned: values at sensitive paths or under
 * sensitive keys are redacted and oversized values are truncated. Applies regardless of
 * `captureResponseBody` because diffs embed response values.
 */
export function sanitizeDiffResult<T extends { differences: DiffLike[] }>(diff: T | null): T | null {
  if (!diff) return diff;
  return {
    ...diff,
    differences: diff.differences.map((d) => ({
      ...d,
      ...(d.expected !== undefined ? { expected: sanitizeDiffValue(d.path, d.expected) } : {}),
      ...(d.actual !== undefined ? { actual: sanitizeDiffValue(d.path, d.actual) } : {}),
    })),
  };
}
