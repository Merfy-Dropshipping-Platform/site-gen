/**
 * Память результатов (spec 115, часть 3): берёт прошлый зелёный результат,
 * только если не изменился НИ ОДИН вход и общий ключ. Всё, что меняет
 * результат проверки, обязано давать промах.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHasher } from '../lib/file-hash.mjs';
import { lookup, store } from '../lib/result-cache.mjs';
import { buildKeyOf, relativizer, specInputs } from '../lib/affected.mjs';

const fresh = () => mkdtempSync(join(tmpdir(), 'memory-'));

function repo() {
  const root = fresh();
  mkdirSync(join(root, 'src/__tests__'), { recursive: true });
  writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;');
  writeFileSync(join(root, 'src/__tests__/a.spec.ts'), 'test("a", () => {});');
  return { root, dir: join(root, '.memory'), hasher: () => createHasher(root, { memoFile: join(root, 'memo.json') }) };
}

test('прежние входы и ключ — попадание с тем же числом проверок', () => {
  const r = repo();
  store({ dir: r.dir, id: 'src/__tests__/a.spec.ts', globalKey: 'g1', hasher: r.hasher(), inputs: ['src/a.ts', 'src/__tests__/a.spec.ts'], result: { passed: 7, skipped: 0 } });
  const hit = lookup({ dir: r.dir, id: 'src/__tests__/a.spec.ts', globalKey: 'g1', hasher: r.hasher() });
  assert.equal(hit?.result.passed, 7);
});

test('правка входа, пропажа входа, другой общий ключ — промах', () => {
  const r = repo();
  const id = 'src/__tests__/a.spec.ts';
  store({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher(), inputs: ['src/a.ts', id, 'src/нет.ts'], result: { passed: 1, skipped: 0 } });
  assert.equal(lookup({ dir: r.dir, id, globalKey: 'g2', hasher: r.hasher() }), null, 'другой общий ключ');
  writeFileSync(join(r.root, 'src/нет.ts'), 'появился');
  assert.equal(lookup({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher() }), null, 'появился файл, которого не было');
  unlinkSync(join(r.root, 'src/нет.ts'));
  assert.ok(lookup({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher() }), 'вернулось как было — снова попадание');
  writeFileSync(join(r.root, 'src/a.ts'), 'export const a = 2;');
  assert.equal(lookup({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher() }), null, 'правка входа');
});

test('две ветки с разным содержимым не вытесняют друг друга', () => {
  const r = repo();
  const id = 'src/__tests__/a.spec.ts';
  store({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher(), inputs: ['src/a.ts'], result: { passed: 1, skipped: 0 } });
  writeFileSync(join(r.root, 'src/a.ts'), 'export const a = 2;');
  store({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher(), inputs: ['src/a.ts'], result: { passed: 2, skipped: 0 } });
  writeFileSync(join(r.root, 'src/a.ts'), 'export const a = 1;');
  assert.equal(lookup({ dir: r.dir, id, globalKey: 'g1', hasher: r.hasher() })?.result.passed, 1);
});

test('входы spec-файла: снимок jest входит, node_modules и чужое — нет', () => {
  const r = repo();
  const toRel = relativizer(r.root);
  const trace = {
    testPath: join(r.root, 'src/__tests__/a.spec.ts'),
    modules: [join(r.root, 'src/a.ts'), join(r.root, 'node_modules/x/index.js')],
    reads: ['/etc/hosts', join(r.root, 'dist/x.mjs')],
  };
  assert.deepEqual(specInputs(trace, toRel).sort(), ['dist/x.mjs', 'src/__tests__/__snapshots__/a.spec.ts.snap', 'src/__tests__/a.spec.ts', 'src/a.ts']);
});

test('ключ сборки: правка исходника меняет, правка spec-файла — нет', () => {
  const r = repo();
  spawnSync('git', ['init', '-q'], { cwd: r.root });
  const k1 = buildKeyOf(r.hasher(), r.root);
  writeFileSync(join(r.root, 'src/__tests__/a.spec.ts'), 'test("b", () => {});');
  assert.equal(buildKeyOf(r.hasher(), r.root), k1, 'spec-файл сборка не читает');
  writeFileSync(join(r.root, 'src/a.ts'), 'export const a = 3;');
  assert.notEqual(buildKeyOf(r.hasher(), r.root), k1, 'исходник сборки');
});

test('правка отслеживаемого файла в общем прогоне: не верим ни писателю, ни тем, кто его читал', async () => {
  const { touchedByWrites } = await import('../lib/affected.mjs');
  const r = repo();
  const toRel = relativizer(r.root);
  const t = (name, extra) => ({ testPath: join(r.root, `src/__tests__/${name}.spec.ts`), modules: [], reads: [], writes: [], ...extra });
  const traces = new Map([
    ['w', t('writer', { writes: [join(r.root, 'src/a.ts'), '/tmp/чужое'] })],
    ['r', t('reader', { reads: [join(r.root, 'src/a.ts')] })],
    ['o', t('other', { reads: [join(r.root, 'src/b.ts')] })],
  ]);
  const { written, unsafe } = touchedByWrites(traces, toRel, new Set(['src/a.ts', 'src/b.ts']));
  assert.deepEqual([...written], ['src/a.ts']);
  assert.deepEqual([...unsafe].map((p) => p.split('/').pop()).sort(), ['reader.spec.ts', 'writer.spec.ts']);
});
