import dns from 'node:dns/promises';
import { isSafePublicIp } from './ip-validator.js';

export interface ValidatedTarget {
  url: URL;
  resolvedIp: string;
  isHttps: boolean;
  port: number;
}

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

/**
 * Default DNS lookup implementation using Node.js dns/promises.
 * Fetches all IPv4 and IPv6 addresses.
 */
export const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  const results = await dns.lookup(hostname, { all: true });
  return results;
};

/**
 * Validates an environment base URL and combines it with a fixture request path.
 * Enforces scheme checking, URL syntax, and DNS pre-resolution with SSRF IP filtering.
 *
 * @param baseUrlStr The configured environment base URL
 * @param pathStr The fixture request path (relative or path component)
 * @param dnsLookup Optional mockable DNS lookup function for testing
 */
export async function validateAndResolveTarget(
  baseUrlStr: string,
  pathStr: string,
  dnsLookup: DnsLookupFn = defaultDnsLookup
): Promise<ValidatedTarget> {
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlStr);
  } catch {
    throw new Error('SSRF_INVALID_URL: Invalid environment base URL');
  }

  // 1. Protocol Scheme Verification (http: and https: only)
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error(
      `SSRF_FORBIDDEN_PROTOCOL: Protocol "${baseUrl.protocol}" is not supported`
    );
  }

  // 2. Reject credentials in base URL
  if (baseUrl.username || baseUrl.password) {
    throw new Error('SSRF_URL_CREDENTIALS: URL credentials are not permitted');
  }

  // 3. Path Combining & Prevention of Arbitrary Absolute URL Override
  // Reject protocol-relative URLs (e.g. "//evil.com/path")
  let combinedUrl: URL;
  const trimmedPath = pathStr.trim();

  if (trimmedPath.startsWith('//')) {
    throw new Error('SSRF_INVALID_URL: Protocol-relative paths are forbidden');
  }

  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    try {
      const explicitUrl = new URL(trimmedPath);
      if (explicitUrl.origin !== baseUrl.origin) {
        throw new Error(
          'SSRF_ORIGIN_MISMATCH: Fixture path cannot override environment base URL origin'
        );
      }
      combinedUrl = explicitUrl;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('SSRF_')) throw err;
      throw new Error('SSRF_INVALID_URL: Malformed absolute URL in fixture path');
    }
  } else {
    // Relative path resolution
    const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
    try {
      combinedUrl = new URL(normalizedPath, baseUrl);
    } catch {
      throw new Error('SSRF_INVALID_URL: Failed to construct target URL');
    }
  }

  // Ensure resolved URL does not contain credentials
  if (combinedUrl.username || combinedUrl.password) {
    throw new Error('SSRF_URL_CREDENTIALS: URL credentials are not permitted');
  }

  // Ensure origin still matches baseUrl origin (e.g. against parser discrepancies)
  if (combinedUrl.origin !== baseUrl.origin) {
    throw new Error('SSRF_ORIGIN_MISMATCH: Destination origin does not match base URL origin');
  }

  const hostname = combinedUrl.hostname;
  if (!hostname || hostname.length === 0) {
    throw new Error('SSRF_INVALID_URL: Missing target hostname');
  }

  // 4. Resolve DNS & Validate All IPs
  let resolvedAddresses: Array<{ address: string; family: number }>;
  try {
    resolvedAddresses = await dnsLookup(hostname);
  } catch {
    throw new Error(`SSRF_DNS_RESOLUTION_FAILED: Failed to resolve hostname "${hostname}"`);
  }

  if (!resolvedAddresses || resolvedAddresses.length === 0) {
    throw new Error(`SSRF_NO_ADDRESSES: No IP addresses resolved for hostname "${hostname}"`);
  }

  // All resolved IPs must be safe. If ANY address is private/loopback/cloud-metadata, reject!
  // (Prevents dual-homed DNS rebinding or internal evasion)
  for (const entry of resolvedAddresses) {
    if (!isSafePublicIp(entry.address)) {
      throw new Error(
        `SSRF_BLOCKED_DESTINATION: Destination resolves to restricted IP address`
      );
    }
  }

  // Select the first validated IP address for pinned socket connection
  const targetEntry = resolvedAddresses[0];
  if (!targetEntry) {
    throw new Error('SSRF_NO_ADDRESSES: No valid address entry available');
  }

  const port = combinedUrl.port
    ? parseInt(combinedUrl.port, 10)
    : combinedUrl.protocol === 'https:'
    ? 443
    : 80;

  return {
    url: combinedUrl,
    resolvedIp: targetEntry.address,
    isHttps: combinedUrl.protocol === 'https:',
    port,
  };
}
