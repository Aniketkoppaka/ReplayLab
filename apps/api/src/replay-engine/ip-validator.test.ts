import { describe, it, expect } from 'vitest';
import {
  isSafePublicIp,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
} from './ip-validator.js';

describe('IP Address Validator & SSRF Blocklist', () => {
  describe('IPv4 Disallowed Ranges', () => {
    it('blocks loopback addresses (127.0.0.0/8)', () => {
      expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('127.0.1.5')).toBe(true);
      expect(isSafePublicIp('127.0.0.1')).toBe(false);
    });

    it('blocks private RFC 1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('10.254.1.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);

      expect(isSafePublicIp('10.0.0.1')).toBe(false);
      expect(isSafePublicIp('192.168.0.254')).toBe(false);
    });

    it('blocks cloud metadata & link-local (169.254.0.0/16, AWS/GCP 169.254.169.254)', () => {
      expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
      expect(isSafePublicIp('169.254.169.254')).toBe(false);
    });

    it('blocks current network, multicast, and reserved ranges (0.0.0.0/8, 224.0.0.0/4, 240.0.0.0/4)', () => {
      expect(isPrivateOrReservedIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateOrReservedIPv4('224.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('240.0.0.1')).toBe(true);
      expect(isSafePublicIp('0.0.0.0')).toBe(false);
    });

    it('blocks Carrier-Grade NAT (100.64.0.0/10) and benchmark ranges (198.18.0.0/15)', () => {
      expect(isPrivateOrReservedIPv4('100.64.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('100.127.255.254')).toBe(true);
      expect(isSafePublicIp('100.64.0.1')).toBe(false);

      expect(isPrivateOrReservedIPv4('198.18.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('198.19.255.255')).toBe(true);
      expect(isSafePublicIp('198.18.0.1')).toBe(false);
    });

    it('blocks octal-encoded or ambiguous IPv4 strings (e.g. 0177.0.0.1)', () => {
      expect(isPrivateOrReservedIPv4('0177.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('127.000.000.001')).toBe(true);
      expect(isSafePublicIp('0177.0.0.1')).toBe(false);
    });

    it('allows valid public IPv4 addresses', () => {
      expect(isSafePublicIp('8.8.8.8')).toBe(true); // Google DNS
      expect(isSafePublicIp('1.1.1.1')).toBe(true); // Cloudflare DNS
      expect(isSafePublicIp('93.184.216.34')).toBe(true); // example.com
    });
  });

  describe('IPv6 Disallowed Ranges', () => {
    it('blocks loopback (::1) and unspecified (::)', () => {
      expect(isPrivateOrReservedIPv6('::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('::')).toBe(true);
      expect(isSafePublicIp('::1')).toBe(false);
    });

    it('blocks link-local (fe80::/10)', () => {
      expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
      expect(isSafePublicIp('fe80::1')).toBe(false);
    });

    it('blocks unique local addresses (fc00::/7)', () => {
      expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fd12:3456::1')).toBe(true);
      expect(isSafePublicIp('fd12:3456::1')).toBe(false);
    });

    it('blocks 6to4 tunneling (2002::/16) embedding private IPv4 addresses', () => {
      // 2002:7f00:0001:: -> embeds 127.0.0.1 (0x7f000001)
      expect(isPrivateOrReservedIPv6('2002:7f00:1::')).toBe(true);
      // 2002:0a00:0001:: -> embeds 10.0.0.1 (0x0a000001)
      expect(isPrivateOrReservedIPv6('2002:0a00:1::')).toBe(true);
      expect(isSafePublicIp('2002:7f00:1::')).toBe(false);
    });

    it('blocks Teredo tunneling (2001:0000::/32)', () => {
      expect(isPrivateOrReservedIPv6('2001:0000:4136:e378:8000:63bf:3fff:fdd2')).toBe(true);
      expect(isSafePublicIp('2001:0000:4136:e378:8000:63bf:3fff:fdd2')).toBe(false);
    });

    it('blocks IPv4-mapped IPv6 addresses for private destinations', () => {
      expect(isPrivateOrReservedIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv6('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIPv6('::ffff:10.0.0.1')).toBe(true);
      expect(isSafePublicIp('::ffff:127.0.0.1')).toBe(false);
    });

    it('allows public IPv6 addresses', () => {
      expect(isSafePublicIp('2606:4700:4700::1111')).toBe(true); // Cloudflare IPv6
      expect(isSafePublicIp('2001:4860:4860::8888')).toBe(true); // Google IPv6
    });
  });
});
