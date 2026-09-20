/* tests/harness.mjs — a tiny dependency-free test runner. */

const suites = [];
let currentSuite = null;

export function suite(name, fn) {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

export function test(name, fn, { timeout = 30000, skip = false } = {}) {
  if (!currentSuite) throw new Error('test() must be called inside suite()');
  currentSuite.tests.push({ name, fn, timeout, skip });
}

export function assert(cond, message = 'assertion failed') {
  if (!cond) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual failed'}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual, expected, tolerance = 0.001, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'assertClose failed'}: expected ${expected} ±${tolerance}, got ${actual}`);
  }
}

export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || 'assertDeepEqual failed'}\n  expected: ${b}\n  actual:   ${a}`);
}

export function assertThrows(fn, message = 'expected function to throw') {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(message);
}

export async function runAll({ filter = null, onResult = null } = {}) {
  const results = { passed: 0, failed: 0, skipped: 0, failures: [], durationMs: 0 };
  const started = Date.now();
  for (const s of suites) {
    const tests = filter ? s.tests.filter((t) => `${s.name} ${t.name}`.toLowerCase().includes(filter.toLowerCase())) : s.tests;
    if (!tests.length) continue;
    console.log(`\n\x1b[1m${s.name}\x1b[0m`);
    for (const t of tests) {
      if (t.skip) {
        results.skipped += 1;
        console.log(`  \x1b[33m○\x1b[0m ${t.name} (skipped)`);
        continue;
      }
      const t0 = Date.now();
      try {
        await withTimeout(t.fn(), t.timeout, t.name);
        results.passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${t.name} \x1b[90m${Date.now() - t0}ms\x1b[0m`);
        onResult && onResult({ suite: s.name, test: t.name, ok: true });
      } catch (err) {
        results.failed += 1;
        results.failures.push({ suite: s.name, test: t.name, error: err });
        console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
        console.log(`    \x1b[31m${String(err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n    ') : err)}\x1b[0m`);
        onResult && onResult({ suite: s.name, test: t.name, ok: false, error: err });
      }
    }
  }
  results.durationMs = Date.now() - started;
  console.log(`\n\x1b[1mSummary\x1b[0m  ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped  (${(results.durationMs / 1000).toFixed(1)}s)`);
  return results;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms in "${label}"`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
