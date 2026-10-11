import { describe, it, expect } from 'vitest';
import { DB_PACKAGE_VERSION } from './index.js';

describe('db package smoke test', () => {
  it('exports db package version', () => {
    expect(DB_PACKAGE_VERSION).toBe('0.1.0');
  });
});
