// Task 0 — Docker dependency-layer topology.
//
// The root Docker build historically copied ONLY root package.json/lock before
// `pnpm install`, so local/CI (which has the whole tree) built fine but the
// Coolify image lacked package-local Zod/workspace links: a clean install
// without pnpm-workspace.yaml + the three package manifests never creates the
// theme-contract/theme-base/theme-bloom importers, so theme-contract resolves
// root Zod 4 instead of its own Zod 3 (F-044/F-046).
//
// This test asserts the BUILDER-stage dependency layer copies
// pnpm-workspace.yaml AND the four workspace package manifests BEFORE the
// first `pnpm install`, and that this install is now `--frozen-lockfile`
// (all workspace importers are locked). The multi-stage flow and cache
// boundary are preserved elsewhere; we only pin the dependency layer here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DOCKERFILE = path.join(REPO_ROOT, 'Dockerfile');

/** The manifests whose presence at install time creates the locked importers. */
const REQUIRED_MANIFESTS = [
  'packages/theme-contract/package.json',
  'packages/theme-base/package.json',
  'packages/theme-bloom/package.json',
  'packages/theme-satin/package.json',
];

function readDockerfile() {
  return readFileSync(DOCKERFILE, 'utf-8');
}

/**
 * Index (char offset) of the FIRST builder-stage `pnpm install`. We anchor on
 * the frozen install so the assertions describe the post-Task-0 contract; if
 * the install is not frozen this returns -1 and the dedicated test fails.
 */
function firstFrozenInstallIndex(text) {
  const m = text.match(/RUN\s+pnpm\s+install\s+--frozen-lockfile\b/);
  return m ? m.index : -1;
}

test('builder installs with --frozen-lockfile (all workspace importers locked)', () => {
  const text = readDockerfile();
  assert.match(
    text,
    /RUN\s+pnpm\s+install\s+--frozen-lockfile\b/,
    'expected the builder dependency layer to run `pnpm install --frozen-lockfile`',
  );
  // Guard against the old non-frozen install lingering as the FIRST install.
  const bareInstall = text.match(/RUN\s+pnpm\s+install\s*(?:\n|$)/);
  const frozenIdx = firstFrozenInstallIndex(text);
  if (bareInstall) {
    assert.ok(
      bareInstall.index > frozenIdx && frozenIdx !== -1,
      'a bare `RUN pnpm install` must not precede the frozen install',
    );
  }
});

test('COPY pnpm-workspace.yaml precedes the first frozen install', () => {
  const text = readDockerfile();
  const installIdx = firstFrozenInstallIndex(text);
  assert.ok(installIdx !== -1, 'no `pnpm install --frozen-lockfile` found');

  const wsIdx = text.indexOf('pnpm-workspace.yaml');
  assert.ok(
    wsIdx !== -1,
    'Dockerfile must COPY pnpm-workspace.yaml into the dependency layer',
  );
  assert.ok(
    wsIdx < installIdx,
    'pnpm-workspace.yaml must be COPYed BEFORE `pnpm install --frozen-lockfile`',
  );
});

test('each of the four workspace package manifests is COPYed before the frozen install', () => {
  const text = readDockerfile();
  const installIdx = firstFrozenInstallIndex(text);
  assert.ok(installIdx !== -1, 'no `pnpm install --frozen-lockfile` found');

  const preInstall = text.slice(0, installIdx);
  for (const manifest of REQUIRED_MANIFESTS) {
    assert.ok(
      preInstall.includes(manifest),
      `dependency layer must COPY ${manifest} before the frozen install`,
    );
  }
});

test('the dependency layer still copies root manifest + lock + .npmrc (cache boundary preserved)', () => {
  const text = readDockerfile();
  const installIdx = firstFrozenInstallIndex(text);
  const preInstall = text.slice(0, installIdx);
  for (const f of ['package.json', 'pnpm-lock.yaml', '.npmrc']) {
    assert.ok(
      preInstall.includes(f),
      `dependency layer must still COPY ${f} before install`,
    );
  }
});

test('full source `COPY . .` still happens AFTER the dependency install (multi-stage flow preserved)', () => {
  const text = readDockerfile();
  const installIdx = firstFrozenInstallIndex(text);
  const copyAll = text.match(/^COPY\s+\.\s+\.\s*$/m);
  assert.ok(copyAll, 'expected a full `COPY . .` in the builder stage');
  assert.ok(
    copyAll.index > installIdx,
    '`COPY . .` must come after the frozen dependency install',
  );
});

test('the four referenced package manifests actually exist on disk', () => {
  for (const manifest of REQUIRED_MANIFESTS) {
    const abs = path.join(REPO_ROOT, manifest);
    assert.doesNotThrow(
      () => readFileSync(abs, 'utf-8'),
      `${manifest} must exist so the Docker COPY does not break the build`,
    );
  }
});
