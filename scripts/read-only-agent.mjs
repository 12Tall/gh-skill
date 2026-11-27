import { constants, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmAndRun, displayJSON, recordReview } from '../pi/read-only-workflow.mjs';

function readJSON(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('INVALID_INPUT_FILE');
    const buffer = Buffer.alloc(128 * 1024 + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size === buffer.length) throw new Error('INPUT_LIMIT');
    try { return JSON.parse(buffer.subarray(0, size).toString('utf8')); }
    catch { throw new Error('INVALID_JSON'); }
  } finally { closeSync(fd); }
}

export async function runCli(args, { input = process.stdin, output = process.stdout, errors = process.stderr } = {}) {
  const [command, path, assessmentPath] = args;
  if (!['preview', 'run', 'review'].includes(command) || !path || args.length !== (command === 'review' ? 3 : 2)) {
    throw new Error('USAGE_PREVIEW_RUN_REQUEST_OR_REVIEW_REPORT_ASSESSMENT');
  }
  if (command === 'review') {
    const packet = recordReview(readJSON(path), readJSON(assessmentPath));
    output.write(`${displayJSON(packet, 2)}\n`);
    return packet.review.verified ? 0 : 2;
  }
  // No --yes flag, stdin answer piping, or model-supplied approval flag.
  if (command === 'run' && (!input.isTTY || !errors.isTTY)) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  const config = readJSON(path);
  if (command === 'preview') {
    await confirmAndRun(config, { confirm: async text => { output.write(`${text}\n`); return false; } });
    return 0;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const packet = await confirmAndRun(config, {
      signal: controller.signal,
      onState: state => errors.write(`[subagent] ${state}\n`),
      confirm: async text => {
        errors.write(`${text}\n`);
        const terminal = createInterface({ input, output: errors, terminal: true });
        terminal.on('SIGINT', cancel);
        terminal.once('close', cancel);
        try {
          const answer = await terminal.question('输入 RUN 才启动；其他输入拒绝，Ctrl+C 取消： ', { signal: controller.signal });
          return answer.trim() === 'RUN';
        } catch (error) {
          if (controller.signal.aborted) return false;
          throw error;
        } finally {
          terminal.removeListener('close', cancel);
          terminal.close();
          input.pause();
        }
      },
    });
    output.write(`${displayJSON(packet, 2)}\n`);
    if (packet.execution.status === 'completed') {
      errors.write('[subagent] 执行完成，尚未验收。请主 Agent 独立核对复核清单，不能仅凭摘要判定通过。\n');
      return 0;
    }
    if (packet.execution.code === 'APPROVAL_DECLINED') return 2;
    if (packet.execution.status === 'cancelled') return 130;
    if (packet.execution.status === 'timed_out') return 124;
    return 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runCli(process.argv.slice(2)); }
  catch (error) {
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'INPUT_OR_IO_FAILURE';
    process.stderr.write(`[subagent] ${code}\n`);
    process.exitCode = 1;
  }
}
