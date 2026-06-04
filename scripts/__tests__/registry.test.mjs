// Тесты регистрации pre-existing глобальных CSS-токенов.
//
// Покрывает 4 токена, которые исторически использовались в theme-base/blocks/
// без декларации в TOKEN_REGISTRY и BASE_DEFAULTS:
//
//   --hero-heading-size       (Hero.classes.ts:47 + Hero.astro:89 inline)
//   --color-button-bg-hover   (Hero, MultiColumns, Newsletter, ContactForm, ...)
//   --color-button-text-hover (пара к bg-hover)
//   --font-pagination         (Hero.classes.ts:88 paginationButton)
//
// Парсим registry.ts / base-defaults.ts через TS AST — тесты получают
// подлинные значения как их видит компилятор, без regex-подгонок.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(
  __dirname,
  '../../packages/theme-contract/tokens/registry.ts'
);
const DEFAULTS_PATH = path.resolve(
  __dirname,
  '../../packages/theme-contract/tokens/base-defaults.ts'
);

// ───────── helpers ─────────

/** Извлечь объектный литерал по имени переменной (TOKEN_REGISTRY / BASE_DEFAULTS). */
function findObjectLiteral(sourceText, varName) {
  const sf = ts.createSourceFile(
    `${varName}.ts`,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let result = null;
  function walk(node) {
    if (result) return;
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === varName &&
          d.initializer
        ) {
          let init = d.initializer;
          while (
            ts.isAsExpression(init) ||
            ts.isSatisfiesExpression?.(init)
          ) {
            init = init.expression;
          }
          if (ts.isObjectLiteralExpression(init)) result = init;
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return result;
}

/** Map<tokenName, metaObject> где meta = { category, scope, unit?, ... } */
function parseRegistry(sourceText) {
  const obj = findObjectLiteral(sourceText, 'TOKEN_REGISTRY');
  if (!obj) throw new Error('TOKEN_REGISTRY not found');
  const map = new Map();
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isStringLiteral(prop.name)
      ? prop.name.text
      : ts.isIdentifier(prop.name)
        ? prop.name.text
        : null;
    if (!key) continue;
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
    const meta = {};
    for (const m of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(m)) continue;
      const k = ts.isIdentifier(m.name) ? m.name.text : null;
      if (!k) continue;
      if (ts.isStringLiteral(m.initializer)) meta[k] = m.initializer.text;
      else if (ts.isNumericLiteral(m.initializer))
        meta[k] = Number(m.initializer.text);
      else if (ts.isArrayLiteralExpression(m.initializer)) {
        meta[k] = m.initializer.elements
          .filter(ts.isStringLiteral)
          .map((e) => e.text);
      }
    }
    map.set(key, meta);
  }
  return map;
}

/** Map<tokenName, stringValue> для BASE_DEFAULTS. */
function parseDefaults(sourceText) {
  const obj = findObjectLiteral(sourceText, 'BASE_DEFAULTS');
  if (!obj) throw new Error('BASE_DEFAULTS not found');
  const map = new Map();
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isStringLiteral(prop.name)
      ? prop.name.text
      : ts.isIdentifier(prop.name)
        ? prop.name.text
        : null;
    if (!key) continue;
    if (ts.isStringLiteral(prop.initializer))
      map.set(key, prop.initializer.text);
  }
  return map;
}

// ───────── загрузка один раз ─────────

const registryText = await fs.readFile(REGISTRY_PATH, 'utf8');
const defaultsText = await fs.readFile(DEFAULTS_PATH, 'utf8');
const registry = parseRegistry(registryText);
const defaults = parseDefaults(defaultsText);

// ───────── --hero-heading-size ─────────

test('registry: --hero-heading-size зарегистрирован', () => {
  const meta = registry.get('--hero-heading-size');
  assert.ok(meta, '--hero-heading-size must be in TOKEN_REGISTRY');
  assert.equal(meta.category, 'size');
  assert.equal(meta.scope, 'theme');
});

test('base-defaults: --hero-heading-size имеет fallback (пустой = наследует --size-hero-heading)', () => {
  assert.ok(
    defaults.has('--hero-heading-size'),
    '--hero-heading-size must be in BASE_DEFAULTS'
  );
  // Пустая строка — допустимый «нет override» паттерн (как --color-header-bg).
  // Hero.classes.ts читает через text-[length:var(--hero-heading-size,var(--size-hero-heading))],
  // так что fallback идёт на --size-hero-heading при пустом значении.
  const v = defaults.get('--hero-heading-size');
  assert.equal(typeof v, 'string');
});

// ───────── --color-button-bg-hover ─────────

test('registry: --color-button-bg-hover зарегистрирован как color/scheme', () => {
  const meta = registry.get('--color-button-bg-hover');
  assert.ok(meta, '--color-button-bg-hover must be in TOKEN_REGISTRY');
  assert.equal(meta.category, 'color');
  assert.equal(meta.scope, 'scheme');
});

test('base-defaults: --color-button-bg-hover имеет RGB-триплет (hover = text color)', () => {
  const v = defaults.get('--color-button-bg-hover');
  assert.ok(v, '--color-button-bg-hover must be in BASE_DEFAULTS');
  // По соглашению hover-фон = цвет текста (контраст с обычным состоянием).
  // --color-text default = '51 51 51' → ожидаем такой же триплет.
  assert.match(v, /^\d+ \d+ \d+$/, 'must be space-separated RGB triplet');
});

// ───────── --color-button-text-hover ─────────

test('registry: --color-button-text-hover зарегистрирован как color/scheme', () => {
  const meta = registry.get('--color-button-text-hover');
  assert.ok(meta, '--color-button-text-hover must be in TOKEN_REGISTRY');
  assert.equal(meta.category, 'color');
  assert.equal(meta.scope, 'scheme');
});

test('base-defaults: --color-button-text-hover имеет RGB-триплет (hover text = bg color)', () => {
  const v = defaults.get('--color-button-text-hover');
  assert.ok(v, '--color-button-text-hover must be in BASE_DEFAULTS');
  assert.match(v, /^\d+ \d+ \d+$/, 'must be space-separated RGB triplet');
});

// ───────── --font-pagination ─────────

test('registry: --font-pagination зарегистрирован как font/theme', () => {
  const meta = registry.get('--font-pagination');
  assert.ok(meta, '--font-pagination must be in TOKEN_REGISTRY');
  assert.equal(meta.category, 'font');
  assert.equal(meta.scope, 'theme');
});

test('base-defaults: --font-pagination имеет fallback font-family', () => {
  const v = defaults.get('--font-pagination');
  assert.ok(v, '--font-pagination must be in BASE_DEFAULTS');
  // Допускаем 'system-ui, sans-serif' (наследование) или явный шрифт.
  assert.ok(v.length > 0, 'must be non-empty font-family');
});

// ───────── консистентность registry ↔ defaults ─────────

test('registry/defaults parity: 4 pre-existing токена покрыты с обеих сторон', () => {
  const required = [
    '--hero-heading-size',
    '--color-button-bg-hover',
    '--color-button-text-hover',
    '--font-pagination',
  ];
  for (const t of required) {
    assert.ok(registry.has(t), `${t} missing in TOKEN_REGISTRY`);
    assert.ok(defaults.has(t), `${t} missing in BASE_DEFAULTS`);
  }
});
