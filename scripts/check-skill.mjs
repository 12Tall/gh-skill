import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function* proseLines(markdown) {
  let fence;
  for (const line of markdown.split(/\r\n|\n|\r/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
      }
      continue;
    }
    if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = marker[1];
      continue;
    }
    yield line;
  }
}

function* markdownFiles(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield path;
  }
}

export function checkSkill(root) {
  const skill = resolve(root, 'SKILL.md');
  const text = readFileSync(skill, 'utf8').replace(/\r\n?/g, '\n');
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!frontmatter) throw new Error('SKILL.md: missing frontmatter');
  const fields = new Map(Array.from(frontmatter[1].matchAll(/^(name|description):[ \t]*(.*)$/gm),
    ([, name, value]) => [name, value]));
  if (fields.get('name') !== 'gh-skill') throw new Error('SKILL.md: name must be gh-skill');
  const descriptionLength = [...(fields.get('description') ?? '').trim()].length;
  if (descriptionLength < 1 || descriptionLength > 1024) {
    throw new Error('SKILL.md: description must be 1–1024 characters');
  }

  const missing = [];
  const docs = [skill, resolve(root, 'README.md'), ...markdownFiles(resolve(root, 'references')), ...markdownFiles(resolve(root, 'docs'))];
  for (const doc of docs) {
    for (const line of proseLines(readFileSync(doc, 'utf8'))) {
      for (const [, target] of line.matchAll(/\]\(([^\s)]+)\)/g)) {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
        const path = target.split(/[?#]/, 1)[0];
        if (path && !existsSync(resolve(dirname(doc), decodeURIComponent(path)))) {
          missing.push(`${relative(root, doc)}: ${target}`);
        }
      }
    }
  }
  if (missing.length) throw new Error(`Missing relative link targets:\n${missing.join('\n')}`);
}

const script = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === script) {
  try {
    checkSkill(resolve(dirname(script), '..'));
    console.log('Skill frontmatter and relative links OK');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
