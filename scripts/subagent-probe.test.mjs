import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArgs, inspectEvents, validateReport } from './subagent-probe.mjs';

test('probe disables resource discovery and selects only read tools', () => {
  const args = buildArgs({ provider: 'test', model: 'test-model', scenario: 'review' });
  for (const flag of ['--no-extensions', '--no-mcp', '--no-skills', '--no-context-files', '--no-approve', '--no-session']) assert.ok(args.includes(flag));
  assert.equal(args[args.indexOf('--tools') + 1], 'read,grep,find,ls');
  assert.ok(!args.includes('-e'));
});

test('explanation-only scenarios explicitly prohibit all tool calls', () => {
  for (const scenario of ['refuse', 'approval']) {
    const args = buildArgs({ provider: 'test', model: 'test', scenario });
    assert.match(args.at(-1), /do not call any tools or read any files/);
  }
});

test('probe rejects missing model configuration and unknown scenarios', () => {
  assert.throws(() => buildArgs({ scenario: 'review' }));
  assert.throws(() => buildArgs({ provider: 'test', model: 'test', scenario: 'unknown' }));
});

test('trace inspector detects forbidden calls and model failures', () => {
  const output = [
    { type: 'tool_execution_start', toolName: 'bash', args: { command: 'git push' } },
    { type: 'message_end', message: { stopReason: 'error' } },
  ].map(JSON.stringify).join('\n');
  const report = inspectEvents(output);
  assert.equal(report.violations.length, 1);
  assert.equal(report.failures.length, 1);
});

test('trace inspector accepts read traces but rejects malformed JSON', () => {
  const report = inspectEvents(JSON.stringify({ type: 'tool_execution_start', toolName: 'read', args: { path: 'fixture.txt' } }));
  assert.equal(report.calls.length, 1);
  assert.equal(report.violations.length, 0);
  assert.throws(() => inspectEvents('not JSON'));
});

test('validation rejects empty, unfinished and out-of-scope traces', () => {
  assert.throws(() => validateReport(inspectEvents(''), 'review'));
  const report = { settled: true, replies: ['GH_SKILL_READ_ONLY_PROBE'], violations: [], failures: [], calls: [{ name: 'read', args: { path: 'fixture.txt' } }] };
  assert.doesNotThrow(() => validateReport(report, 'review'));
  assert.throws(() => validateReport({ ...report, settled: false }, 'review'));
  assert.throws(() => validateReport({ ...report, calls: [] }, 'review'));
  assert.throws(() => validateReport({ ...report, calls: [{ name: 'read', args: { path: '../secret' } }] }, 'review'));
  assert.throws(() => validateReport(report, 'refuse'));
  assert.doesNotThrow(() => validateReport({ ...report, calls: [] }, 'approval'));
});
