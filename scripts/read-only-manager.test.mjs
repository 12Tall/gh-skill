import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createReadOnlyTaskManager } from '../pi/read-only-manager.mjs';
const workerPath = fileURLToPath(new URL('./fixtures/manager-worker.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(fileURLToPath(new URL('./fixtures/manager-', import.meta.url)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, task: 'success', acceptance: 'local fixture only', sdkPackage: root, authPath: join(root, 'unused-auth.json'), provider: 'test', model: 'test' };
}
const approved = { approved: true };

test('manager requires approval and snapshots only allowed configuration', async t => {
  const config = fixture(t);
  const manager = createReadOnlyTaskManager({ workerPath });
  await assert.rejects(manager.run(config), /APPROVAL_REQUIRED/);
  await assert.rejects(manager.run({ ...config, root: '.' }, approved), /INVALID_CONFIG/);
  await assert.rejects(manager.run({ ...config, command: 'arbitrary' }, approved), /INVALID_CONFIG/);
  const promise = manager.run(config, approved);
  config.task = 'hang';
  const result = await promise;
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, false);
  assert.equal(manager.getState(), 'idle');
});

test('manager preserves UTF-8 across output chunks', async t => {
  const result = await createReadOnlyTaskManager({ workerPath }).run({ ...fixture(t), task: 'unicode' }, approved);
  assert.equal(result.summary, '验证完成');
});

test('nonzero exit, malformed/forged results and output floods cannot pass', async t => {
  const config = fixture(t);
  const manager = createReadOnlyTaskManager({ workerPath, maxOutputBytes: 4096 });
  for (const [task, code] of [['nonzero', 'WORKER_EXIT'], ['malformed', 'INVALID_RESULT'], ['forged', 'INVALID_RESULT'], ['forged-tool', 'INVALID_RESULT'], ['failed-evidence', 'INVALID_RESULT'], ['flood', 'OUTPUT_LIMIT'], ['stderr', 'OUTPUT_LIMIT']]) {
    const result = await manager.run({ ...config, task }, approved);
    assert.equal(result.status, 'failed', task);
    assert.equal(result.code, code, task);
    assert.equal(manager.getState(), 'idle');
  }
});

test('timeout kills a resistant process group and frees the slot', { timeout: 5000 }, async t => {
  const config = fixture(t);
  const manager = createReadOnlyTaskManager({ workerPath, timeoutMs: 400, graceMs: 80 });
  const result = await manager.run({ ...config, task: 'tree' }, approved);
  assert.equal(result.status, 'timed_out');
  assert.equal(result.code, 'TIMEOUT');
  assert.equal(manager.getState(), 'idle');
  assert.equal((await manager.run(config, approved)).status, 'completed');
});

test('cancellation waits for close; concurrent runs are rejected, not queued', { timeout: 5000 }, async t => {
  const config = fixture(t);
  const manager = createReadOnlyTaskManager({ workerPath, timeoutMs: 3000, graceMs: 50 });
  const controller = new AbortController();
  const pending = manager.run({ ...config, task: 'hang' }, { ...approved, signal: controller.signal });
  await assert.rejects(manager.run(config, approved), /BUSY/);
  await new Promise(resolve => setTimeout(resolve, 150));
  controller.abort();
  assert.equal(manager.getState(), 'stopping');
  assert.equal((await pending).status, 'cancelled');
  assert.equal(manager.getState(), 'idle');
  assert.equal((await manager.run(config, approved)).status, 'completed');
});

test('pre-cancelled tasks do not spawn and spawn failures release the slot', async t => {
  const config = fixture(t);
  const manager = createReadOnlyTaskManager({ workerPath });
  assert.equal((await manager.run(config, { ...approved, signal: AbortSignal.abort() })).status, 'cancelled');
  const result = await manager.run({ ...config, root: join(config.root, 'missing') }, approved);
  assert.equal(result.status, 'failed');
  assert.equal(manager.getState(), 'idle');
});

test('real worker reports invalid SDK without contacting a model', async t => {
  const result = await createReadOnlyTaskManager().run(fixture(t), approved);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'WORKER_FAILED');
});
