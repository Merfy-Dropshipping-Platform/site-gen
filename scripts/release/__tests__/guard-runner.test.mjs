/**
 * Раскладка и подсчёт гардов (spec 115). Последовательная джоба CI обязана
 * идти по очереди и локально — иначе тесты, которые на время правят исходники,
 * гоняются рядом с их читателями. Счётчики гарда одинаковы, откуда бы ни
 * пришёл файл — из прогона или из памяти, и ноль по-прежнему провал.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributeGuards, splitJestGuards, SEQUENTIAL_JOBS } from '../lib/guard-runner.mjs';

const guard = (label, job, paths, kind = 'jest-batch') => ({ label, job, paths, kind, cmd: `jest ${paths.join(' ')}` });

test('гарды последовательной джобы — по очереди, прочие — в общий параллельный прогон', () => {
  const [seqJob] = SEQUENTIAL_JOBS;
  const { parallel, sequential } = splitJestGuards([
    guard('a', 'satin-structural-conformance', ['src/a.spec.ts']),
    guard('b', seqJob, ['src/b.spec.ts']),
    guard('c', seqJob, ['x'], 'opaque'),
  ]);
  assert.deepEqual(parallel.map((g) => g.label), ['a']);
  assert.deepEqual(sequential.map((g) => g.label), ['b']);
});

test('счётчики гарда: сумма файлов; «из памяти» — только если все его файлы из памяти; ноль — провал', () => {
  const root = '/repo';
  const files = new Map([
    ['/repo/src/a.spec.ts', { passed: 3, failed: 0, skipped: 1, status: 'passed', fromMemory: true }],
    ['/repo/src/b.spec.ts', { passed: 2, failed: 0, skipped: 0, status: 'passed' }],
    ['/repo/src/z.spec.ts', { passed: 0, failed: 0, skipped: 4, status: 'focused', fromMemory: true }],
  ]);
  const [ab, a, z] = attributeGuards([
    guard('ab', 'j', ['src/a.spec.ts', 'src/b.spec.ts']),
    guard('a', 'j', ['src/a.spec.ts']),
    guard('z', 'j', ['src/z.spec.ts']),
  ], files, root);
  assert.equal(ab.passed, 5);
  assert.equal(ab.skipped, 1);
  assert.equal(ab.fromMemory, false, 'b прогнан — гард не целиком из памяти');
  assert.equal(a.fromMemory, true);
  assert.equal(z.ok, false, 'ноль прошедших — провал и из памяти');
  assert.match(z.why, /ни одной ПРОШЕДШЕЙ/);
});
