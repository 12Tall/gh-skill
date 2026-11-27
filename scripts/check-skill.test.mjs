import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkSkill } from './check-skill.mjs';

const validSkill = '---\nname: gh-skill\ndescription: Example\n---\n';

function fixture(t, readme = '', skill = validSkill) {
  const root = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.check-skill-'));
  t.after(() => rmSync(root, { recursive: true }));
  writeFileSync(join(root, 'SKILL.md'), skill);
  writeFileSync(join(root, 'README.md'), readme);
  return root;
}

test('ignores example links inside backtick and tilde fences', t => {
  const root = fixture(t, '```markdown\n[example](missing.md)\n```\n~~~\n[example](other.md)\n~~~\n');
  assert.doesNotThrow(() => checkSkill(root));
});

test('a shorter fence does not close a longer one', t => {
  const root = fixture(t, '````\n```\n[example](ignored.md)\n````\n[real link](actual.md)\n');
  assert.throws(() => checkSkill(root), { message: 'Missing relative link targets:\nREADME.md: actual.md' });
});

test('reports only broken file links outside fences', t => {
  const root = fixture(t, '```\n[example](ignored.md)\n```\n[real link](actual.md)\n');
  assert.throws(() => checkSkill(root), { message: 'Missing relative link targets:\nREADME.md: actual.md' });
});

test('checks nested docs links as well as README and references', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'docs', 'nested'), { recursive: true });
  writeFileSync(join(root, 'docs', 'nested', 'guide.md'), '[missing](../missing.md)\n');
  assert.throws(() => checkSkill(root), /docs\/nested\/guide.md: \.\.\/missing.md/);
  writeFileSync(join(root, 'docs', 'missing.md'), '# Present\n');
  assert.doesNotThrow(() => checkSkill(root));
});

test('checks required frontmatter', t => {
  assert.throws(() => checkSkill(fixture(t, '', '# No frontmatter\n')), /missing frontmatter/);
  assert.throws(() => checkSkill(fixture(t, '', validSkill.replace('gh-skill', 'wrong'))), /name must be gh-skill/);
  assert.throws(() => checkSkill(fixture(t, '', validSkill.replace('Example', ' '))), /description must be/);
});

test('accepts encoded existing files and does not fetch external links', t => {
  const root = fixture(t, '[file](one%20file.md#heading) [external](https://example.invalid/) [anchor](#heading)');
  writeFileSync(join(root, 'one file.md'), '# Heading\n');
  assert.doesNotThrow(() => checkSkill(root));
});
