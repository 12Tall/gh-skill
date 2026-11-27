import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, linkSync, rmSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createReadOnlyWorkspace } from '../pi/read-only-workspace.mjs';

function fixture(t) {
  const base = mkdtempSync(fileURLToPath(new URL('./fixtures/workspace-', import.meta.url)));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project');
  mkdirSync(root);
  const put = (path, content) => {
    const target = join(root, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  };
  put('src/main.js', 'hello\nneedle\n');
  writeFileSync(join(base, 'outside.txt'), 'OUTSIDE_SECRET');
  return { base, root, put, workspace: createReadOnlyWorkspace(root) };
}
const code = expected => error => error.code === expected;

test('read, recursive listing and literal search return evidence without modifying files', t => {
  const { root, workspace } = fixture(t);
  const before = readFileSync(join(root, 'src/main.js'));
  assert.equal(workspace.read('src/main.js').text, 'hello\nneedle\n');
  assert.deepEqual(workspace.list(), { files: ['src/main.js'], skipped: 0 });
  assert.deepEqual(workspace.search('needle').matches, [{ path: 'src/main.js', line: 2, text: 'needle' }]);
  assert.deepEqual(workspace.search('.*').matches, []);
  assert.deepEqual(readFileSync(join(root, 'src/main.js')), before);
});

test('every entry point rejects traversal, absolute and ambiguous paths', t => {
  const { base, workspace } = fixture(t);
  for (const path of ['../outside.txt', 'src/../../outside.txt', join(base, 'outside.txt'), 'C:/secret', 'src\\main.js', 'src/./main.js', 'src//main.js', 'a\0b', '']) {
    assert.throws(() => workspace.read(path), code('INVALID_PATH'));
    assert.throws(() => workspace.list(path), code('INVALID_PATH'));
    assert.throws(() => workspace.search('secret', { directory: path }), code('INVALID_PATH'));
  }
});

test('sensitive files and directories are denied by read and hidden from listing/search', t => {
  const { put, workspace } = fixture(t);
  const paths = ['.env', '.env.local', 'src/.ENV.test', '.git/config', '.ssh/id_rsa', 'credentials.json', 'auth.json', 'server.pem', 'src/id_ed25519.pub', '.local-tools/secret.txt', '.pi/settings.json'];
  for (const path of paths) {
    put(path, 'HIDDEN_SECRET');
    assert.throws(() => workspace.read(path), code('EXCLUDED'));
  }
  assert.deepEqual(workspace.list().files, ['src/main.js']);
  assert.deepEqual(workspace.search('HIDDEN_SECRET').matches, []);
  assert.ok(workspace.list().skipped > 0);
});

test('additional exclusions only narrow access', t => {
  const { root, put } = fixture(t);
  put('private/token.txt', 'token');
  const exclude = ['private'];
  const workspace = createReadOnlyWorkspace(root, { exclude });
  exclude.length = 0; // Caller mutation must not widen a created workspace.
  assert.throws(() => workspace.read('private/token.txt'), code('EXCLUDED'));
  assert.deepEqual(workspace.list().files, ['src/main.js']);
  assert.throws(() => createReadOnlyWorkspace(root, { exclude: ['../elsewhere'] }), code('INVALID_EXCLUSION'));
});

test('file and directory symlinks, including internal ones, cannot bypass tools', t => {
  const { base, root, workspace } = fixture(t);
  symlinkSync('../outside.txt', join(root, 'escape.txt'));
  symlinkSync('src/main.js', join(root, 'internal.txt'));
  symlinkSync(base, join(root, 'escape-dir'));
  for (const path of ['escape.txt', 'internal.txt', 'escape-dir/outside.txt']) {
    assert.throws(() => workspace.read(path), code('SYMLINK'));
  }
  assert.throws(() => workspace.list('escape-dir'), code('SYMLINK'));
  assert.throws(() => workspace.search('SECRET', { directory: 'escape-dir' }), code('SYMLINK'));
  assert.deepEqual(workspace.list().files, ['src/main.js']);
  assert.deepEqual(workspace.search('OUTSIDE_SECRET').matches, []);
  symlinkSync(root, join(base, 'alias'));
  assert.throws(() => createReadOnlyWorkspace(join(base, 'alias')), code('SYMLINK_ROOT'));
});

test('hard links cannot expose excluded or out-of-scope content', t => {
  const { base, root, workspace } = fixture(t);
  linkSync(join(base, 'outside.txt'), join(root, 'hardlink.txt'));
  assert.throws(() => workspace.read('hardlink.txt'), code('HARDLINK'));
  assert.deepEqual(workspace.list().files, ['src/main.js']);
  assert.deepEqual(workspace.search('OUTSIDE_SECRET').matches, []);
});

test('root replacement fails closed instead of reading another directory', t => {
  const { root, workspace } = fixture(t);
  renameSync(root, `${root}-old`);
  mkdirSync(root);
  assert.throws(() => workspace.list(), code('ROOT_CHANGED'));
});

test('binary, invalid UTF-8 and private-key content cannot be returned or searched', t => {
  const { put, workspace } = fixture(t);
  put('binary', Buffer.from([0, 1, 2]));
  put('invalid', Buffer.from([0xff]));
  put('innocent.txt', '-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET\n');
  assert.throws(() => workspace.read('binary'), code('BINARY_FILE'));
  assert.throws(() => workspace.read('invalid'), code('BINARY_FILE'));
  assert.throws(() => workspace.read('innocent.txt'), code('PRIVATE_KEY'));
  assert.deepEqual(workspace.search('SECRET').matches, []);
  assert.equal(workspace.search('hello').skipped, 3);
});

test('file, aggregate scan, output, entry and match budgets fail explicitly', t => {
  const { root, put } = fixture(t);
  put('large.txt', 'x'.repeat(50));
  assert.throws(() => createReadOnlyWorkspace(root, { limits: { fileBytes: 20 } }).read('large.txt'), code('FILE_LIMIT'));
  assert.throws(() => createReadOnlyWorkspace(root, { limits: { scanBytes: 5 } }).search('hello'), code('SCAN_LIMIT'));
  assert.throws(() => createReadOnlyWorkspace(root, { limits: { outputBytes: 5 } }).read('src/main.js'), code('OUTPUT_LIMIT'));
  assert.throws(() => createReadOnlyWorkspace(root, { limits: { outputBytes: 5 } }).list(), code('OUTPUT_LIMIT'));
  assert.throws(() => createReadOnlyWorkspace(root, { limits: { entries: 1 } }).list(), code('ENTRY_LIMIT'));
  put('matches.txt', 'match\nmatch\n');
  assert.throws(() => createReadOnlyWorkspace(root, { limits: { matches: 1 } }).search('match'), code('MATCH_LIMIT'));
});

test('limits cannot be widened and queries must be bounded nonempty strings', t => {
  const { root, workspace } = fixture(t);
  for (const limits of [{ fileBytes: Infinity }, { entries: 0 }, { matches: 101 }, { unknown: 1 }]) {
    assert.throws(() => createReadOnlyWorkspace(root, { limits }), code('INVALID_LIMIT'));
  }
  for (const query of ['', null, 'x'.repeat(1025)]) assert.throws(() => workspace.search(query), code('INVALID_QUERY'));
});

test('pre-aborted operations perform no scan or read', t => {
  const { workspace } = fixture(t);
  const signal = AbortSignal.abort(new Error('cancelled'));
  assert.throws(() => workspace.read('src/main.js', { signal }), /cancelled/);
  assert.throws(() => workspace.list('.', { signal }), /cancelled/);
  assert.throws(() => workspace.search('hello', { signal }), /cancelled/);
});

test('missing files and wrong object types are reported rather than empty success', t => {
  const { workspace } = fixture(t);
  assert.throws(() => workspace.read('missing'), code('ENOENT'));
  assert.throws(() => workspace.read('src'), code('NOT_FILE'));
  assert.throws(() => workspace.list('src/main.js'), code('NOT_DIRECTORY'));
});
