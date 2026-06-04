// Тесты модулей приёмки
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkClassesPreserved,
  checkTokensApplied,
  checkPseudoStates,
  checkHtmlStructure,
  extractAllClasses,
  collectAllClassLiterals,
} from '../lib/validation-checks.mjs';

// ───────── extractAllClasses ─────────
test('extractAllClasses: извлекает классы из всех элементов', () => {
  const html = `<div class="a b"><span class="c">x</span></div>`;
  const r = extractAllClasses(html);
  assert.equal(r.size, 3);
  assert.ok(r.has('a'));
  assert.ok(r.has('b'));
  assert.ok(r.has('c'));
});

test('extractAllClasses: пустой HTML → пустой набор', () => {
  const r = extractAllClasses(`<div></div>`);
  assert.equal(r.size, 0);
});

test('extractAllClasses: пустые классы игнорируются', () => {
  const r = extractAllClasses(`<div class="">x</div>`);
  assert.equal(r.size, 0);
});

// ───────── checkClassesPreserved ─────────
test('checkClassesPreserved: одинаковые → ok', () => {
  const html = `<div class="a b">x</div>`;
  const r = checkClassesPreserved(html, html);
  assert.equal(r.ok, true);
});

test('checkClassesPreserved: класс потерян → не ok', () => {
  const before = `<div class="a b c">x</div>`;
  const after = `<div class="a b">x</div>`;
  const r = checkClassesPreserved(before, after);
  assert.equal(r.ok, false);
  assert.deepEqual(r.lost, ['c']);
});

test('checkClassesPreserved: добавление класса в after — ок', () => {
  const before = `<div class="a">x</div>`;
  const after = `<div class="a b">x</div>`;
  const r = checkClassesPreserved(before, after);
  assert.equal(r.ok, true);
});

test('checkClassesPreserved: возвращает счётчики', () => {
  const r = checkClassesPreserved(
    `<div class="a b c">x</div>`,
    `<div class="a b">x</div>`,
  );
  assert.equal(r.beforeCount, 3);
  assert.equal(r.afterCount, 2);
});

// ───────── checkTokensApplied ─────────
const BASE_CLASSES_TEXT = `
export const HeaderClasses = {
  wrapper: 'w-full max-w-[var(--header-x)] bg-[var(--header-y)]',
  nav: 'p-[var(--header-z)]',
} as const;
`;
const THEME_JSON_TEXT = JSON.stringify({
  defaults: {
    '--header-x': '1920px',
  },
});
const BASE_DEFAULTS_TEXT = `
export const BASE_DEFAULTS = {
  '--header-y': '#fff',
};
`;

test('checkTokensApplied: все определены — ok', () => {
  const r = checkTokensApplied(
    BASE_CLASSES_TEXT,
    'HeaderClasses',
    THEME_JSON_TEXT,
    BASE_DEFAULTS_TEXT + `\nexport const X = { '--header-z': '0' };\n`,
  );
  assert.equal(r.totalTokens, 3);
});

test('checkTokensApplied: токен не определён', () => {
  const r = checkTokensApplied(
    BASE_CLASSES_TEXT,
    'HeaderClasses',
    THEME_JSON_TEXT,
    `export const X = {};`,
  );
  assert.ok(r.undefined.includes('--header-z') || r.undefined.includes('--header-y'));
  assert.equal(r.ok, false);
});

test('checkTokensApplied: var с fallback внутри ([var(--x,1px)])', () => {
  const text = `export const HeaderClasses = {
    wrapper: 'max-w-[var(--container-max-width,1320px)]',
  } as const;`;
  const r = checkTokensApplied(text, 'HeaderClasses', `{}`, `'--container-max-width': '1320px'`);
  assert.ok(r.totalTokens >= 1);
});

// ───────── collectAllClassLiterals ─────────
test('collectAllClassLiterals: класс из class=', () => {
  const r = collectAllClassLiterals(`<div class="a b">x</div>`);
  assert.ok(r.includes('a b'));
});

test('collectAllClassLiterals: класс из class:list', () => {
  const r = collectAllClassLiterals(`<div class:list={['a b', cond && 'c']}>x</div>`);
  assert.ok(r.includes('a b'));
});

test('collectAllClassLiterals: оба варианта', () => {
  const r = collectAllClassLiterals(`<div class="x"><div class:list={['a b']}>x</div></div>`);
  assert.ok(r.includes('x'));
  assert.ok(r.includes('a b'));
});

// ───────── checkPseudoStates ─────────
test('checkPseudoStates: hover есть в обоих', () => {
  const source = `<a class="text-black hover:text-red-500">x</a>`;
  const base = `export const HeaderClasses = {
    link: 'text-black hover:text-red-500',
  } as const;`;
  const r = checkPseudoStates(source, base, 'HeaderClasses');
  assert.equal(r.ok, true);
});

test('checkPseudoStates: hover потерян', () => {
  const source = `<a class="text-black hover:text-red-500">x</a>`;
  const base = `export const HeaderClasses = {
    link: 'text-black',
  } as const;`;
  const r = checkPseudoStates(source, base, 'HeaderClasses');
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('hover:text-red-500'));
});

test('checkPseudoStates: focus в источнике, hover в базе → focus отсутствует', () => {
  const source = `<a class="focus:bg-blue-500">x</a>`;
  const base = `export const HeaderClasses = {
    link: 'hover:bg-blue-500',
  } as const;`;
  const r = checkPseudoStates(source, base, 'HeaderClasses');
  assert.equal(r.ok, false);
});

// Корневая задача rose Footer: active:scale-95 в источнике покрыт
// active:[transform:var(--token)] в базе (т.к. оба классифицируются как
// transform/active/null).
test('checkPseudoStates: active:scale-95 покрыт active:[transform:var(...)]', () => {
  const source = `<button class="active:scale-95">x</button>`;
  const base = `export const FooterClasses = {
    submit: 'flex active:[transform:var(--footer-newsletter-submit-transform-active)]',
  } as const;`;
  const r = checkPseudoStates(source, base, 'FooterClasses');
  assert.equal(r.ok, true, `active:scale-95 должен считаться покрытым; missing=${JSON.stringify(r.missing)}`);
});

test('checkPseudoStates: hover:scale-105 покрыт hover:[transform:var(...)]', () => {
  const source = `<div class="hover:scale-105">x</div>`;
  const base = `export const CardClasses = {
    root: 'hover:[transform:var(--card-transform-hover)]',
  } as const;`;
  const r = checkPseudoStates(source, base, 'CardClasses');
  assert.equal(r.ok, true);
});

test('checkPseudoStates: active:scale-95 НЕ покрыт другим transform-состоянием', () => {
  // Если в base только hover:transform — active не покрыт
  const source = `<button class="active:scale-95">x</button>`;
  const base = `export const FooterClasses = {
    submit: 'hover:[transform:var(--card-hover)]',
  } as const;`;
  const r = checkPseudoStates(source, base, 'FooterClasses');
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('active:scale-95'));
});

// ───────── checkHtmlStructure ─────────
test('checkHtmlStructure: одинаковые → ok', () => {
  const html = `<div><span>x</span></div>`;
  const r = checkHtmlStructure(html, html);
  assert.equal(r.ok, true);
});

test('checkHtmlStructure: меньше элементов → не ok', () => {
  const before = `<div><span>x</span></div>`;
  const after = `<div></div>`;
  const r = checkHtmlStructure(before, after);
  assert.equal(r.ok, false);
});

test('checkHtmlStructure: разные id → не ok', () => {
  const before = `<div id="foo">x</div>`;
  const after = `<div id="bar">x</div>`;
  const r = checkHtmlStructure(before, after);
  assert.equal(r.ok, false);
});

test('checkHtmlStructure: разные data-attrs → не ok', () => {
  const before = `<div data-foo="1">x</div>`;
  const after = `<div data-bar="1">x</div>`;
  const r = checkHtmlStructure(before, after);
  assert.equal(r.ok, false);
});

test('checkHtmlStructure: classes игнорируются', () => {
  const before = `<div class="a"><span>x</span></div>`;
  const after = `<div class="z y x"><span>x</span></div>`;
  const r = checkHtmlStructure(before, after);
  assert.equal(r.ok, true);
});
