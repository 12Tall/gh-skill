import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { confirmAndRun, createReviewPacket, recordReview, reviewChecklist, displayJSON, formatApproval } from '../pi/read-only-workflow.mjs';
import { taskResult } from '../pi/read-only-task.mjs';
const cli = fileURLToPath(new URL('./read-only-agent.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(fileURLToPath(new URL('./fixtures/workflow-', import.meta.url)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, sdkPackage: join(root, 'missing-sdk'), authPath: join(root, 'unused-auth.json'), task: 'review fixture', acceptance: 'cite evidence', provider: 'test', model: 'test' };
}
const success = () => taskResult('completed', null, 'Synthetic test finding', [{ tool: 'workspace_read', path: 'file.txt', ok: true }]);
const assessment = packet => ({ digest: packet.digest, checks: reviewChecklist.map(({ id }) => ({ id, outcome: 'passed', basis: 'Synthetic reviewer evidence for test only' })) });

test('declined, truthy-but-not-true and pre-cancelled approval never construct a manager', async t => {
  const config = fixture(t);
  let managers = 0;
  const managerFactory = () => { managers++; throw new Error('must not start'); };
  for (const answer of [false, 'RUN', undefined]) {
    const packet = await confirmAndRun(config, { confirm: async () => answer, managerFactory });
    assert.equal(packet.execution.code, 'APPROVAL_DECLINED');
    assert.equal(packet.review.status, 'blocked');
  }
  let prompts = 0;
  const cancelled = await confirmAndRun(config, { signal: AbortSignal.abort(), confirm: () => { prompts++; }, managerFactory });
  assert.equal(cancelled.execution.code, 'CANCELLED');
  assert.equal(prompts, 0);
  assert.equal(managers, 0);
});

test('approval shows complete scope and uses an immutable request snapshot', async t => {
  const config = fixture(t);
  const states = [];
  const packet = await confirmAndRun(config, {
    timeoutMs: 5000,
    onState: state => states.push(state),
    confirm: async text => {
      for (const value of [config.root, config.sdkPackage, config.authPath, config.task, config.acceptance, 'test/test', '5000']) assert.ok(text.includes(value));
      config.task = 'different task';
      return true;
    },
    managerFactory: options => {
      assert.equal(options.timeoutMs, 5000);
      return { run: async (request, opts) => {
        assert.equal(opts.approved, true);
        assert.equal(request.task, 'review fixture');
        return success();
      } };
    },
  });
  assert.equal(packet.request.task, 'review fixture');
  assert.equal(packet.execution.verified, false);
  assert.equal(packet.review.status, 'pending');
  assert.deepEqual(states, ['awaiting_confirmation', 'running', 'completed']);
  assert.equal(packet.review.checks.length, 4);
});

test('cancelling during confirmation prevents startup, cancelling a run updates state', async t => {
  const config = fixture(t);
  const controller = new AbortController();
  const packet = await confirmAndRun(config, {
    signal: controller.signal,
    confirm: () => { controller.abort(); return true; },
    managerFactory: () => { throw new Error('must not start'); },
  });
  assert.equal(packet.execution.code, 'CANCELLED');
  const running = new AbortController();
  const states = [];
  const pending = confirmAndRun(config, {
    signal: running.signal, confirm: () => true, onState: state => states.push(state),
    managerFactory: () => ({ run: async (_config, { signal }) => new Promise(resolve => {
      signal.addEventListener('abort', () => resolve(taskResult('cancelled', 'CANCELLED')), { once: true });
      setImmediate(() => running.abort());
    }) }),
  });
  assert.equal((await pending).execution.status, 'cancelled');
  assert.deepEqual(states, ['awaiting_confirmation', 'running', 'stopping', 'cancelled']);
});

test('approval/result display escapes terminal control and bidi characters', async t => {
  const config = fixture(t);
  config.task = 'text\u001b[2J\nFORGED APPROVAL\u202eevil';
  const text = formatApproval(config);
  assert.ok(!text.includes('\u001b'));
  assert.ok(!text.includes('\u202e'));
  assert.ok(!text.includes('\nFORGED APPROVAL'));
  assert.deepEqual(JSON.parse(displayJSON(config)), config);
  await assert.rejects(confirmAndRun({ ...config, approved: true }, { confirm: () => true }), /INVALID_CONFIG/);
});

test('review requires complete nonempty checks bound to the exact execution', t => {
  const config = fixture(t);
  const packet = createReviewPacket(config, success());
  const review = assessment(packet);
  const accepted = recordReview(packet, review);
  assert.equal(accepted.review.status, 'accepted');
  assert.equal(accepted.review.verified, true);
  assert.equal(accepted.execution.verified, false);
  assert.equal(packet.review.status, 'pending');
  assert.throws(() => recordReview({ ...packet, execution: { ...packet.execution, summary: 'changed' } }, review), /REVIEW_MISMATCH/);
  assert.throws(() => recordReview(packet, { ...review, digest: 'stale' }), /REVIEW_MISMATCH/);
  assert.throws(() => recordReview(packet, { ...review, checks: review.checks.slice(1) }), /INCOMPLETE_REVIEW/);
  assert.throws(() => recordReview(packet, { ...review, checks: review.checks.map(() => review.checks[0]) }), /INCOMPLETE_REVIEW/);
  assert.throws(() => recordReview(packet, { ...review, checks: review.checks.map(c => ({ ...c, basis: '' })) }), /INVALID_REVIEW/);
});

test('failed/unverified reviews never pass, and failed execution cannot be promoted', t => {
  const config = fixture(t);
  const packet = createReviewPacket(config, success());
  for (const [outcome, status] of [['failed', 'rejected'], ['unverified', 'incomplete']]) {
    const review = assessment(packet);
    review.checks[0].outcome = outcome;
    const result = recordReview(packet, review);
    assert.equal(result.review.status, status);
    assert.equal(result.review.verified, false);
  }
  const failed = createReviewPacket(config, taskResult('failed', 'TOOL_FAILED'));
  assert.throws(() => recordReview(failed, assessment(failed)), /EXECUTION_NOT_COMPLETED/);
  assert.throws(() => createReviewPacket(config, { ...success(), verified: true }), /INVALID_EXECUTION/);
});

test('real CLI previews without SDK/auth access and rejects piped approval', t => {
  const config = fixture(t);
  const path = join(config.root, 'request.json');
  writeFileSync(path, JSON.stringify(config));
  const preview = spawnSync(process.execPath, [cli, 'preview', path], { encoding: 'utf8' });
  assert.equal(preview.status, 0, preview.stderr);
  assert.ok(preview.stdout.includes('test/test'));
  const run = spawnSync(process.execPath, [cli, 'run', path], { input: 'RUN\n', encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /INTERACTIVE_TERMINAL_REQUIRED/);
  const bypass = spawnSync(process.execPath, [cli, 'run', path, '--yes'], { encoding: 'utf8' });
  assert.equal(bypass.status, 1);
});

test('real CLI records structured reviews and fails closed on oversized/invalid files', t => {
  const config = fixture(t);
  const packet = createReviewPacket(config, success());
  const reportPath = join(config.root, 'report.json');
  const reviewPath = join(config.root, 'assessment.json');
  writeFileSync(reportPath, JSON.stringify(packet));
  writeFileSync(reviewPath, JSON.stringify(assessment(packet)));
  const reviewed = spawnSync(process.execPath, [cli, 'review', reportPath, reviewPath], { encoding: 'utf8' });
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.equal(JSON.parse(reviewed.stdout).review.status, 'accepted');
  writeFileSync(reportPath, 'SENSITIVE_FAKE_DATA');
  const invalid = spawnSync(process.execPath, [cli, 'preview', reportPath], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.ok(!invalid.stderr.includes('SENSITIVE_FAKE_DATA'));
  writeFileSync(reportPath, 'x'.repeat(128 * 1024 + 1));
  const large = spawnSync(process.execPath, [cli, 'preview', reportPath], { encoding: 'utf8' });
  assert.equal(large.status, 1);
  assert.match(large.stderr, /INPUT_LIMIT/);
});
