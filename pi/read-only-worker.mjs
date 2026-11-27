import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateTaskConfig } from './read-only-manager.mjs';
import { runReadOnlyTask, taskResult } from './read-only-task.mjs';

const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
let result;
let runtime;
try {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 32 * 1024) throw new Error('CONFIG_LIMIT');
  }
  const config = JSON.parse(input);
  validateTaskConfig(config);
  if (controller.signal.aborted) result = taskResult('cancelled', 'CANCELLED');
  else {
    const manifest = JSON.parse(readFileSync(join(config.sdkPackage, 'package.json'), 'utf8'));
    if (manifest.name !== '@earendil-works/pi-coding-agent' || typeof manifest.exports?.['.']?.import !== 'string') throw new Error('INVALID_SDK');
    const require = createRequire(join(config.sdkPackage, 'package.json'));
    const sdk = await import(pathToFileURL(resolve(config.sdkPackage, manifest.exports['.'].import)).href);
    const { Type } = await import(pathToFileURL(require.resolve('typebox')).href);
    // Explicit credential location; no user models.json or disk model-store discovery.
    runtime = await sdk.ModelRuntime.create({ authPath: config.authPath, modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
    const model = runtime.getModel(config.provider, config.model);
    if (!model) result = taskResult('failed', 'MODEL_UNAVAILABLE');
    else result = await runReadOnlyTask({
      sdk, Type, modelRuntime: runtime, model, root: config.root,
      task: config.task, acceptance: config.acceptance, exclude: config.exclude, limits: config.limits,
      signal: controller.signal,
    });
  }
} catch {
  result = taskResult(controller.signal.aborted ? 'cancelled' : 'failed', controller.signal.aborted ? 'CANCELLED' : 'WORKER_FAILED');
} finally {
  try { await runtime?.settleCredentialWrites(); } catch { result = taskResult('failed', 'CREDENTIAL_SETTLE_FAILED'); }
}
// Bound the final protocol record even when many long evidence paths accumulate.
if (Buffer.byteLength(JSON.stringify(result)) > 60 * 1024) result = taskResult('failed', 'RESULT_LIMIT');
process.stdout.write(JSON.stringify(result), () => process.exit(0));
