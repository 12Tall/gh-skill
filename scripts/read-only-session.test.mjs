import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createReadOnlyTools, createReadOnlySession, readOnlyToolNames } from '../pi/read-only-session.mjs';

// Schema-builder double for dependency-free unit checks. Real TypeBox + SDK
// execution is covered separately by check-read-only-sdk.mjs.
const Type = { String: options => ({ type: 'string', ...options }), Optional: x => x, Object: (properties, options) => ({ type: 'object', properties, ...options }) };
function fixture(t) {
  const root = mkdtempSync(fileURLToPath(new URL('./fixtures/session-', import.meta.url)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'file.txt'), 'evidence\n');
  writeFileSync(join(root, '.env'), 'SECRET');
  return root;
}

test('tool adapter only exposes bounded workspace operations', async t => {
  const root = fixture(t);
  const tools = createReadOnlyTools({ root, Type });
  assert.deepEqual(tools.map(t => t.name), readOnlyToolNames);
  for (const tool of tools) assert.equal(tool.parameters.additionalProperties, false);
  const read = await tools[0].execute('1', { path: 'file.txt' });
  assert.equal(read.details.text, 'evidence\n');
  assert.deepEqual(JSON.parse(read.content[0].text), read.details);
  assert.deepEqual((await tools[1].execute('2', {})).details.files, ['file.txt']);
  assert.equal((await tools[2].execute('3', { query: 'evidence' })).details.matches[0].line, 1);
  await assert.rejects(tools[0].execute('4', { path: '.env' }), /EXCLUDED/);
  await assert.rejects(tools[2].execute('5', { query: 'SECRET', directory: '..' }), /INVALID_PATH/);
});

test('adapter rejects privilege-changing arguments and sanitizes filesystem errors', async t => {
  const root = fixture(t);
  const [read] = createReadOnlyTools({ root, Type });
  await assert.rejects(read.execute('1', { path: 'file.txt', root: '/' }), /INVALID_ARGUMENTS/);
  await assert.rejects(read.execute('2', { path: 'file.txt', limits: {} }), /INVALID_ARGUMENTS/);
  await assert.rejects(read.execute('3', {}), /INVALID_ARGUMENTS/);
  await assert.rejects(read.execute('4', { path: 'missing' }), error => {
    assert.equal(error.message, 'Workspace operation failed: ENOENT');
    assert.ok(!error.message.includes(root));
    return true;
  });
  await assert.rejects(read.execute('5', { path: 'file.txt' }, AbortSignal.abort(new Error('cancelled'))), /cancelled/);
});

function fakeSdk(onCreate, active = [...readOnlyToolNames]) {
  return {
    createExtensionRuntime: () => ({}),
    SessionManager: { inMemory: cwd => ({ cwd, memory: true }) },
    SettingsManager: { inMemory: settings => settings },
    createAgentSession: async options => {
      onCreate(options);
      return { session: { getActiveToolNames: () => [...active], dispose() { this.disposed = true; } } };
    },
  };
}

test('factory disables persistence, discovered resources, retries and cache warming', async t => {
  const root = fixture(t);
  mkdirSync(join(root, '.pi'));
  writeFileSync(join(root, '.pi/settings.json'), '{"defaultTools":["bash"]}');
  let options;
  await createReadOnlySession({ root, Type, sdk: fakeSdk(x => { options = x; }), modelRuntime: {}, model: { id: 'test', provider: 'test' } });
  assert.deepEqual(options.tools, readOnlyToolNames);
  assert.equal(options.sessionManager.memory, true);
  assert.equal(options.settingsManager.retry.enabled, false);
  assert.equal(options.settingsManager.retry.provider.maxRetries, 0);
  assert.equal(options.settingsManager.cacheWarming, 'off');
  assert.equal(options.settingsManager.compaction.enabled, false);
  assert.deepEqual(options.resourceLoader.getExtensions().extensions, []);
  assert.deepEqual(options.resourceLoader.getAgentsFiles().agentsFiles, []);
  assert.deepEqual(options.resourceLoader.getSkills().skills, []);
  assert.deepEqual(options.resourceLoader.getPrompts().prompts, []);
  assert.deepEqual(options.resourceLoader.getThemes().themes, []);
  assert.throws(() => options.resourceLoader.extendResources({}), /disabled/);
  assert.match(options.resourceLoader.getSystemPrompt(), /untrusted data/);
});

test('factory requires explicit model/runtime and rejects unexpected active tools', async t => {
  const root = fixture(t);
  await assert.rejects(createReadOnlySession({ root, Type }), /Explicit/);
  let disposed = false;
  const sdk = fakeSdk(() => {});
  sdk.createAgentSession = async () => ({ session: { getActiveToolNames: () => ['bash'], dispose: () => { disposed = true; } } });
  await assert.rejects(createReadOnlySession({ root, Type, sdk, modelRuntime: {}, model: { id: 'test', provider: 'test' } }), /Unexpected SDK tool/);
  assert.equal(disposed, true);
});
