// Task 6 — CI theme-conformance layout regression (Satin-independent lineage).
//
// This repo's lineage carries the conformance ENGINE (Bloom + Satin cores) but
// NOT a `bloom-structural-conformance` CI job: our core-rebase landed the
// conformance code without the Bloom CI job (that job lives in the Bloom plan's
// Tasks 8-10, which are outside this lineage). The upstream Task 6 spec assumed
// a landed Bloom job and a byte-for-byte `bloom-structural-commands.json`
// fixture; here that job does not exist, so:
//
//   * We do NOT create a placeholder `bloom-structural-commands.json` (an empty
//     or invented fixture would falsely imply the job exists).
//   * We assert the Bloom job is ABSENT and document the migration contract:
//     when a `bloom-structural-conformance` job is later added, it MUST be
//     inserted into `deploy-to-coolify.needs` BEFORE `satin-structural-
//     conformance` (matching the upstream ordering) and its `run` command list
//     must be pinned byte-for-byte via a real fixture at that time.
//
// Everything else follows the reviewed Task 6 spec: the Satin gate keeps an
// exact ordered `run` command list, deploy depends on the Satin gate, and
// `src/themes/__tests__` owns exactly the eight `satin-conformance-*`
// real-artifact tests with no `conformance-satin-*` counterparts.
//
// b51-ci-speed2: the Satin gate is no longer ONE self-contained job. It is
// three — `satin-build` (builds dist/ once), `satin-structural-conformance`
// (matrix-sharded batched guards, downloads dist/ as an artifact) and
// `satin-dictated-conformance` (the order-pinned conformance tail, also
// downloads dist/) — so the pinned command list below is split across the
// two jobs that actually run `run:` steps, at the exact point where the old
// single list crossed from "build" to "test:conformance:shared". The set of
// commands and their relative order are unchanged; only which job runs them
// changed, and `needs: satin-build` on both downstream jobs is asserted
// explicitly so a broken artifact hand-off fails this test too.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

// b51-ci-speed2: до этой ветки все 17 команд ниже жили ОДНОЙ пинned-
// подпоследовательностью внутри satin-structural-conformance. Теперь сборка
// гоняется один раз в отдельной джобе satin-build (а не по разу на каждый
// сегмент матрицы), а дословный хвост-конформанс — в отдельной джобе
// satin-dictated-conformance (а не сериально ПОСЛЕ батча сегмента 1). Набор
// команд и их относительный порядок НЕ изменились — изменилось только то, в
// какой job они физически стоят, поэтому список пинов расщеплён на две части
// строго по этой границе (после `run-theme-build.ts satin`, перед
// `test:conformance:shared`), а не переписан заново.
const expectedSatinBuildCommands = [
  'corepack prepare pnpm@10.14.0 --activate',
  'pnpm install --frozen-lockfile',
  'pnpm build',
  'pnpm build:blocks',
  'pnpm build:theme-sections satin',
  'pnpm exec tsx scripts/run-theme-build.ts satin',
];

const expectedSatinDictatedCommands = [
  'pnpm test:conformance:shared',
  'pnpm test:conformance:satin',
  'node --test scripts/__tests__/block-source-layout.test.mjs',
  'node --test scripts/__tests__/workspace-docker-layout.test.mjs',
  'pnpm exec jest --runInBand src/generator/__tests__/pnpm-invocation.spec.ts',
  'pnpm exec jest --runInBand src/themes/__tests__/block-artifact-resolver.spec.ts',
  'pnpm exec jest --runInBand src/themes/__tests__/cart-drawer-contract.spec.ts',
  'pnpm exec jest --runInBand src/themes/__tests__/preview-cart-contract.spec.ts',
  'pnpm conformance:satin',
  'pnpm check:css-layers',
  'pnpm validate:page-seeds',
];

const satinTestFiles = [
  'satin-conformance-source-snapshot.spec.ts',
  'satin-conformance-mapped-renderers.spec.ts',
  'satin-conformance-route-matrix.spec.ts',
  'satin-conformance-storefront-inventory.spec.ts',
  'satin-conformance-structural-checks.spec.ts',
  'satin-conformance-slideshow-renderer.spec.ts',
  'satin-conformance-multicolumns-contract.spec.ts',
  'satin-conformance-tier-transaction.spec.ts',
].sort();

/**
 * Minimal, dependency-free reader for THIS workflow's shape.
 *
 * `yaml`/`js-yaml` are not in the dependency tree, so instead of pulling in a
 * general parser we read exactly what the regression needs from the flat,
 * 2-space-indented `ci.yml`:
 *   - `jobs.<name>`                 (job blocks under a top-level `jobs:` key)
 *   - `jobs.<name>.needs`           (list or scalar)
 *   - `jobs.<name>.steps[].run`     (ordered `run:` scalars, in file order)
 *
 * It intentionally understands only block-style `- run:` / `- name:`/`- uses:`
 * step entries and `needs:` lists, which is the entire surface this file (and
 * the spec's `runCommands`/`loadWorkflow` helpers) exercises.
 */
function loadWorkflow(relPath) {
  const text = readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
  const rawLines = text.split('\n');
  // Strip trailing whitespace but keep leading indentation for structure.
  const lines = rawLines.map((l) => l.replace(/\s+$/, ''));

  const jobs = {};
  let inJobs = false;
  let currentJob = null;

  const indentOf = (line) => line.length - line.replace(/^ +/, '').length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' || /^\s*#/.test(line)) continue;

    // Top-level `jobs:` key (indent 0).
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    // Any other top-level key closes the jobs section.
    if (indentOf(line) === 0 && !/^jobs:\s*$/.test(line)) {
      inJobs = false;
      currentJob = null;
      continue;
    }
    if (!inJobs) continue;

    // Job header: exactly 2-space indent, `name:` with nothing after the colon.
    const jobHeader = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jobHeader) {
      currentJob = jobHeader[1];
      jobs[currentJob] = { name: currentJob, needs: undefined, runs: [] };
      continue;
    }
    if (!currentJob) continue;

    // `needs:` for the current job. Supports inline scalar/list and block list.
    const needsInline = line.match(/^ {4}needs:\s*(.+)$/);
    if (needsInline) {
      const value = needsInline[1].trim();
      if (value.startsWith('[')) {
        jobs[currentJob].needs = value
          .slice(1, -1)
          .split(',')
          .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else {
        jobs[currentJob].needs = [value.replace(/^['"]|['"]$/g, '')];
      }
      continue;
    }
    if (/^ {4}needs:\s*$/.test(line)) {
      const collected = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const item = lines[j].match(/^ {6}-\s*(.+)$/);
        if (!item) break;
        collected.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
      }
      jobs[currentJob].needs = collected;
      i = j - 1;
      continue;
    }

    // Ordered `run:` scalars inside `steps:`. Handles `- run: <cmd>`, a
    // `run: <cmd>` continuation line of a `- name:`/`- uses:` step, и блочные
    // скаляры `run: >-` / `run: |`, которыми записывают длинные команды.
    // Раньше блочный скаляр попадал в список как команда ">-", и весь гард
    // разъезжался на первом же многострочном шаге.
    const runMatch = line.match(/^(\s*)-?\s*run:\s*(.+)$/);
    if (runMatch) {
      const value = runMatch[2].trim();
      if (value === '>-' || value === '>' || value === '|' || value === '|-') {
        const baseIndent = indentOf(line);
        const parts = [];
        let j = i + 1;
        for (; j < lines.length; j++) {
          if (lines[j] === '') continue;
          if (indentOf(lines[j]) <= baseIndent) break;
          parts.push(lines[j].trim());
        }
        jobs[currentJob].runs.push(parts.join(' '));
        i = j - 1;
      } else {
        jobs[currentJob].runs.push(value);
      }
    }
  }

  return { jobs };
}

function runCommands(job) {
  assert.ok(job, 'expected the workflow job to exist');
  return job.runs;
}

function assertOrderedSubsequence(jobName, workflow, expected) {
  assert.ok(workflow.jobs[jobName], `${jobName} job must exist`);
  const actual = runCommands(workflow.jobs[jobName]);
  let cursor = 0;
  for (const required of expected) {
    const at = actual.indexOf(required, cursor);
    assert.notEqual(
      at,
      -1,
      `в джобе ${jobName} нет обязательного шага "${required}" после уже ` +
        'найденных — либо он пропал, либо уехал вверх по списку. ' +
        `Фактический список: ${JSON.stringify(actual, null, 2)}`,
    );
    cursor = at + 1;
  }
}

test('adds an isolated Satin gate wired into deploy (Bloom job absent in this lineage)', () => {
  const workflow = loadWorkflow('.github/workflows/ci.yml');

  // Раньше здесь стояло точное равенство со списком `expectedSatinCommands`
  // внутри ОДНОЙ джобы satin-structural-conformance. Из-за точного равенства
  // гард краснел на КАЖДОМ добавлении проверки в джобу — а проверки в неё
  // добавляют постоянно, это её назначение. В итоге файл выкинули из CI, и он
  // перестал сторожить хоть что-нибудь (замер 13.09: в джобе 14 шагов,
  // которых нет в списке). Поэтому сверяем не полное равенство, а
  // ПОДПОСЛЕДОВАТЕЛЬНОСТЬ: все обязательные команды на месте и идут в
  // заданном порядке, а новые шаги между ними разрешены.
  //
  // b51-ci-speed2: сборка и дословный конформанс-хвост разъехались по ДВУМ
  // джобам (satin-build, satin-dictated-conformance) — команды и их
  // относительный порядок те же, что были в едином списке, граница ровно там,
  // где заканчивается сборка и начинается test:conformance:shared. Это НЕ
  // ослабление: гард по-прежнему падает на пропавшем, переименованном или
  // переставленном шаге — только теперь смотрит на два места вместо одного,
  // и ДОПОЛНИТЕЛЬНО проверяет, что обе джобы реально ждут sat­in-build через
  // `needs`, иначе гарды могли бы начать читать dist до того, как он собран.
  assertOrderedSubsequence('satin-build', workflow, expectedSatinBuildCommands);
  assertOrderedSubsequence('satin-dictated-conformance', workflow, expectedSatinDictatedCommands);
  assert.ok(workflow.jobs['satin-structural-conformance'], 'satin-structural-conformance job must exist');

  assert.deepEqual(
    workflow.jobs['satin-structural-conformance'].needs,
    ['satin-build'],
    'satin-structural-conformance must wait for satin-build (dist/ artifact) before running',
  );
  assert.deepEqual(
    workflow.jobs['satin-dictated-conformance'].needs,
    ['satin-build'],
    'satin-dictated-conformance must wait for satin-build (dist/ artifact) before running',
  );

  // Adaptation for this Satin-independent lineage: no Bloom CI job was landed
  // here, so the byte-for-byte `bloom-structural-commands.json` fixture is
  // intentionally absent and this assertion documents that contract. When a
  // `bloom-structural-conformance` job is later added (Bloom Tasks 8-10), this
  // assertion must flip to a fixture comparison AND the job must be inserted
  // into `deploy-to-coolify.needs` before `satin-structural-conformance`.
  assert.equal(
    workflow.jobs['bloom-structural-conformance'],
    undefined,
    'no bloom-structural-conformance job exists in this lineage yet; adding one ' +
      'requires pinning its run list via a real fixture and inserting it into ' +
      'deploy-to-coolify.needs before satin-structural-conformance',
  );

  // Deploy depends on the base build and BOTH Satin gate jobs (b51-ci-speed2
  // split the old single gate into satin-build + satin-structural-conformance
  // + satin-dictated-conformance — deploy must wait for all three, not just
  // the matrix job, or a red dictated-conformance job would ship anyway).
  assert.deepEqual(workflow.jobs['deploy-to-coolify'].needs, [
    'build-and-test',
    'satin-build',
    'satin-structural-conformance',
    'satin-dictated-conformance',
  ]);
});

test('Satin owns exactly the eight real-artifact tests and no conformance-satin-* files', () => {
  const names = readdirSync(path.join(REPO_ROOT, 'src/themes/__tests__'));
  assert.deepEqual(
    names.filter((name) => name.startsWith('satin-conformance-') && name.endsWith('.spec.ts')).sort(),
    satinTestFiles,
  );
  assert.equal(
    names.some((name) => name.startsWith('conformance-satin-')),
    false,
  );
});
