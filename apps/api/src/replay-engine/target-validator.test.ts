import { describe, it, expect } from 'vitest';
import { validateAndResolveTarget, type DnsLookupFn } from './target-validator.js';

describe('Target Validator & DNS Pre-Resolution', () => {
  const mockPublicDns: DnsLookupFn = async () => [
    { address: '93.184.216.34', family: 4 },
  ];

  const mockPrivateDns: DnsLookupFn = async () => [
    { address: '127.0.0.1', family: 4 },
  ];

  const mockMetadataDns: DnsLookupFn = async () => [
    { address: '169.254.169.254', family: 4 },
  ];

  const mockDualHomedDns: DnsLookupFn = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '10.0.0.1', family: 4 }, // Contains one forbidden IP!
  ];

  it('resolves valid public HTTP and HTTPS targets with relative paths', async () => {
    const target = await validateAndResolveTarget(
      'https://api.example.com',
      '/v1/users',
      mockPublicDns
    );

    expect(target.url.toString()).toBe('https://api.example.com/v1/users');
    expect(target.resolvedIp).toBe('93.184.216.34');
    expect(target.isHttps).toBe(true);
    expect(target.port).toBe(443);
  });

  it('rejects forbidden protocols (file:, ftp:, gopher:, data:)', async () => {
    await expect(
      validateAndResolveTarget('ftp://ftp.example.com', '/file', mockPublicDns)
    ).rejects.toThrow('SSRF_FORBIDDEN_PROTOCOL');

    await expect(
      validateAndResolveTarget('file:///etc/passwd', '', mockPublicDns)
    ).rejects.toThrow('SSRF_FORBIDDEN_PROTOCOL');
  });

  it('rejects URLs containing embedded credentials', async () => {
    await expect(
      validateAndResolveTarget('https://user:pass@api.example.com', '/test', mockPublicDns)
    ).rejects.toThrow('SSRF_URL_CREDENTIALS');
  });

  it('prevents fixture path from overriding base URL origin with arbitrary external host', async () => {
    await expect(
      validateAndResolveTarget(
        'https://api.example.com',
        'https://evil-attacker.com/steal',
        mockPublicDns
      )
    ).rejects.toThrow('SSRF_ORIGIN_MISMATCH');
  });

  it('blocks DNS resolution resolving to private or loopback IP', async () => {
    await expect(
      validateAndResolveTarget('http://localhost:3000', '/status', mockPrivateDns)
    ).rejects.toThrow('SSRF_BLOCKED_DESTINATION');
  });

  it('blocks DNS resolution resolving to cloud metadata IP (169.254.169.254)', async () => {
    await expect(
      validateAndResolveTarget('http://instance-data', '/latest/meta-data', mockMetadataDns)
    ).rejects.toThrow('SSRF_BLOCKED_DESTINATION');
  });

  it('fails closed on dual-homed DNS containing both public and private addresses', async () => {
    // If ANY resolved address is private, the entire target must be rejected!
    await expect(
      validateAndResolveTarget('https://dual-homed.example.com', '/api', mockDualHomedDns)
    ).rejects.toThrow('SSRF_BLOCKED_DESTINATION');
  });
});
