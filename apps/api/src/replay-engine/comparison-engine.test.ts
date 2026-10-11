import { describe, it, expect } from 'vitest';
import {
  evaluateJsonPath,
  compareJsonPayloads,
  type MaskRule,
} from './comparison-engine.js';

describe('JSONPath & Differential Comparison Engine', () => {
  describe('evaluateJsonPath', () => {
    const data = {
      user: {
        id: 'usr_123',
        profile: {
          roles: ['admin', 'editor'],
          active: true,
        },
      },
      count: 42,
    };

    it('extracts values using dot-notation and standard JSONPath prefixes', () => {
      expect(evaluateJsonPath(data, '$.user.id')).toEqual({ exists: true, value: 'usr_123' });
      expect(evaluateJsonPath(data, 'user.profile.active')).toEqual({ exists: true, value: true });
      expect(evaluateJsonPath(data, '$.count')).toEqual({ exists: true, value: 42 });
    });

    it('extracts array indices', () => {
      expect(evaluateJsonPath(data, '$.user.profile.roles[0]')).toEqual({ exists: true, value: 'admin' });
      expect(evaluateJsonPath(data, '$.user.profile.roles[1]')).toEqual({ exists: true, value: 'editor' });
      expect(evaluateJsonPath(data, '$.user.profile.roles[9]')).toEqual({ exists: false });
    });

    it('returns exists: false for non-existent paths', () => {
      expect(evaluateJsonPath(data, '$.user.missingField')).toEqual({ exists: false });
      expect(evaluateJsonPath(data, '$.unknown.nested')).toEqual({ exists: false });
    });
  });

  describe('compareJsonPayloads - Semantic Structural Diffing', () => {
    it('reports exact match for identical objects and arrays', () => {
      const a = { id: 1, name: 'ReplayLab', tags: ['testing', 'security'] };
      const b = { id: 1, name: 'ReplayLab', tags: ['testing', 'security'] };

      const diff = compareJsonPayloads(a, b);
      expect(diff.match).toBe(true);
      expect(diff.differences).toHaveLength(0);
    });

    it('detects added, removed, and changed fields', () => {
      const expected = { id: 1, status: 'pending', legacy: 'old' };
      const actual = { id: 1, status: 'completed', extra: 'new' };

      const diff = compareJsonPayloads(expected, actual);
      expect(diff.match).toBe(false);

      const paths = diff.differences.map((d) => d.path);
      expect(paths).toContain('$.status'); // CHANGED
      expect(paths).toContain('$.legacy'); // REMOVED
      expect(paths).toContain('$.extra');  // ADDED
    });

    it('detects type changes explicitly', () => {
      const expected = { count: 10 };
      const actual = { count: '10' }; // string instead of number

      const diff = compareJsonPayloads(expected, actual);
      expect(diff.match).toBe(false);
      expect(diff.differences[0]?.type).toBe('CHANGED');
    });

    it('applies IGNORE mask rules to ignore dynamic timestamps/IDs', () => {
      const expected = {
        id: 'fix_1',
        name: 'My Fixture',
        timestamp: '2026-10-11T12:00:00Z',
        meta: { requestId: 'req_111' },
      };

      const actual = {
        id: 'fix_1',
        name: 'My Fixture',
        timestamp: '2026-10-11T20:30:00Z', // Different!
        meta: { requestId: 'req_999' },    // Different!
      };

      const maskRules: MaskRule[] = [
        { path: '$.timestamp', action: 'IGNORE' },
        { path: '$.meta.requestId', action: 'IGNORE' },
      ];

      const diff = compareJsonPayloads(expected, actual, maskRules);
      expect(diff.match).toBe(true);
      expect(diff.differences).toHaveLength(0);
    });

    it('applies TYPE_MATCH mask rules ensuring type matches while allowing value variations', () => {
      const expected = {
        id: 1,
        sessionToken: 'token_abc',
      };

      const actual = {
        id: 1,
        sessionToken: 'token_xyz_different', // Different value, same type string
      };

      const maskRules: MaskRule[] = [
        { path: '$.sessionToken', action: 'TYPE_MATCH' },
      ];

      const diff = compareJsonPayloads(expected, actual, maskRules);
      expect(diff.match).toBe(true);

      // But if actual is a number, TYPE_MATCH fails!
      const actualWrongType = {
        id: 1,
        sessionToken: 123456,
      };

      const diffFail = compareJsonPayloads(expected, actualWrongType, maskRules);
      expect(diffFail.match).toBe(false);
      expect(diffFail.differences[0]?.type).toBe('TYPE_MISMATCH');
    });
  });
});
