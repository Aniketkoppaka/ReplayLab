import net from 'node:net';

/**
 * Checks if an IPv4 address string is within standard private, loopback, link-local,
 * multicast, CGNAT, benchmark, or reserved ranges.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  // Reject octal (e.g. 0177.0.0.1) or hex representations
  const rawParts = ip.split('.');
  if (rawParts.length !== 4) return true;
  for (const part of rawParts) {
    if (!/^\d+$/.test(part)) return true;
    if (part.length > 1 && part.startsWith('0')) return true; // Octal leading zero
  }

  const parts = rawParts.map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed -> treat as unsafe
  }

  const [p0 = 0, p1 = 0, p2 = 0, _p3 = 0] = parts;

  // 0.0.0.0/8 (Current network / broadcast)
  if (p0 === 0) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (p0 === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT / Shared Address RFC 6598: 100.64.0.0 - 100.127.255.255)
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (p0 === 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata, e.g. 169.254.169.254)
  if (p0 === 169 && p1 === 254) return true;

  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (p0 === 192 && p1 === 0 && p2 === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (p0 === 192 && p1 === 0 && p2 === 2) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (p0 === 192 && p1 === 168) return true;

  // 198.18.0.0/15 (Network benchmark tests RFC 2544: 198.18.0.0 - 198.19.255.255)
  if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (p0 === 198 && p1 === 51 && p2 === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (p0 === 203 && p1 === 0 && p2 === 113) return true;

  // 224.0.0.0/4 (Multicast: 224 - 239)
  if (p0 >= 224 && p0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use: 240 - 255)
  if (p0 >= 240) return true;

  // 255.255.255.255 (Broadcast)
  if (p0 === 255 && p1 === 255 && p2 === 255 && _p3 === 255) return true;

  return false;
}

/**
 * Parses an IPv6 address into 8 16-bit hex words.
 */
function parseIPv6Words(ip: string): number[] | null {
  let cleanIp = ip.toLowerCase();

  // Handle embedded IPv4 at the end (e.g. ::ffff:192.168.1.1 or ::192.168.1.1)
  const lastColon = cleanIp.lastIndexOf(':');
  if (lastColon !== -1) {
    const potentialV4 = cleanIp.slice(lastColon + 1);
    if (potentialV4.includes('.')) {
      const v4Parts = potentialV4.split('.').map((p) => parseInt(p, 10));
      if (v4Parts.length !== 4 || v4Parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        return null;
      }
      const [v0 = 0, v1 = 0, v2 = 0, v3 = 0] = v4Parts;
      const word1 = (v0 << 8) | v1;
      const word2 = (v2 << 8) | v3;
      cleanIp = `${cleanIp.slice(0, lastColon)}:${word1.toString(16)}:${word2.toString(16)}`;
    }
  }

  const parts = cleanIp.split('::');
  if (parts.length > 2) return null; // Only one '::' permitted

  let words: number[] = [];
  if (parts.length === 2) {
    const leftStr = parts[0];
    const rightStr = parts[1];
    const left = leftStr ? leftStr.split(':').filter(Boolean).map((s) => parseInt(s, 16)) : [];
    const right = rightStr ? rightStr.split(':').filter(Boolean).map((s) => parseInt(s, 16)) : [];
    if (left.some(isNaN) || right.some(isNaN)) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    words = [...left, ...new Array(missing).fill(0), ...right];
  } else {
    words = cleanIp.split(':').map((s) => parseInt(s, 16));
    if (words.length !== 8 || words.some(isNaN)) return null;
  }

  return words;
}

/**
 * Checks if an IPv6 address string is within loopback, link-local, unique-local,
 * 6to4 private, Teredo, or IPv4-mapped/compatible private ranges.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const words = parseIPv6Words(ip);
  if (!words || words.length !== 8) {
    return true; // Malformed -> treat as unsafe
  }

  const [w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0, w6 = 0, w7 = 0] = words;

  // :: (Unspecified)
  if (words.every((w) => w === 0)) return true;

  // ::1 (Loopback)
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 1) {
    return true;
  }

  // IPv4-mapped (::ffff:0:0/96 or ::ffff:x.x.x.x)
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff) {
    const v4 = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
    return isPrivateOrReservedIPv4(v4);
  }

  // IPv4-compatible (::x.x.x.x / deprecated RFC 4291)
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
    const v4 = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
    return isPrivateOrReservedIPv4(v4);
  }

  // 6to4 (2002::/16) - embeds IPv4 in w1:w2
  if (w0 === 0x2002) {
    const v4 = `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;
    return isPrivateOrReservedIPv4(v4);
  }

  // Teredo (2001:0000::/32)
  if (w0 === 0x2001 && w1 === 0x0000) {
    return true;
  }

  // Unique Local Address (fc00::/7 -> fc00 to fdff)
  if ((w0 & 0xfe00) === 0xfc00) {
    return true;
  }

  // Link-local Unicast (fe80::/10 -> fe80 to febf)
  if ((w0 & 0xffc0) === 0xfe80) {
    return true;
  }

  // Multicast (ff00::/8)
  if ((w0 & 0xff00) === 0xff00) {
    return true;
  }

  // Discard Prefix (100::/64 RFC 6666)
  if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) {
    return true;
  }

  return false;
}

/**
 * Validates whether an IP address is considered safe for public outbound dialing.
 * Fails closed on any private, loopback, link-local, cloud metadata, or ambiguous address.
 */
export function isSafePublicIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return !isPrivateOrReservedIPv4(ip);
  }
  if (version === 6) {
    return !isPrivateOrReservedIPv6(ip);
  }
  return false; // Not a valid standard IP format
}
