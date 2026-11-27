import test from 'node:test';
import assert from 'node:assert/strict';
import { runReadOnlyTask } from '../pi/read-only-task.mjs';

function fakeSession(events, summary = 'findings') {
  let listener;
  const session = {
    disposed: false, aborted: false,
    subscribe: fn => { listener = fn; return () => { listener = undefined; }; },
    prompt: async () => { for (const event of events) listener(event); },
    getLastAssistantText: () => summary,
    abort: async () => { session.aborted = true; },
    dispose: () => { session.disposed = true; },
  };
  return session;
}
const settled = { type: 'agent_settled', aborted: false };
const answered = { type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } };
const task = { task: 'review', acceptance: 'report evidence' };

test('task collects evidence and explicitly leaves semantic verification to the main agent', async () => {
  const session = fakeSession([
    { type: 'tool_execution_start', toolCallId: '1', toolName: 'workspace_read', args: { path: 'file.txt' } },
    { type: 'tool_execution_end', toolCallId: '1', isError: false }, answered, settled,
  ]);
  const result = await runReadOnlyTask(task, async () => session);
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, false);
  assert.deepEqual(result.evidence, [{ tool: 'workspace_read', path: 'file.txt', ok: true }]);
  assert.equal(session.disposed, true);
});

test('resolved prompts with model errors, missing settled event or empty results fail', async () => {
  for (const [events, summary, code] of [
    [[{ type: 'message_end', message: { role: 'assistant', stopReason: 'error' } }, settled], 'findings', 'MODEL_FAILED'],
    [[], 'findings', 'INCOMPLETE_RUN'],
    [[settled], 'findings', 'INCOMPLETE_RUN'],
    [[{ type: 'message_end', message: { role: 'assistant', stopReason: 'length' } }, settled], 'partial', 'MODEL_FAILED'],
    [[answered, settled], '', 'EMPTY_RESULT'],
    [[answered, settled], 'x'.repeat(32769), 'RESULT_LIMIT'],
  ]) {
    const session = fakeSession(events, summary);
    const result = await runReadOnlyTask(task, async () => session);
    assert.equal(result.status, 'failed');
    assert.equal(result.code, code);
    assert.equal(session.disposed, true);
  }
});

test('tool errors and unauthorized tools abort rather than enabling a fallback', async () => {
  for (const [events, code] of [
    [[{ type: 'tool_execution_start', toolCallId: '1', toolName: 'bash', args: {} }], 'UNEXPECTED_TOOL'],
    [[{ type: 'tool_execution_start', toolCallId: '1', toolName: 'workspace_read', args: { path: '.env' } }, { type: 'tool_execution_end', toolCallId: '1', isError: true }], 'TOOL_FAILED'],
    [Array.from({ length: 17 }, () => ({ type: 'turn_start' })), 'TURN_LIMIT'],
  ]) {
    const session = fakeSession([...events, settled]);
    const result = await runReadOnlyTask(task, async () => session);
    assert.equal(result.code, code);
    assert.equal(session.aborted, true);
    assert.equal(session.disposed, true);
  }
});

test('tool failure blocks further model-runtime dispatch and preserves bound methods', async () => {
  class Runtime {
    #calls = 0;
    streamSimple() { this.#calls++; }
    count() { return this.#calls; }
  }
  const runtime = new Runtime();
  const session = fakeSession([answered, settled]);
  const emit = session.prompt;
  const result = await runReadOnlyTask({ ...task, modelRuntime: runtime }, async options => {
    session.prompt = async () => {
      options.modelRuntime.streamSimple();
      assert.equal(options.modelRuntime.count(), 1);
      options.onToolFailure('EXCLUDED');
      assert.throws(() => options.modelRuntime.streamSimple(), /TASK_STOPPED/);
      await emit();
    };
    return session;
  });
  assert.equal(runtime.count(), 1);
  assert.equal(result.code, 'TOOL_FAILED');
  assert.equal(session.disposed, true);
});

test('in-flight cancellation invokes SDK abort and disposes after prompt settles', async () => {
  const controller = new AbortController();
  const session = fakeSession([]);
  let release;
  session.prompt = () => new Promise(resolve => { release = resolve; });
  session.abort = async () => { session.aborted = true; release(); };
  const pending = runReadOnlyTask({ ...task, signal: controller.signal }, async () => session);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert.equal((await pending).status, 'cancelled');
  assert.equal(session.aborted, true);
  assert.equal(session.disposed, true);
});

test('cancellation, startup failure and thrown prompt do not produce success', async () => {
  let created = false;
  const cancelled = await runReadOnlyTask({ ...task, signal: AbortSignal.abort() }, async () => { created = true; });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(created, false);
  const failed = await runReadOnlyTask(task, async () => { throw new Error('sensitive host details'); });
  assert.equal(failed.code, 'SESSION_FAILED');
  assert.ok(!JSON.stringify(failed).includes('sensitive'));
  const session = fakeSession([]);
  session.prompt = async () => { throw new Error('failure'); };
  assert.equal((await runReadOnlyTask(task, async () => session)).status, 'failed');
  assert.equal(session.disposed, true);
});
