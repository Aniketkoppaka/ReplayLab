/**
 * Evaluates a JSONPath query (e.g. "$.data.user.id" or "data.user.id") on an object.
 * Returns { exists: boolean, value?: unknown }.
 */
export function evaluateJsonPath(
  obj: unknown,
  path: string
): { exists: boolean; value?: unknown } {
  if (obj == null) {
    return { exists: false };
  }

  // Normalize path: strip leading "$." or "$"
  let cleanPath = path.trim();
  if (cleanPath.startsWith('$.')) {
    cleanPath = cleanPath.slice(2);
  } else if (cleanPath.startsWith('$')) {
    cleanPath = cleanPath.slice(1);
  }

  if (cleanPath === '') {
    return { exists: true, value: obj };
  }

  // Tokenize segments handling dot-notation and simple bracket indices e.g. "items[0].id"
  const tokens = cleanPath
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .filter((t) => t.length > 0);

  let current: unknown = obj;

  for (const token of tokens) {
    if (token === '__proto__' || token === 'constructor' || token === 'prototype') {
      return { exists: false };
    }

    if (current == null || typeof current !== 'object') {
      return { exists: false };
    }

    if (Array.isArray(current)) {
      const idx = parseInt(token, 10);
      if (isNaN(idx) || idx < 0 || idx >= current.length) {
        return { exists: false };
      }
      current = current[idx];
    } else {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, token)) {
        return { exists: false };
      }
      current = record[token];
    }
  }

  return { exists: true, value: current };
}

export interface MaskRule {
  path: string;
  action: 'IGNORE' | 'TYPE_MATCH';
}

export interface DiffDifference {
  path: string;
  type: 'ADDED' | 'REMOVED' | 'CHANGED' | 'TYPE_MISMATCH';
  expected?: unknown;
  actual?: unknown;
}

export interface DiffResult {
  match: boolean;
  differences: DiffDifference[];
}

export const MAX_DIFF_DIFFERENCES = 500;

/**
 * Checks if a path matches an IGNORE mask rule.
 */
function isPathIgnored(path: string, maskRules: MaskRule[]): boolean {
  for (const rule of maskRules) {
    if (rule.action === 'IGNORE') {
      let rPath = rule.path.trim();
      if (rPath.startsWith('$.')) rPath = rPath.slice(2);
      if (rPath.startsWith('$')) rPath = rPath.slice(1);

      let curPath = path.trim();
      if (curPath.startsWith('$.')) curPath = curPath.slice(2);
      if (curPath.startsWith('$')) curPath = curPath.slice(1);

      if (rPath === curPath) return true;
    }
  }
  return false;
}

/**
 * Recursively computes semantic structural differences between expected baseline and actual response.
 * Enforces key sorting for deterministic order and bounds differences to MAX_DIFF_DIFFERENCES (500).
 */
export function compareJsonPayloads(
  expected: unknown,
  actual: unknown,
  maskRules: MaskRule[] = [],
  currentPath = '$'
): DiffResult {
  const differences: DiffDifference[] = [];

  function appendDiff(diff: DiffDifference) {
    if (differences.length < MAX_DIFF_DIFFERENCES) {
      differences.push(diff);
    }
  }

  // Check if current path is ignored
  if (isPathIgnored(currentPath, maskRules)) {
    return { match: true, differences: [] };
  }

  // Check for TYPE_MATCH rule at current path
  const typeRule = maskRules.find(
    (r) =>
      r.action === 'TYPE_MATCH' &&
      r.path.replace(/^\$\.?/, '') === currentPath.replace(/^\$\.?/, '')
  );

  if (typeRule) {
    // Both undefined or missing
    if (expected === undefined && actual === undefined) {
      return { match: true, differences: [] };
    }
    // Null handling
    if (expected === null && actual === null) {
      return { match: true, differences: [] };
    }
    if ((expected === null && actual !== null) || (expected !== null && actual === null)) {
      differences.push({
        path: currentPath,
        type: 'TYPE_MISMATCH',
        expected: expected === null ? 'type:null' : `type:${typeof expected}`,
        actual: actual === null ? 'type:null' : `type:${typeof actual}`,
      });
      return { match: false, differences };
    }
    if (Array.isArray(expected) !== Array.isArray(actual)) {
      differences.push({
        path: currentPath,
        type: 'TYPE_MISMATCH',
        expected: Array.isArray(expected) ? 'type:array' : `type:${typeof expected}`,
        actual: Array.isArray(actual) ? 'type:array' : `type:${typeof actual}`,
      });
      return { match: false, differences };
    }
    if (typeof expected !== typeof actual) {
      differences.push({
        path: currentPath,
        type: 'TYPE_MISMATCH',
        expected: `type:${typeof expected}`,
        actual: `type:${typeof actual}`,
      });
      return { match: false, differences };
    }
    // Type matches -> value difference is masked
    return { match: true, differences: [] };
  }

  // Both null, both undefined, or identical primitives
  if (expected === actual) {
    return { match: true, differences: [] };
  }

  // Explicit null vs non-null or differing primitives
  if (expected === null || actual === null || typeof expected !== typeof actual) {
    differences.push({
      path: currentPath,
      type: 'CHANGED',
      expected,
      actual,
    });
    return { match: false, differences };
  }

  // Array comparison
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLen = Math.max(expected.length, actual.length);
    for (let i = 0; i < maxLen; i++) {
      if (differences.length >= MAX_DIFF_DIFFERENCES) break;
      const elemPath = `${currentPath}[${i}]`;
      if (i >= expected.length) {
        if (!isPathIgnored(elemPath, maskRules)) {
          appendDiff({
            path: elemPath,
            type: 'ADDED',
            actual: actual[i],
          });
        }
      } else if (i >= actual.length) {
        if (!isPathIgnored(elemPath, maskRules)) {
          appendDiff({
            path: elemPath,
            type: 'REMOVED',
            expected: expected[i],
          });
        }
      } else {
        const subDiff = compareJsonPayloads(expected[i], actual[i], maskRules, elemPath);
        for (const d of subDiff.differences) {
          appendDiff(d);
          if (differences.length >= MAX_DIFF_DIFFERENCES) break;
        }
      }
    }

    return {
      match: differences.length === 0,
      differences,
    };
  }

  // Object comparison
  if (typeof expected === 'object' && typeof actual === 'object') {
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;

    // Deterministic sorted keys
    const allKeys = Array.from(new Set([...Object.keys(expObj), ...Object.keys(actObj)])).sort();

    for (const key of allKeys) {
      if (differences.length >= MAX_DIFF_DIFFERENCES) break;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

      const fieldPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`;
      if (isPathIgnored(fieldPath, maskRules)) {
        continue;
      }

      const hasAct = Object.prototype.hasOwnProperty.call(actObj, key);
      const hasExp = Object.prototype.hasOwnProperty.call(expObj, key);

      if (!hasAct) {
        appendDiff({
          path: fieldPath,
          type: 'REMOVED',
          expected: expObj[key],
        });
      } else if (!hasExp) {
        appendDiff({
          path: fieldPath,
          type: 'ADDED',
          actual: actObj[key],
        });
      } else {
        const subDiff = compareJsonPayloads(expObj[key], actObj[key], maskRules, fieldPath);
        for (const d of subDiff.differences) {
          appendDiff(d);
          if (differences.length >= MAX_DIFF_DIFFERENCES) break;
        }
      }
    }

    return {
      match: differences.length === 0,
      differences,
    };
  }

  // Differing primitives
  appendDiff({
    path: currentPath,
    type: 'CHANGED',
    expected,
    actual,
  });

  return {
    match: differences.length === 0,
    differences,
  };
}
