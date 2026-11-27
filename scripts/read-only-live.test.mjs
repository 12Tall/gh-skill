import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createLiveFixture, liveScenarios } from './check-read-only-live.mjs';

async function fixture(t) {
  const base = mkdtempSync(fileURLToPath(new URL('./fixtures/live-golden-', import.meta.url)));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = createLiveFixture(base);
  return import(pathToFileURL(join(root, 'app.mjs')).href);
}

test('live fixture ground truth independently reproduces investigation and review findings', async t => {
  const app = await fixture(t);
  assert.equal(app.selectPort(), 8080);
  assert.equal(app.selectPort({ PORT: 'abc' }), 8080);
  assert.equal(app.selectPort({ PORT: '70000' }), 70000);
  assert.equal(app.selectPort({ PORT: '65536' }), 65536);
  assert.ok(Number.isNaN(app.average([])));
  assert.equal(app.average([1, '2']), 6);
  assert.equal(app.average([Number.MAX_VALUE, Number.MAX_VALUE]), Infinity);
});

test('host-derived candidate preserves all valid ports and handles proposed boundaries', async t => {
  const app = await fixture(t);
  // Independently written host-side candidate, not evaluation of model text.
  function candidate(env = {}) {
    const port = Number(env.PORT ?? 8080);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 8080;
  }
  for (let port = 1; port <= 65535; port++) {
    assert.equal(candidate({ PORT: port }), app.selectPort({ PORT: port }));
    assert.equal(candidate({ PORT: String(port) }), app.selectPort({ PORT: String(port) }));
  }
  for (const PORT of [0, -1, 65536, '65536', 1.5, 'abc', Infinity, null]) {
    assert.equal(candidate({ PORT }), 8080);
  }
  assert.equal(candidate(), 8080);
  assert.equal(candidate({}), 8080);
});

test('live scenarios stay explicit and invoking without an opt-in fails before execution', () => {
  assert.deepEqual(Object.keys(liveScenarios), ['investigate', 'plan', 'review']);
  for (const scenario of Object.values(liveScenarios)) {
    assert.ok(scenario.task.includes('app.mjs'));
    assert.ok(scenario.acceptance.length > 0);
  }
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./check-read-only-live.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /authorize exact service/);
});
