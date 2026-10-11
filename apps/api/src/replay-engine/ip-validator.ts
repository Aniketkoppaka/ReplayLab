import net from 'node:net';

/**
 * Checks if an IPv4 address string is within standard private, loopback, link-local,
 * multicast, or reserved ranges.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed -> treat as unsafe
  }

  const [p0 = 0, p1 = 0, p2 = 0, _p3 = 0] = parts;

  // 0.0.0.0/8 (Current network)
  if (p0 === 0) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (p0 === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (p0 === 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata, e.g. 169.254.169.254)
  if (p0 === 169 && p1 === 254) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (p0 === 192 && p1 === 168) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (p0 === 192 && p1 === 0 && p2 === 2) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (p0 === 198 && p1 === 51 && p2 === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (p0 === 203 && p1 === 0 && p2 === 113) return true;

  // 224.0.0.0/4 (Multicast: 224 - 239)
  if (p0 >= 224 && p0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use: 240 - 255)
  if (p0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address string is within loopback, link-local, unique-local,
 * or IPv4-mapped private ranges.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 or :: (Loopback / Unspecified)
  if (normalized === '::1' || normalized === '::') return true;

  // fe80::/10 (Link-local)
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  // fc00::/7 (Unique Local Address: fc00:: to fdff::)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.replace('::ffff:', '');
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIPv4(v4Part);
    }
    return true;
  }

  return false;
}

/**
 * Validates whether an IP address is considered safe for public outbound dialing.
 * Fails closed on any private, loopback, link-local, or cloud metadata address.
 */
export function isSafePublicIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return !isPrivateOrReservedIPv4(ip);
  }
  if (version === 6) {
    return !isPrivateOrReservedIPv6(ip);
  }
  return false; // Not a valid IP format
}
