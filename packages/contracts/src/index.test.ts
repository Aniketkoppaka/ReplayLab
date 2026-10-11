import { describe, it, expect } from 'vitest';
import { CONTRACTS_VERSION } from './index.js';

describe('contracts baseline smoke test', () => {
  it('exports contracts version', () => {
    expect(CONTRACTS_VERSION).toBe('0.1.0');
  });
});
