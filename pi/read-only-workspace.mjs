import { constants, closeSync, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { TextDecoder } from 'node:util';

export class WorkspaceAccessError extends Error {
  constructor(code) {
    super(`Read-only workspace: ${code}`);
    this.code = code;
  }
}
const deny = code => { throw new WorkspaceAccessError(code); };
const excludedNames = new Set([
  '.git', '.pi', '.ssh', '.aws', '.azure', '.gnupg', '.kube', '.local-tools',
  'node_modules', '.npmrc', '.pypirc', '.netrc', 'credentials', 'credentials.json',
  'auth.json', 'secrets', 'secrets.json',
]);
function excluded(name) {
  const lower = name.toLowerCase();
  return excludedNames.has(lower) || /^\.env(?:\.|$)/i.test(name) ||
    /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.|$)/i.test(name) ||
    /\.(?:pem|key|p12|pfx|keystore)$/i.test(name);
}
const defaults = Object.freeze({ fileBytes: 256 * 1024, scanBytes: 4 * 1024 * 1024, entries: 2000, matches: 100, outputBytes: 64 * 1024 });

// A tool boundary, not an OS sandbox. Use on a trusted, quiescent workspace:
// Node path checks cannot eliminate ancestor-directory replacement races.
export function createReadOnlyWorkspace(rootPath, options = {}) {
  const limits = { ...defaults, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!(key in defaults) || !Number.isSafeInteger(value) || value < 1 || value > defaults[key]) deny('INVALID_LIMIT');
  }
  if (typeof rootPath !== 'string' || !rootPath) deny('INVALID_ROOT');
  const root = resolve(rootPath);
  if (realpathSync(root) !== root) deny('SYMLINK_ROOT');
  const identity = lstatSync(root);
  if (!identity.isDirectory()) deny('INVALID_ROOT');
  const requestedExclusions = options.exclude ?? [];
  if (!Array.isArray(requestedExclusions) || requestedExclusions.some(x => typeof x !== 'string' || !x || x.includes('\\') || isAbsolute(x) || x.split('/').some(p => p === '..' || p === '.' || !p))) deny('INVALID_EXCLUSION');
  const exclusions = [...requestedExclusions];
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function check(path = '.') {
    if (typeof path !== 'string' || !path || path.includes('\0') || path.includes('\\') || isAbsolute(path) || /^[a-z]:/i.test(path)) deny('INVALID_PATH');
    const parts = path === '.' ? [] : path.split('/');
    if (parts.some(p => !p || p === '..' || p === '.')) deny('INVALID_PATH');
    if (parts.some(excluded) || exclusions.some(x => path === x || path.startsWith(`${x}/`))) deny('EXCLUDED');
    const currentRoot = lstatSync(root);
    if (currentRoot.isSymbolicLink() || currentRoot.dev !== identity.dev || currentRoot.ino !== identity.ino || realpathSync(root) !== root) deny('ROOT_CHANGED');
    let target = root;
    let stat = currentRoot;
    for (const part of parts) {
      target = join(target, part);
      stat = lstatSync(target);
      if (stat.isSymbolicLink()) deny('SYMLINK');
      if (!stat.isDirectory() && !stat.isFile()) deny('SPECIAL_FILE');
      if (stat.isFile() && stat.nlink !== 1) deny('HARDLINK');
    }
    return { target, stat };
  }

  function read(path, signal) {
    signal?.throwIfAborted();
    const { target, stat } = check(path);
    if (!stat.isFile()) deny('NOT_FILE');
    if (stat.size > limits.fileBytes) deny('FILE_LIMIT');
    if (constants.O_NOFOLLOW === undefined) deny('UNSUPPORTED_PLATFORM');
    const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.nlink !== 1) deny('FILE_CHANGED');
      check(path);
      const buffer = Buffer.alloc(limits.fileBytes + 1);
      let size = 0;
      while (size < buffer.length) {
        signal?.throwIfAborted();
        const count = readSync(fd, buffer, size, buffer.length - size, null);
        if (!count) break;
        size += count;
      }
      if (size > limits.fileBytes) deny('FILE_LIMIT');
      const bytes = buffer.subarray(0, size);
      if (bytes.includes(0)) deny('BINARY_FILE');
      let text;
      try { text = decoder.decode(bytes); } catch { deny('BINARY_FILE'); }
      if (/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/.test(text)) deny('PRIVATE_KEY');
      return { path, text, bytes: size };
    } finally { closeSync(fd); }
  }

  // Search and listing share traversal; neither invokes a shell or follows links.
  function walk(directory, signal, visit) {
    let visited = 0;
    let skipped = 0;
    const pending = [directory];
    while (pending.length) {
      signal?.throwIfAborted();
      const base = pending.pop();
      const { target, stat } = check(base);
      if (!stat.isDirectory()) deny('NOT_DIRECTORY');
      const dir = opendirSync(target);
      try {
        let entry;
        while ((entry = dir.readSync())) {
          signal?.throwIfAborted();
          if (++visited > limits.entries) deny('ENTRY_LIMIT');
          const path = base === '.' ? entry.name : `${base}/${entry.name}`;
          let checked;
          try { checked = check(path); } catch (error) {
            if (!(error instanceof WorkspaceAccessError)) throw error;
            if (!['EXCLUDED', 'SYMLINK', 'HARDLINK', 'SPECIAL_FILE', 'INVALID_PATH'].includes(error.code)) throw error;
            skipped++;
            continue;
          }
          if (checked.stat.isDirectory()) pending.push(path);
          else visit(path);
        }
      } finally { dir.closeSync(); }
    }
    return skipped;
  }
  function output(value) {
    if (Buffer.byteLength(JSON.stringify(value)) > limits.outputBytes) deny('OUTPUT_LIMIT');
    return value;
  }
  return Object.freeze({
    read(path, { signal } = {}) { return output(read(path, signal)); },
    list(directory = '.', { signal } = {}) {
      const files = [];
      const skipped = walk(directory, signal, path => { files.push(path); output(files); });
      return output({ files: files.sort(), skipped });
    },
    search(query, { directory = '.', signal } = {}) {
      if (typeof query !== 'string' || !query || Buffer.byteLength(query) > 1024) deny('INVALID_QUERY');
      const matches = [];
      let scannedBytes = 0;
      let skippedContent = 0;
      const skipped = walk(directory, signal, path => {
        // Check the size against the remaining scan budget before reading.
        if (check(path).stat.size > limits.scanBytes - scannedBytes) deny('SCAN_LIMIT');
        let file;
        try { file = read(path, signal); } catch (error) {
          if (!(error instanceof WorkspaceAccessError) || !['FILE_LIMIT', 'BINARY_FILE', 'PRIVATE_KEY'].includes(error.code)) throw error;
          skippedContent++;
          // Bound repeated rejected reads as well as accepted content.
          scannedBytes += Math.min(check(path).stat.size, limits.fileBytes + 1);
          if (scannedBytes > limits.scanBytes) deny('SCAN_LIMIT');
          return;
        }
        scannedBytes += file.bytes;
        if (scannedBytes > limits.scanBytes) deny('SCAN_LIMIT');
        file.text.split('\n').forEach((text, i) => {
          if (!text.includes(query)) return;
          if (matches.length >= limits.matches) deny('MATCH_LIMIT');
          matches.push({ path, line: i + 1, text });
          output(matches);
        });
      });
      return output({ matches, scannedBytes, skipped: skipped + skippedContent });
    },
  });
}
