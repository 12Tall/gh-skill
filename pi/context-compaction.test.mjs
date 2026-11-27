import assert from 'node:assert/strict';
import test from 'node:test';
import install from './context-compaction.js';

test('opt-in threshold tracks the active model and does not loop', () => {
  const handlers = new Map();
  let enabled = true;
  let idle = true;
  let tokens;
  const model = { provider: 'mock', id: 'small', contextWindow: 100_000 };
  const attempts = [];
  install({ on: (name, handler) => handlers.set(name, handler), getSettings: () => ({ compaction: { enabled } }) });
  const ctx = { model, isIdle: () => idle, getContextUsage: () => ({ tokens }), compact: options => attempts.push(options) };
  const settle = value => { tokens = value; handlers.get('agent_settled')({}, ctx); };
  settle(undefined);
  settle(59_999);
  assert.equal(attempts.length, 0);
  settle(60_000);
  settle(80_000);
  assert.equal(attempts.length, 1);
  attempts[0].onComplete();
  settle(80_000);
  assert.equal(attempts.length, 1);
  settle(40_000);
  settle(60_000);
  assert.equal(attempts.length, 2);
  attempts[1].onError(new Error('mock failure'));
  settle(80_000);
  assert.equal(attempts.length, 2);
  Object.assign(model, { id: 'large', contextWindow: 200_000 });
  handlers.get('model_select')();
  settle(119_999);
  enabled = false;
  settle(120_000);
  enabled = true;
  idle = false;
  settle(120_000);
  assert.equal(attempts.length, 2);
  idle = true;
  settle(120_000);
  assert.equal(attempts.length, 3);
});

test('a synchronous compaction failure warns and allows a later threshold crossing', () => {
  const handlers = new Map();
  const notices = [];
  let tokens = 60_000;
  let attempts = 0;
  install({ on: (name, handler) => handlers.set(name, handler), getSettings: () => ({}) });
  const ctx = {
    model: { provider: 'mock', id: 'small', contextWindow: 100_000 },
    isIdle: () => true,
    getContextUsage: () => ({ tokens }),
    hasUI: true,
    ui: { notify: (message, level) => notices.push({ message, level }) },
    compact: () => {
      if (++attempts === 1) throw new Error('mock synchronous failure');
    },
  };
  const settle = () => handlers.get('agent_settled')({}, ctx);
  assert.doesNotThrow(settle);
  assert.deepEqual(notices, [{ message: 'gh-skill compaction failed: mock synchronous failure', level: 'warning' }]);
  settle();
  assert.equal(attempts, 1);
  tokens = 59_999;
  settle();
  tokens = 60_000;
  settle();
  assert.equal(attempts, 2);
});
