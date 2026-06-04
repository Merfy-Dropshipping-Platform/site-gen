// Тесты модулей миграции (registry/defaults/theme.json edits)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addTokensToRegistry,
  addDefaultsToBaseDefaults,
  addTokensToThemeJson,
} from '../lib/registry-edit.mjs';

const REGISTRY_SAMPLE = `export interface TokenMeta { category: string; }
export const TOKEN_REGISTRY = {
  '--color-bg': { category: 'color', scope: 'scheme' },
  '--container-max-width': { category: 'size', unit: 'px', scope: 'theme' },
} as const satisfies Record<string, TokenMeta>;
`;

// ───────── addTokensToRegistry ─────────
test('addTokensToRegistry: добавляет новый токен', () => {
  const r = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--header-nav-max-width-2xl', category: 'size', unit: 'px', scope: 'theme' },
  ]);
  assert.equal(r.addedCount, 1);
  assert.match(r.text, /--header-nav-max-width-2xl/);
});

test('addTokensToRegistry: не дублирует существующие', () => {
  const r = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--color-bg', category: 'color', scope: 'scheme' },
  ]);
  assert.equal(r.addedCount, 0);
  assert.equal(r.text, REGISTRY_SAMPLE);
});

test('addTokensToRegistry: смешано — новый + существующий', () => {
  const r = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--color-bg', category: 'color', scope: 'scheme' },
    { name: '--header-x', category: 'size', scope: 'theme' },
  ]);
  assert.equal(r.addedCount, 1);
  assert.match(r.text, /--header-x/);
});

test('addTokensToRegistry: формат записи { category, scope }', () => {
  const r = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--abc', category: 'size', unit: 'px', scope: 'theme' },
  ]);
  assert.match(r.text, /'--abc':\s*\{[^}]*category:\s*'size'[^}]*scope:\s*'theme'[^}]*\}/);
});

test('addTokensToRegistry: добавляет min/max если указаны', () => {
  const r = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--abc', category: 'size', unit: 'px', scope: 'theme', min: 0, max: 100 },
  ]);
  assert.match(r.text, /min:\s*0/);
  assert.match(r.text, /max:\s*100/);
});

test('addTokensToRegistry: идемпотентность', () => {
  const r1 = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--xxx', category: 'size', scope: 'theme' },
  ]);
  const r2 = addTokensToRegistry(r1.text, [
    { name: '--xxx', category: 'size', scope: 'theme' },
  ]);
  assert.equal(r2.addedCount, 0);
  assert.equal(r1.text, r2.text);
});

test('addTokensToRegistry: ошибка если нет TOKEN_REGISTRY', () => {
  assert.throws(() => addTokensToRegistry(`export const Other = {};`, []), /TOKEN_REGISTRY/);
});

// ───────── addDefaultsToBaseDefaults ─────────
const DEFAULTS_SAMPLE = `import type { TokenKey } from './registry';

export const BASE_DEFAULTS: Record<TokenKey, string> = {
  '--color-bg': '255 255 255',
  '--container-max-width': '1320px',
};
`;

test('addDefaultsToBaseDefaults: добавляет новое значение', () => {
  const r = addDefaultsToBaseDefaults(DEFAULTS_SAMPLE, [
    { name: '--header-x', value: '1920px' },
  ]);
  assert.equal(r.addedCount, 1);
  assert.match(r.text, /'--header-x':\s*'1920px'/);
});

test('addDefaultsToBaseDefaults: не дублирует', () => {
  const r = addDefaultsToBaseDefaults(DEFAULTS_SAMPLE, [
    { name: '--color-bg', value: 'NEW' },
  ]);
  assert.equal(r.addedCount, 0);
});

test('addDefaultsToBaseDefaults: экранирует кавычки', () => {
  const r = addDefaultsToBaseDefaults(DEFAULTS_SAMPLE, [
    { name: '--font-x', value: `'X', sans-serif` },
  ]);
  // ' экранированы как \'
  assert.match(r.text, /\\'X\\'/);
});

test('addDefaultsToBaseDefaults: идемпотентность', () => {
  const r1 = addDefaultsToBaseDefaults(DEFAULTS_SAMPLE, [{ name: '--y', value: '1px' }]);
  const r2 = addDefaultsToBaseDefaults(r1.text, [{ name: '--y', value: '1px' }]);
  assert.equal(r2.addedCount, 0);
  assert.equal(r1.text, r2.text);
});

// ───────── addTokensToThemeJson ─────────
const THEME_JSON_SAMPLE = JSON.stringify({
  id: 'rose',
  defaults: {
    '--font-heading': "'X', sans-serif",
    '--radius-button': '6px',
  },
  colorSchemes: [{ id: 'scheme-1', tokens: {} }],
}, null, 2);

test('addTokensToThemeJson: добавляет новое значение', () => {
  const r = addTokensToThemeJson(THEME_JSON_SAMPLE, [
    { name: '--header-nav-max-width-2xl', value: '1920px' },
  ]);
  assert.equal(r.addedCount, 1);
  const obj = JSON.parse(r.text);
  assert.equal(obj.defaults['--header-nav-max-width-2xl'], '1920px');
});

test('addTokensToThemeJson: обновляет существующее', () => {
  const r = addTokensToThemeJson(THEME_JSON_SAMPLE, [
    { name: '--radius-button', value: '12px' },
  ]);
  const obj = JSON.parse(r.text);
  assert.equal(obj.defaults['--radius-button'], '12px');
});

test('addTokensToThemeJson: сохраняет другие поля', () => {
  const r = addTokensToThemeJson(THEME_JSON_SAMPLE, [
    { name: '--new', value: '1' },
  ]);
  const obj = JSON.parse(r.text);
  assert.equal(obj.id, 'rose');
  assert.ok(Array.isArray(obj.colorSchemes));
});

test('addTokensToThemeJson: создаёт defaults если нет', () => {
  const src = JSON.stringify({ id: 'x' });
  const r = addTokensToThemeJson(src, [{ name: '--a', value: '1' }]);
  const obj = JSON.parse(r.text);
  assert.equal(obj.defaults['--a'], '1');
});

test('addTokensToThemeJson: вывод оканчивается \\n', () => {
  const r = addTokensToThemeJson(THEME_JSON_SAMPLE, [{ name: '--x', value: 'y' }]);
  assert.equal(r.text[r.text.length - 1], '\n');
});

// ───────── вспомогательные ─────────
test('addTokensToRegistry: подключает несколько разом в одной вставке', () => {
  const r = addTokensToRegistry(REGISTRY_SAMPLE, [
    { name: '--a', category: 'size', scope: 'theme' },
    { name: '--b', category: 'color', scope: 'scheme' },
    { name: '--c', category: 'spacing', unit: 'px', scope: 'theme' },
  ]);
  assert.equal(r.addedCount, 3);
  assert.match(r.text, /--a/);
  assert.match(r.text, /--b/);
  assert.match(r.text, /--c/);
});

test('addDefaultsToBaseDefaults: подключает несколько разом', () => {
  const r = addDefaultsToBaseDefaults(DEFAULTS_SAMPLE, [
    { name: '--a', value: 'a' },
    { name: '--b', value: 'b' },
  ]);
  assert.equal(r.addedCount, 2);
});

test('addTokensToThemeJson: множество значений в одной операции', () => {
  const r = addTokensToThemeJson(THEME_JSON_SAMPLE, [
    { name: '--a', value: '1' },
    { name: '--b', value: '2' },
    { name: '--c', value: '3' },
  ]);
  const obj = JSON.parse(r.text);
  assert.equal(obj.defaults['--a'], '1');
  assert.equal(obj.defaults['--b'], '2');
  assert.equal(obj.defaults['--c'], '3');
});
