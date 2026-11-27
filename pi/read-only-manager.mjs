import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOnlyToolNames } from './read-only-session.mjs';
import { taskResult } from './read-only-task.mjs';

export function validateTaskConfig(config) {
  const fields = ['root', 'task', 'acceptance', 'sdkPackage', 'authPath', 'provider', 'model', 'exclude', 'limits'];
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(k => !fields.includes(k))) throw new Error('INVALID_CONFIG');
  for (const key of ['root', 'sdkPackage', 'authPath']) {
    if (typeof config[key] !== 'string' || !isAbsolute(config[key]) || config[key].includes('\0')) throw new Error('INVALID_CONFIG');
  }
  for (const key of ['task', 'acceptance', 'provider', 'model']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error('INVALID_CONFIG');
  }
  if (Buffer.byteLength(config.task + config.acceptance) > 16 * 1024 || Buffer.byteLength(JSON.stringify(config)) > 32 * 1024) throw new Error('CONFIG_LIMIT');
}

function validResult(result) {
  return result && ['completed', 'failed', 'cancelled'].includes(result.status) && result.verified === false &&
    (result.code === null || (typeof result.code === 'string' && /^[A-Z_]{1,64}$/.test(result.code))) &&
    (result.status !== 'completed' || (result.code === null && result.summary?.trim())) &&
    typeof result.summary === 'string' && Buffer.byteLength(result.summary) <= 32 * 1024 &&
    Array.isArray(result.evidence) && result.evidence.length <= 128 && result.evidence.every(e =>
      e && readOnlyToolNames.includes(e.tool) && typeof e.path === 'string' && Buffer.byteLength(e.path) <= 4096 &&
      typeof e.ok === 'boolean' && (result.status !== 'completed' || e.ok));
}

// Trusted-host API: `approved` must originate from the user-confirmation layer,
// never from a model-supplied tool argument. One slot, no implicit queue/retry.
export function createReadOnlyTaskManager({
  workerPath = fileURLToPath(new URL('./read-only-worker.mjs', import.meta.url)),
  timeoutMs = 120_000, graceMs = 1000, maxOutputBytes = 64 * 1024,
} = {}) {
  if (process.platform !== 'linux') throw new Error('UNSUPPORTED_PLATFORM');
  if (!isAbsolute(workerPath)) throw new Error('INVALID_WORKER');
  for (const [value, max] of [[timeoutMs, 300_000], [graceMs, 5000], [maxOutputBytes, 128 * 1024]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('INVALID_MANAGER_LIMIT');
  }
  let state = 'idle';
  return Object.freeze({
    getState: () => state,
    async run(config, { approved = false, signal } = {}) {
      if (approved !== true) throw new Error('APPROVAL_REQUIRED');
      if (state !== 'idle') throw new Error('BUSY');
      validateTaskConfig(config);
      // Snapshot before asynchronous work so a caller cannot mutate the approved request.
      const input = JSON.stringify(config);
      if (signal?.aborted) return taskResult('cancelled', 'CANCELLED');
      state = 'running';
      return new Promise(resolve => {
        let child;
        let timer;
        let escalation;
        let reason;
        let stdout = '';
        let outputBytes = 0;
        let done = false;
        const kill = sig => {
          if (!child?.pid) return;
          try { process.kill(-child.pid, sig); } catch (error) {
            if (error.code !== 'ESRCH') reason ||= 'KILL_FAILED';
          }
        };
        const stop = code => {
          if (done || reason) return;
          reason = code;
          state = 'stopping';
          kill('SIGTERM');
          escalation = setTimeout(() => kill('SIGKILL'), graceMs);
        };
        const cancel = () => stop('CANCELLED');
        const finish = (exitCode, exitSignal) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          clearTimeout(escalation);
          signal?.removeEventListener('abort', cancel);
          // Retire any descendants in the owned process group before releasing the slot.
          kill('SIGKILL');
          state = 'idle';
          if (reason) {
            const status = reason === 'CANCELLED' ? 'cancelled' : reason === 'TIMEOUT' ? 'timed_out' : 'failed';
            return resolve(taskResult(status, reason));
          }
          if (exitCode !== 0 || exitSignal) return resolve(taskResult('failed', 'WORKER_EXIT'));
          try {
            const result = JSON.parse(stdout);
            if (!validResult(result)) throw new Error('invalid');
            // Only return protocol fields; ignore no arbitrary worker attachments.
            resolve(taskResult(result.status, result.code, result.summary, result.evidence.map(({ tool, path, ok }) => ({ tool, path, ok }))));
          } catch { resolve(taskResult('failed', 'INVALID_RESULT')); }
        };
        try {
          child = spawn(process.execPath, [workerPath], {
            cwd: config.root,
            detached: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            // Do not inherit NODE_OPTIONS, extension settings or credential env vars.
            env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', PI_OFFLINE: '1', NO_COLOR: '1' },
          });
          child.once('error', () => { reason ||= 'SPAWN_FAILED'; });
          child.once('close', finish);
          const consume = (chunk, isStdout) => {
            outputBytes += chunk.length;
            if (outputBytes > maxOutputBytes) return stop('OUTPUT_LIMIT');
            if (isStdout) stdout += chunk.toString('utf8');
          };
          // Decode stdout with StringDecoder semantics supplied by setEncoding.
          child.stdout.setEncoding('utf8');
          child.stdout.on('data', text => consume(Buffer.from(text), true));
          child.stderr.on('data', chunk => consume(chunk, false));
          child.stdin.on('error', () => stop('INPUT_FAILED'));
          timer = setTimeout(() => stop('TIMEOUT'), timeoutMs);
          signal?.addEventListener('abort', cancel, { once: true });
          if (signal?.aborted) cancel();
          child.stdin.end(input);
        } catch {
          if (child?.pid) stop('SPAWN_FAILED');
          else { reason = 'SPAWN_FAILED'; finish(null, null); }
        }
      });
    },
  });
}
