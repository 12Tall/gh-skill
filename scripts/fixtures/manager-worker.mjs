// Controllable child for local lifecycle tests only; never used by the real worker.
import { spawn } from 'node:child_process';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input);
const result = { status: 'completed', code: null, summary: 'fixture complete', evidence: [], verified: false };
switch (config.task) {
  case 'success': process.stdout.write(JSON.stringify(result)); break;
  case 'unicode': {
    const bytes = Buffer.from(JSON.stringify({ ...result, summary: '验证完成' }));
    for (const byte of bytes) process.stdout.write(Buffer.from([byte]));
    break;
  }
  case 'malformed': process.stdout.write('not JSON'); break;
  case 'forged': process.stdout.write(JSON.stringify({ ...result, verified: true })); break;
  case 'forged-tool': process.stdout.write(JSON.stringify({ ...result, evidence: [{ tool: 'bash', path: '.', ok: true }] })); break;
  case 'failed-evidence': process.stdout.write(JSON.stringify({ ...result, evidence: [{ tool: 'workspace_read', path: '.env', ok: false }] })); break;
  case 'nonzero': process.stdout.write(JSON.stringify(result)); process.exitCode = 2; break;
  case 'flood': process.stdout.write('x'.repeat(100_000)); break;
  case 'stderr': process.stderr.write('x'.repeat(100_000)); break;
  case 'tree':
    spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'], { stdio: ['ignore', 'inherit', 'inherit'] });
    // fall through: both processes resist graceful termination
  case 'hang': process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); break;
  default: process.exitCode = 3;
}
