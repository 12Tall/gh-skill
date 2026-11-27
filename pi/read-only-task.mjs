import { createReadOnlySession, readOnlyToolNames } from './read-only-session.mjs';

export const taskResult = (status, code = null, summary = '', evidence = []) => ({
  status, code, summary, evidence, verified: false,
});

// Execution checks only. Semantic acceptance remains the main agent's job.
export async function runReadOnlyTask({ task, acceptance, signal, ...options }, createSession = createReadOnlySession) {
  if (typeof task !== 'string' || !task.trim() || typeof acceptance !== 'string' || !acceptance.trim() ||
      Buffer.byteLength(task + acceptance) > 16 * 1024) throw new Error('INVALID_TASK');
  if (signal?.aborted) return taskResult('cancelled', 'CANCELLED');
  let session;
  let unsubscribe;
  let settled = false;
  let lastAssistantStop;
  let failure;
  let turns = 0;
  const evidence = [];
  const pending = new Map();
  const abort = () => { if (session) void session.abort().catch(() => {}); };
  const fail = code => { failure ||= code; abort(); };
  // SDK can enter stream dispatch after abort was requested. Block before the
  // model runtime sees another request, not only at the SDK event subscriber.
  const guardedRuntime = options.modelRuntime && new Proxy(options.modelRuntime, {
    get(target, key) {
      if (key === 'streamSimple') return (model, context, requestOptions) => {
        if (failure || signal?.aborted || requestOptions?.signal?.aborted) throw new Error('TASK_STOPPED');
        return target.streamSimple(model, context, requestOptions);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  try {
    session = await createSession({ ...options, modelRuntime: guardedRuntime, onToolFailure: () => fail('TOOL_FAILED') });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return taskResult('cancelled', 'CANCELLED');
    unsubscribe = session.subscribe(event => {
      if (event.type === 'turn_start' && ++turns > 16) fail('TURN_LIMIT');
      if (event.type === 'tool_execution_start') {
        if (!readOnlyToolNames.includes(event.toolName)) return fail('UNEXPECTED_TOOL');
        if (evidence.length >= 128 || pending.has(event.toolCallId)) return fail('EVIDENCE_LIMIT');
        const item = { tool: event.toolName, path: event.args?.path ?? event.args?.directory ?? '.', ok: false };
        if (typeof item.path !== 'string' || Buffer.byteLength(item.path) > 4096) return fail('INVALID_EVIDENCE');
        pending.set(event.toolCallId, item);
        evidence.push(item);
      }
      if (event.type === 'tool_execution_end') {
        const item = pending.get(event.toolCallId);
        if (!item) return fail('INVALID_EVIDENCE');
        item.ok = event.isError === false;
        pending.delete(event.toolCallId);
        if (!item.ok) fail('TOOL_FAILED');
      }
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        lastAssistantStop = event.message.stopReason;
        if (!['stop', 'toolUse'].includes(lastAssistantStop)) failure ||= 'MODEL_FAILED';
      }
      if (event.type === 'agent_settled') {
        settled = event.aborted === false;
        if (!settled) failure ||= 'ABORTED';
      }
    });
    await session.prompt(`Approved read-only task:\n${task}\n\nAcceptance criteria (report evidence and limitations):\n${acceptance}`);
    if (signal?.aborted) return taskResult('cancelled', 'CANCELLED', '', evidence);
    if (!settled || pending.size || lastAssistantStop !== 'stop') failure ||= 'INCOMPLETE_RUN';
    const summary = session.getLastAssistantText() ?? '';
    if (typeof summary !== 'string' || !summary.trim()) failure ||= 'EMPTY_RESULT';
    if (typeof summary === 'string' && Buffer.byteLength(summary) > 32 * 1024) failure ||= 'RESULT_LIMIT';
    if (failure) return taskResult('failed', failure, '', evidence);
    return taskResult('completed', null, summary, evidence);
  } catch {
    return taskResult(signal?.aborted ? 'cancelled' : 'failed', signal?.aborted ? 'CANCELLED' : 'SESSION_FAILED', '', evidence);
  } finally {
    signal?.removeEventListener('abort', abort);
    unsubscribe?.();
    session?.dispose();
  }
}
