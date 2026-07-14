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
// Everything else follows the reviewed Task 6 spec: the Satin gate is a
// self-contained job with an exact ordered `run` command list, deploy depends
// on the Satin gate, and `src/themes/__tests__` owns exactly the eight
// `satin-conformance-*` real-artifact tests with no `conformance-satin-*`
// counterparts.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const expectedSatinCommands = [
  'corepack prepare pnpm@10.14.0 --activate',
  'pnpm install --frozen-lockfile',
  'pnpm build',
  'pnpm build:blocks',
  'pnpm build:theme-sections satin',
  'pnpm exec tsx scripts/run-theme-build.ts satin',
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

    // Ordered `run:` scalars inside `steps:`. Handles `- run: <cmd>` and a
    // `run: <cmd>` continuation line of a `- name:`/`- uses:` step. Only
    // single-line run scalars appear in this workflow's conformance jobs.
    const runMatch = line.match(/^\s*-?\s*run:\s*(.+)$/);
    if (runMatch) {
      jobs[currentJob].runs.push(runMatch[1].trim());
    }
  }

  return { jobs };
}

function runCommands(job) {
  assert.ok(job, 'expected the workflow job to exist');
  return job.runs;
}

test('adds an isolated Satin gate wired into deploy (Bloom job absent in this lineage)', () => {
  const workflow = loadWorkflow('.github/workflows/ci.yml');

  // The Satin gate exists and runs EXACTLY the ordered command list.
  assert.ok(
    workflow.jobs['satin-structural-conformance'],
    'satin-structural-conformance job must exist',
  );
  assert.deepEqual(
    runCommands(workflow.jobs['satin-structural-conformance']),
    expectedSatinCommands,
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

  // Deploy depends on the base build and the Satin gate. If/when the Bloom job
  // lands, the expected list becomes
  // ['build-and-test','bloom-structural-conformance','satin-structural-conformance'].
  assert.deepEqual(workflow.jobs['deploy-to-coolify'].needs, [
    'build-and-test',
    'satin-structural-conformance',
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
