import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isThemePackage,
  blockSourceRoot,
  customBlockSourceRoot,
  flatArtifactName,
  flatIndexArtifactName,
  blockArtifactBaseName,
  BLOCK_LOCATIONS,
} from '../lib/block-source-layout.mjs';

// These tests pin the CURRENT behavior of compile-astro-blocks.mjs so the
// extraction into block-source-layout.mjs stays byte-identical. The compiler
// must consume these helpers.

test('isThemePackage: only theme-* packages are compiled', () => {
  assert.equal(isThemePackage('theme-base'), true);
  assert.equal(isThemePackage('theme-rose'), true);
  assert.equal(isThemePackage('theme-bloom'), true);
  assert.equal(isThemePackage('theme-vanilla'), true);
  assert.equal(isThemePackage('theme-satin'), true);
  assert.equal(isThemePackage('theme-flux'), true);
  assert.equal(isThemePackage('some-other'), false);
  assert.equal(isThemePackage('themes'), false);
  assert.equal(isThemePackage(''), false);
});

test('blockSourceRoot: theme-owned blocks live under <pkg>/blocks', () => {
  assert.equal(blockSourceRoot('/repo', 'theme-bloom'), '/repo/packages/theme-bloom/blocks');
  assert.equal(blockSourceRoot('/x', 'theme-base'), '/x/packages/theme-base/blocks');
});

test('customBlockSourceRoot: canonical customBlocks/ root (distinct from blocks/)', () => {
  assert.equal(
    customBlockSourceRoot('/repo', 'theme-bloom'),
    '/repo/packages/theme-bloom/customBlocks',
  );
  assert.notEqual(
    customBlockSourceRoot('/repo', 'theme-bloom'),
    blockSourceRoot('/repo', 'theme-bloom'),
  );
});

test('flatArtifactName: <pkg>__<blockName>__<baseName>.mjs', () => {
  assert.equal(
    flatArtifactName('theme-base', 'Hero', 'Hero'),
    'theme-base__Hero__Hero.mjs',
  );
  assert.equal(
    flatArtifactName('theme-base', 'Hero', 'Hero.classes'),
    'theme-base__Hero__Hero.classes.mjs',
  );
  assert.equal(
    flatArtifactName('theme-bloom', 'Benefits', 'Benefits'),
    'theme-bloom__Benefits__Benefits.mjs',
  );
});

test('flatIndexArtifactName: <pkg>__<blockName>__index.mjs (loader entrypoint)', () => {
  assert.equal(
    flatIndexArtifactName('theme-base', 'Hero'),
    'theme-base__Hero__index.mjs',
  );
  assert.equal(
    flatIndexArtifactName('theme-bloom', 'Benefits'),
    'theme-bloom__Benefits__index.mjs',
  );
});

test('blockArtifactBaseName: strips .astro / .ts extension', () => {
  assert.equal(blockArtifactBaseName('Hero.astro'), 'Hero');
  assert.equal(blockArtifactBaseName('Hero.classes.ts'), 'Hero.classes');
  assert.equal(blockArtifactBaseName('index.ts'), 'index');
});

test('BLOCK_LOCATIONS: canonical location keys blocks + customBlocks', () => {
  assert.deepEqual([...BLOCK_LOCATIONS].sort(), ['blocks', 'customBlocks']);
});

test('parity: index artifact name equals flatArtifactName with index base', () => {
  // The ts-only compile path emits <pkg>__<blockName>__index.mjs; prove the two
  // helpers agree so the compiler can use either.
  assert.equal(
    flatIndexArtifactName('theme-satin', 'Header'),
    flatArtifactName('theme-satin', 'Header', 'index'),
  );
});
