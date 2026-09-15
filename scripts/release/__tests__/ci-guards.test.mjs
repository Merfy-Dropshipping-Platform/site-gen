/**
 * Разбор ci.yml — это то место, где инструмент может молча ослепнуть:
 * пропустил шаг — гард не гонялся, но и не назван. Поэтому разбор проверяется
 * на кусках настоящего workflow, включая свёрнутые скаляры и working-directory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflowSteps, guardsFromWorkflow, classify, expandChain, resolveScript } from '../lib/ci-guards.mjs';
import { formatGuardTable } from '../lib/guard-runner.mjs';

const WF = `name: CI
on:
  push:
    branches: ["main"]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run lint
        continue-on-error: true
        run: pnpm run lint:check
      - name: Тесты миграций ревизий
        run: pnpm exec jest --runInBand src/utils/__tests__/
      - name: Тесты пакета theme-contract
        working-directory: packages/theme-contract
        run: >-
          pnpm exec jest --config jest.config.ts --runInBand
          --testPathIgnorePatterns 'cli-validate'
  satin-structural-conformance:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm build:theme-sections:all
      - run: pnpm test:section-snapshots
      - run: node --test scripts/__tests__/block-source-layout.test.mjs
      - run: pnpm conformance:satin
  deploy-to-coolify:
    steps:
      - name: Deploy through the Coolify API
        run: curl -sS "http://example/deploy"
`;

const SCRIPTS = {
  'test:section-snapshots': 'jest --runInBand src/themes/__tests__/section-html-snapshot.spec.ts',
  'conformance:satin': 'tsx scripts/theme-conformance.ts --theme satin',
  'test:conformance:shared': 'pnpm exec jest --config a/jest.config.ts --runInBand --testPathPattern=conformance- && pnpm exec jest --runInBand src/themes/__tests__/x.spec.ts',
  'lint:check': 'eslint "{src,test}/**/*.ts"',
};

test('свёрнутый скаляр и working-directory разбираются', () => {
  const steps = parseWorkflowSteps(WF);
  const tc = steps.find((s) => s.name === 'Тесты пакета theme-contract');
  assert.equal(tc.cwd, 'packages/theme-contract');
  assert.match(tc.run, /--config jest\.config\.ts --runInBand --testPathIgnorePatterns 'cli-validate'/);
  assert.equal(tc.job, 'build-and-test');
});

test('инфраструктура, выкатка и continue-on-error в гарды не попадают', () => {
  const labels = guardsFromWorkflow(WF).map((g) => g.label);
  assert.ok(!labels.some((l) => /Install|Checkout|Deploy|Run lint/.test(l)), labels.join('|'));
  assert.ok(!labels.includes('pnpm build:theme-sections:all'));
  assert.deepEqual(labels.sort(), [
    'node --test scripts/__tests__/block-source-layout.test.mjs',
    'pnpm conformance:satin',
    'pnpm test:section-snapshots',
    'Тесты миграций ревизий',
    'Тесты пакета theme-contract',
  ].sort());
});

test('классификация: батч, свой конфиг, node --test, без счётчика', () => {
  const g = guardsFromWorkflow(WF).map((x) => classify(x, SCRIPTS));
  const kind = (part) => g.find((x) => x.label.includes(part)).kind;
  assert.equal(kind('миграций'), 'jest-batch');
  assert.equal(kind('theme-contract'), 'jest-solo');
  assert.equal(kind('node --test'), 'node-test');
  assert.equal(kind('conformance:satin'), 'opaque');
  assert.deepEqual(g.find((x) => x.label.includes('section-snapshots')).paths, ['src/themes/__tests__/section-html-snapshot.spec.ts']);
});

test('pnpm-скрипт разворачивается в тело', () => {
  assert.equal(resolveScript('pnpm test:section-snapshots', SCRIPTS), SCRIPTS['test:section-snapshots']);
  assert.equal(resolveScript('pnpm exec jest --runInBand a.spec.ts', SCRIPTS), 'pnpm exec jest --runInBand a.spec.ts');
});

test('цепочка `a && b` считается двумя гардами, а не одним без счётчика', () => {
  const parts = expandChain({ label: 'shared', cmd: 'pnpm test:conformance:shared' }, SCRIPTS);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.kind !== 'opaque'), parts.map((p) => p.kind).join(','));
  assert.deepEqual(parts.map((p) => p.label), ['shared [1/2]', 'shared [2/2]']);
});

test('ноль ПРОШЕДШИХ проверок печатается как провал, а не как «ок»', () => {
  const table = formatGuardTable([
    { label: 'гард с нулём', kind: 'jest-batch', passed: 0, failed: 0, skipped: 0, ok: false, why: 'ни один файл не найден по пути из ci.yml' },
    { label: 'гард со скипами', kind: 'jest-batch', passed: 0, failed: 0, skipped: 3, ok: false, why: 'ни одной ПРОШЕДШЕЙ проверки' },
    { label: 'нормальный гард', kind: 'jest-batch', passed: 12, failed: 0, skipped: 0, ok: true, why: null },
    { label: 'без счётчика', kind: 'opaque', passed: null, failed: null, skipped: null, ok: true, why: null },
  ]);
  assert.match(table, /гард с нулём\s+0\s+0\s+НОЛЬ ПРОВЕРОК/);
  assert.match(table, /гард со скипами\s+0\s+3\s+НОЛЬ ПРОВЕРОК/);
  assert.match(table, /нормальный гард\s+12\s+0\s+ок/);
  assert.match(table, /без счётчика\s+—\s+—\s+ок \(команда без счётчика/);
});
