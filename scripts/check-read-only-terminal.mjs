// Real pseudo-terminal checks using util-linux `script`. No SDK/model service.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(fileURLToPath(new URL('./fixtures/terminal-', import.meta.url)));
const cli = fileURLToPath(new URL('./read-only-agent.mjs', import.meta.url));
const requestPath = join(root, 'request.json');
writeFileSync(requestPath, JSON.stringify({
  root, sdkPackage: join(root, 'missing-sdk'), authPath: join(root, 'unused-auth.json'),
  task: 'Local terminal test \u202eONLY', acceptance: 'Check approval, refusal and cancellation; no external model',
  provider: 'local-test', model: 'local-test',
}));
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
const command = [process.execPath, cli, 'run', requestPath].map(quote).join(' ');
async function terminal(name, answer) {
  return new Promise((resolve, reject) => {
    let output = '';
    let sent = false;
    const child = spawn('script', ['-q', '-e', '-c', command, join(root, `${name}.log`)], {
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already closed. */ }
      reject(new Error('TERMINAL_TEST_TIMEOUT'));
    }, 10_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', text => {
      output += text;
      if (!sent && output.includes('输入 RUN 才启动')) {
        sent = true;
        child.stdin.write(answer);
      }
    });
    child.stderr.on('data', data => { output += data.toString(); });
    child.stdin.on('error', () => {});
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, sent }); });
  });
}
try {
  const declined = await terminal('decline', 'no\n');
  assert.equal(declined.code, 2, declined.output);
  assert.equal(declined.sent, true);
  assert.ok(declined.output.includes('APPROVAL_DECLINED'));
  assert.ok(!declined.output.includes('[subagent] running'));
  assert.ok(!declined.output.includes('\u202e'));
  const approved = await terminal('approve', 'RUN\n');
  assert.equal(approved.code, 1, approved.output);
  assert.ok(approved.output.includes('[subagent] running'));
  assert.ok(approved.output.includes('WORKER_FAILED')); // Missing SDK, before credentials/model access.
  const cancelled = await terminal('cancel', '\x03');
  assert.equal(cancelled.code, 130, cancelled.output);
  assert.ok(cancelled.output.includes('CANCELLED'));
  assert.ok(!cancelled.output.includes('[subagent] running'));
  const eof = await terminal('eof', '\x04');
  assert.equal(eof.code, 130, eof.output);
  assert.ok(eof.output.includes('CANCELLED'));
  assert.ok(!eof.output.includes('[subagent] running'));
  console.log('Real terminal checks passed: explicit RUN, refusal, Ctrl+C/EOF, escaped bidi display. No SDK/auth/model accessed.');
} finally { rmSync(root, { recursive: true, force: true }); }
