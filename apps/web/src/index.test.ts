import { describe, it, expect } from 'vitest';
import { WEB_APP_VERSION, getWebClientInfo } from './index.js';

describe('web baseline smoke test', () => {
  it('exports web app version and resolves contracts package', () => {
    expect(WEB_APP_VERSION).toBe('0.1.0');
    const info = getWebClientInfo();
    expect(info.contractsVersion).toBe('0.1.0');
  });
});
