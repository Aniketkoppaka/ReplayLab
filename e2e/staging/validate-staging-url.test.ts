import { describe, it, expect } from 'vitest';
import { validateStagingBaseUrl, DEFAULT_STAGING_FRONTEND_URL } from './validate-staging-url';

describe('validateStagingBaseUrl', () => {
  it('accepts the default HTTPS staging URL', () => {
    const url = validateStagingBaseUrl(DEFAULT_STAGING_FRONTEND_URL);
    expect(url).toBe('https://replay-lab-gilt.vercel.app');
  });

  it('rejects unexpected remote hosts by default', () => {
    expect(() => validateStagingBaseUrl('https://malicious-or-unintended.example.com')).toThrowError(
      /Unexpected staging host/
    );
  });

  it('permits custom remote hosts when allowCustomHost is enabled', () => {
    const url = validateStagingBaseUrl('https://custom-preview-branch.vercel.app/test', {
      allowCustomHost: true,
    });
    expect(url).toBe('https://custom-preview-branch.vercel.app');
  });

  it('rejects malformed URLs', () => {
    expect(() => validateStagingBaseUrl('not-a-valid-url')).toThrowError(
      /Invalid PLAYWRIGHT_BASE_URL/
    );
  });

  it('rejects remote URLs using plain HTTP', () => {
    expect(() => validateStagingBaseUrl('http://replay-lab-gilt.vercel.app')).toThrowError(
      /Remote staging URL must strictly use HTTPS/
    );
  });

  it('rejects URLs containing embedded credentials', () => {
    expect(() =>
      validateStagingBaseUrl('https://user:pass@replay-lab-gilt.vercel.app')
    ).toThrowError(/cannot contain embedded credentials/);
  });

  it('rejects localhost by default to prevent accidental local targeting', () => {
    expect(() => validateStagingBaseUrl('http://localhost:3000')).toThrowError(
      /Targeting localhost.*is rejected in staging E2E mode/
    );
    expect(() => validateStagingBaseUrl('http://127.0.0.1:3000')).toThrowError(
      /Targeting localhost.*is rejected in staging E2E mode/
    );
    expect(() => validateStagingBaseUrl('http://app.localhost:3000')).toThrowError(
      /Targeting localhost.*is rejected in staging E2E mode/
    );
  });

  it('permits localhost when explicit opt-in allowLocalhost is true', () => {
    const url = validateStagingBaseUrl('http://localhost:3000', { allowLocalhost: true });
    expect(url).toBe('http://localhost:3000');
  });
});
