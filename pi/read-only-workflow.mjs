import { createHash } from 'node:crypto';
import { createReadOnlyTaskManager, validateTaskConfig } from './read-only-manager.mjs';
import { createReadOnlyWorkspace } from './read-only-workspace.mjs';
import { taskResult } from './read-only-task.mjs';

export const reviewChecklist = Object.freeze([
  Object.freeze({ id: 'scope', question: '任务及可读范围是否与批准内容一致，是否出现越权或遗漏？' }),
  Object.freeze({ id: 'claims', question: '是否独立核对关键结论、引用的文件位置和实际工具证据？' }),
  Object.freeze({ id: 'acceptance', question: '是否逐项满足本任务的验收条件？' }),
  Object.freeze({ id: 'limitations', question: '未验证项、失败检查和局限是否明确，且不影响验收？' }),
]);

// Escape terminal controls, including Unicode bidi/format characters. Output
// remains valid JSON; a model response cannot inject terminal control sequences.
export function displayJSON(value, indent) {
  return JSON.stringify(value, null, indent).replace(/[\p{Cf}\u007f-\u009f\u2028\u2029]/gu,
    text => text.split('').map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(request, execution) {
  return createHash('sha256').update(canonical({ request, execution })).digest('hex');
}
function snapshot(config) {
  validateTaskConfig(config);
  const copy = JSON.parse(JSON.stringify(config));
  createReadOnlyWorkspace(copy.root, { exclude: copy.exclude, limits: copy.limits });
  return copy;
}
export function formatApproval(config, timeoutMs = 120_000) {
  return [
    '只读子 Agent：请核对本次委派，不会自动提交或 push。',
    `任务：${displayJSON(config.task)}`,
    `验收条件：${displayJSON(config.acceptance)}`,
    `可读根目录：${displayJSON(config.root)}`,
    `额外排除：${displayJSON(config.exclude ?? [])}`,
    `读取预算覆盖：${displayJSON(config.limits ?? {})}`,
    '默认排除敏感路径、符号链接及硬链接；不是操作系统沙箱，不能识别任意秘密内容。',
    `模型服务：${displayJSON(`${config.provider}/${config.model}`)}`,
    `SDK：${displayJSON(config.sdkPackage)}`,
    `凭据文件：${displayJSON(config.authPath)}（可能因 OAuth 刷新写回；不会显示凭据内容）`,
    `总超时：${timeoutMs} ms；发送任务及允许读取的内容到所选模型，可能消耗额度。`,
    '仅开放受限读取/列表/搜索；禁止写入、Shell、继续委派。不自动重试。',
    '执行完成后仍须主 Agent 独立验收，不代表结果已经正确。',
  ].join('\n');
}
export function createReviewPacket(config, execution) {
  const request = JSON.parse(JSON.stringify({
    root: config.root, task: config.task, acceptance: config.acceptance,
    provider: config.provider, model: config.model,
    exclude: config.exclude ?? [], limits: config.limits ?? {},
  }));
  const copy = JSON.parse(JSON.stringify(execution));
  if (!['completed', 'failed', 'cancelled', 'timed_out'].includes(copy.status) || copy.verified !== false) throw new Error('INVALID_EXECUTION');
  return {
    version: 1,
    digest: digest(request, copy),
    request,
    execution: copy,
    review: {
      status: copy.status === 'completed' ? 'pending' : 'blocked', verified: false,
      checks: reviewChecklist.map(c => ({ ...c, outcome: 'unverified', basis: '' })),
    },
  };
}

// No model receives this confirmation callback or the manager's approved flag.
export async function confirmAndRun(config, {
  confirm, signal, onState = () => {}, timeoutMs = 120_000,
  managerFactory = createReadOnlyTaskManager,
} = {}) {
  if (typeof confirm !== 'function') throw new Error('CONFIRMATION_REQUIRED');
  const approvedConfig = snapshot(config);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error('INVALID_TIMEOUT');
  const notify = state => { try { onState(state); } catch { /* Observers cannot break cleanup. */ } };
  const cancelled = code => createReviewPacket(approvedConfig, taskResult('cancelled', code));
  if (signal?.aborted) return cancelled('CANCELLED');
  notify('awaiting_confirmation');
  const confirmed = await confirm(formatApproval(approvedConfig, timeoutMs));
  if (signal?.aborted) { notify('cancelled'); return cancelled('CANCELLED'); }
  if (confirmed !== true) {
    notify('cancelled');
    return cancelled('APPROVAL_DECLINED');
  }
  const manager = managerFactory({ timeoutMs });
  const stopping = () => notify('stopping');
  signal?.addEventListener('abort', stopping, { once: true });
  try {
    notify('running');
    const result = await manager.run(approvedConfig, { approved: true, signal });
    notify(result.status);
    return createReviewPacket(approvedConfig, result);
  } finally { signal?.removeEventListener('abort', stopping); }
}

// Trusted reviewer attestation, not automatic semantic verification. Binding
// prevents accidentally applying a review to a different request/result; it is
// not a signature and does not defend against a malicious host editing files.
export function recordReview(packet, assessment) {
  if (packet?.version !== 1 || packet.digest !== digest(packet.request, packet.execution) || assessment?.digest !== packet.digest) throw new Error('REVIEW_MISMATCH');
  if (packet.execution?.status !== 'completed' || packet.execution.verified !== false || packet.execution.code !== null ||
      typeof packet.execution.summary !== 'string' || !packet.execution.summary.trim() ||
      !Array.isArray(packet.execution.evidence) || packet.execution.evidence.some(e => e.ok !== true)) throw new Error('EXECUTION_NOT_COMPLETED');
  if (!Array.isArray(assessment.checks) || assessment.checks.length !== reviewChecklist.length ||
      new Set(assessment.checks.map(c => c.id)).size !== reviewChecklist.length) throw new Error('INCOMPLETE_REVIEW');
  const checks = reviewChecklist.map(item => {
    const check = assessment.checks.find(c => c.id === item.id);
    if (!check || !['passed', 'failed', 'unverified'].includes(check.outcome) ||
        typeof check.basis !== 'string' || !check.basis.trim() || Buffer.byteLength(check.basis) > 4096) throw new Error('INVALID_REVIEW');
    return { ...item, outcome: check.outcome, basis: check.basis };
  });
  const verified = checks.every(c => c.outcome === 'passed');
  const status = verified ? 'accepted' : checks.some(c => c.outcome === 'failed') ? 'rejected' : 'incomplete';
  return { ...JSON.parse(JSON.stringify(packet)), review: { status, verified, checks } };
}
