import { describe, it, expect } from 'vitest';
import { API_VERSION, getSystemInfo } from './index.js';

describe('api baseline smoke test', () => {
  it('exports api version and resolves workspace packages', () => {
    expect(API_VERSION).toBe('0.1.0');
    const info = getSystemInfo();
    expect(info.contractsVersion).toBe('0.1.0');
    expect(info.dbPackageVersion).toBe('0.1.0');
  });
});
