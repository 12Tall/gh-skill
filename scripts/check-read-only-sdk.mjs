// Local integration check: real installed SDK/TypeBox, scripted model responses.
// No model service, credentials, package install or global configuration changes.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createReadOnlySession, readOnlyToolNames } from '../pi/read-only-session.mjs';
import { runReadOnlyTask } from '../pi/read-only-task.mjs';
import { createReadOnlyTaskManager } from '../pi/read-only-manager.mjs';
import { confirmAndRun, recordReview, reviewChecklist } from '../pi/read-only-workflow.mjs';

const packageDir = process.argv[2];
if (!packageDir) throw new Error('Usage: node scripts/check-read-only-sdk.mjs /path/to/installed/pi-coding-agent');
const require = createRequire(join(resolve(packageDir), 'package.json'));
const manifest = JSON.parse(readFileSync(join(resolve(packageDir), 'package.json'), 'utf8'));
assert.equal(manifest.name, '@earendil-works/pi-coding-agent');
const entry = manifest.exports?.['.']?.import;
assert.equal(typeof entry, 'string', 'SDK must expose an ESM entry');
const sdk = await import(pathToFileURL(resolve(packageDir, entry)).href);
const { Type } = await import(pathToFileURL(require.resolve('typebox')).href);
const base = mkdtempSync(fileURLToPath(new URL('./fixtures/sdk-', import.meta.url)));
const root = join(base, 'project');
mkdirSync(root);
writeFileSync(join(root, 'file.txt'), 'SDK_LOCAL_EVIDENCE\n');
writeFileSync(join(root, '.env'), 'SECRET');
writeFileSync(join(base, 'outside.txt'), 'OUTSIDE_SECRET');
symlinkSync('../outside.txt', join(root, 'escape.txt'));
mkdirSync(join(root, '.pi/extensions'), { recursive: true });
writeFileSync(join(root, '.pi/extensions/hostile.js'), 'throw new Error("UNEXPECTED_EXTENSION_LOAD");');
writeFileSync(join(root, '.pi/settings.json'), '{"defaultTools":["bash"],"retry":{"enabled":true}}');
writeFileSync(join(root, 'AGENTS.md'), 'UNEXPECTED_CONTEXT_MARKER');
const model = {
  id: 'scripted-local-test', name: 'Scripted local test', provider: 'local-test', api: 'openai-completions',
  baseUrl: 'http://invalid.test', reasoning: false, input: ['text'], contextWindow: 100000, maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
function message(content, stopReason = 'stop') {
  return { role: 'assistant', content, stopReason, model: model.id, provider: model.provider, api: model.api, usage, timestamp: Date.now() };
}
function stream(answer) {
  return {
    async *[Symbol.asyncIterator]() { yield { type: answer.stopReason === 'error' ? 'error' : 'done', reason: answer.stopReason, message: answer }; },
    result: async () => answer,
  };
}
const tool = (name, args, id) => ({ type: 'toolCall', id, name, arguments: args });
function runtime(respond) {
  return {
    getModel: () => model,
    getPhysicalModel: () => model,
    hasConfiguredAuth: () => true,
    isUsingOAuth: () => false,
    isUsingSubscription: () => false,
    getRegisteredProviderIds: () => [],
    settleCredentialWrites: async () => {},
    streamSimple: (_model, context, options) => {
      assert.equal(options.maxRetries, 0);
      const declared = context.tools ?? context.messages.filter(m => m.role === 'system').flatMap(m => m.toolsAdded ?? []);
      assert.deepEqual(declared.map(t => t.name).sort(), [...readOnlyToolNames].sort());
      assert.ok(!JSON.stringify(context).includes('UNEXPECTED_CONTEXT_MARKER'));
      return stream(respond(context));
    },
  };
}
let session;
try {
  let calls = 0;
  session = await createReadOnlySession({ sdk, Type, root, model, modelRuntime: runtime(() => {
    calls++;
    if (calls === 1) return message([
      tool('workspace_read', { path: 'file.txt' }, 'read'),
      tool('workspace_list', {}, 'list'),
      tool('workspace_search', { query: 'SDK_LOCAL_EVIDENCE' }, 'search'),
      tool('workspace_read', { path: '.env' }, 'secret'),
      tool('workspace_read', { path: '../outside.txt' }, 'outside'),
      tool('workspace_read', { path: 'escape.txt' }, 'link'),
      tool('bash', { command: 'echo MUST_NOT_RUN' }, 'shell'),
    ], 'toolUse');
    assert.equal(calls, 2);
    return message([{ type: 'text', text: 'Scripted response complete; not a live-model behavior test.' }]);
  }) });
  assert.deepEqual(session.getActiveToolNames().sort(), [...readOnlyToolNames].sort());
  await session.prompt('Run the scripted local tool-boundary test.');
  const results = session.messages.filter(m => m.role === 'toolResult');
  const byId = Object.fromEntries(results.map(m => [m.toolCallId, m]));
  assert.equal(calls, 2, JSON.stringify(session.messages));
  for (const id of ['read', 'list', 'search']) assert.equal(byId[id]?.isError, false, id);
  for (const id of ['secret', 'outside', 'link', 'shell']) assert.equal(byId[id]?.isError, true, id);
  assert.ok(JSON.stringify(byId.read.content).includes('SDK_LOCAL_EVIDENCE'));
  assert.ok(!JSON.stringify(results).includes('OUTSIDE_SECRET'));
  assert.ok(!JSON.stringify(results).includes(root));
  assert.equal(readFileSync(join(root, 'file.txt'), 'utf8'), 'SDK_LOCAL_EVIDENCE\n');
  session.dispose();
  session = undefined;
  let failures = 0;
  session = await createReadOnlySession({ sdk, Type, root, model, modelRuntime: runtime(() => {
    failures++;
    return { ...message([], 'error'), errorMessage: '503 scripted failure' };
  }) });
  await session.prompt('Exercise a scripted provider failure.');
  assert.equal(failures, 1, 'automatic retries must remain disabled');
  assert.equal(session.messages.at(-1).stopReason, 'error');
  session.dispose();
  session = undefined;
  let runnerCalls = 0;
  const completed = await runReadOnlyTask({
    sdk, Type, root, model, task: 'Read file.txt', acceptance: 'Report the local evidence marker',
    modelRuntime: runtime(() => ++runnerCalls === 1
      ? message([tool('workspace_read', { path: 'file.txt' }, 'runner-read')], 'toolUse')
      : message([{ type: 'text', text: 'SDK_LOCAL_EVIDENCE from file.txt' }])),
  });
  assert.equal(completed.status, 'completed', JSON.stringify(completed));
  assert.equal(completed.verified, false);
  assert.deepEqual(completed.evidence, [{ tool: 'workspace_read', path: 'file.txt', ok: true }]);
  let runnerFailures = 0;
  const failed = await runReadOnlyTask({
    sdk, Type, root, model, task: 'Exercise failure', acceptance: 'Do not report failure as success',
    modelRuntime: runtime(() => { runnerFailures++; return { ...message([], 'error'), errorMessage: '503 scripted failure' }; }),
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.code, 'MODEL_FAILED');
  assert.equal(runnerFailures, 1);
  let deniedCalls = 0;
  const denied = await runReadOnlyTask({
    sdk, Type, root, model, task: 'Exercise a denied read', acceptance: 'Stop on denial without retry',
    modelRuntime: runtime(() => {
      deniedCalls++;
      assert.equal(deniedCalls, 1, 'denial must not start another model turn');
      return message([tool('workspace_read', { path: '.env' }, 'denied-read')], 'toolUse');
    }),
  });
  assert.equal(denied.status, 'failed');
  assert.equal(denied.code, 'TOOL_FAILED');
  assert.equal(deniedCalls, 1);
  // Exercise the production manager -> worker -> real SDK path with a local
  // SDK shim that overrides ONLY ModelRuntime (no real credentials/network).
  const shim = join(base, 'scripted-sdk');
  mkdirSync(join(shim, 'node_modules'), { recursive: true });
  symlinkSync(dirname(dirname(require.resolve('typebox'))), join(shim, 'node_modules/typebox'));
  writeFileSync(join(shim, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', type: 'module', exports: { '.': { import: './index.mjs' } } }));
  writeFileSync(join(shim, 'index.mjs'), `
export * from ${JSON.stringify(pathToFileURL(resolve(packageDir, entry)).href)};
import assert from 'node:assert/strict';
const model = ${JSON.stringify(model)};
const usage = ${JSON.stringify(usage)};
const readOnlyToolNames = ${JSON.stringify(readOnlyToolNames)};
${message.toString()}
${stream.toString()}
const tool = ${tool.toString()};
${runtime.toString()}
export const ModelRuntime = { create: async () => {
  let calls = 0;
  return runtime(() => ++calls === 1
    ? message([tool('workspace_read', {path:'file.txt'}, 'child-read')], 'toolUse')
    : message([{type:'text',text:'SDK_LOCAL_EVIDENCE from file.txt'}]));
}};
`);
  const managed = await createReadOnlyTaskManager({ timeoutMs: 30_000 }).run({
    root, sdkPackage: shim, authPath: join(base, 'unused-auth.json'), provider: model.provider, model: model.id,
    task: 'Read file.txt', acceptance: 'Return marker evidence',
  }, { approved: true });
  assert.equal(managed.status, 'completed', JSON.stringify(managed));
  assert.equal(managed.verified, false);
  assert.deepEqual(managed.evidence, [{ tool: 'workspace_read', path: 'file.txt', ok: true }]);
  const packet = await confirmAndRun({
    root, sdkPackage: shim, authPath: join(base, 'unused-auth.json'), provider: model.provider, model: model.id,
    task: 'Read file.txt', acceptance: 'Return marker evidence',
  }, {
    timeoutMs: 30_000,
    confirm: async text => { assert.ok(text.includes(root)); assert.ok(text.includes(model.id)); return true; },
  });
  assert.equal(packet.execution.status, 'completed', JSON.stringify(packet));
  assert.equal(packet.review.status, 'pending');
  // Independent fixture check, not an acceptance based only on the scripted summary.
  assert.equal(readFileSync(join(root, 'file.txt'), 'utf8'), 'SDK_LOCAL_EVIDENCE\n');
  assert.deepEqual(packet.execution.evidence, [{ tool: 'workspace_read', path: 'file.txt', ok: true }]);
  const reviewed = recordReview(packet, {
    digest: packet.digest,
    checks: reviewChecklist.map(({ id }) => ({ id, outcome: 'passed', basis: 'Local integration test: independently read file.txt marker and checked exact read-only tool evidence; model response is scripted, not a live-model result.' })),
  });
  assert.equal(reviewed.review.status, 'accepted');
  assert.equal(reviewed.execution.verified, false);
  console.log('Real SDK integration passed: restricted tools, resource isolation, no retry, task checks, manager/worker lifecycle, confirmation and review handoff. Model responses were scripted; no live model called.');
} finally {
  session?.dispose();
  rmSync(base, { recursive: true, force: true });
}
