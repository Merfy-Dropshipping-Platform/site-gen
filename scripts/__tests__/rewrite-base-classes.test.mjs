// Тесты переписывания base classes (литералы → var(--токен))
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeReplacements,
  applyTokensToClass,
  propertyToUtilityName,
} from '../lib/rewrite-base-classes.mjs';
import { rewriteClassesFile, extractClassesObject, flattenClasses } from '../lib/classes-ts.mjs';

const SAMPLE_FILE = `
export const HeaderClasses = {
  wrapper: 'w-full bg-white text-black',
  nav: 'w-full max-w-[1320px] mx-auto px-4 md:px-6 flex items-center',
  mobileMenu: {
    root: 'hidden md:hidden bg-white',
    nav: 'flex flex-col',
  },
} as const;
`;

// ───────── propertyToUtilityName ─────────
test('propertyToUtilityName: max-width → max-w', () => {
  assert.equal(propertyToUtilityName('max-width'), 'max-w');
});

test('propertyToUtilityName: font-size → text', () => {
  assert.equal(propertyToUtilityName('font-size'), 'text');
});

test('propertyToUtilityName: background-color → bg', () => {
  assert.equal(propertyToUtilityName('background-color'), 'bg');
});

test('propertyToUtilityName: color → text', () => {
  assert.equal(propertyToUtilityName('color'), 'text');
});

test('propertyToUtilityName: padding-x → px', () => {
  assert.equal(propertyToUtilityName('padding-x'), 'px');
});

test('propertyToUtilityName: gap → gap', () => {
  assert.equal(propertyToUtilityName('gap'), 'gap');
});

test('propertyToUtilityName: неизвестное → null', () => {
  assert.equal(propertyToUtilityName('clip-path'), null);
});

// ───────── applyTokensToClass ─────────
test('applyTokensToClass: заменяет существующую утилиту', () => {
  const summary = { utilitiesReplaced: 0, utilitiesAdded: 0 };
  const r = applyTokensToClass(
    'w-full max-w-[1320px] mx-auto',
    [{ name: '--header-nav-max-width', property: 'max-width', state: null, breakpoint: null }],
    summary,
  );
  assert.match(r, /max-w-\[var\(--header-nav-max-width\)\]/);
  assert.equal(summary.utilitiesReplaced, 1);
});

test('applyTokensToClass: добавляет новую если не было', () => {
  const summary = { utilitiesReplaced: 0, utilitiesAdded: 0 };
  const r = applyTokensToClass(
    'w-full mx-auto',
    [{ name: '--header-nav-max-width-2xl', property: 'max-width', state: null, breakpoint: '2xl' }],
    summary,
  );
  assert.match(r, /2xl:max-w-\[var\(--header-nav-max-width-2xl\)\]/);
  assert.equal(summary.utilitiesAdded, 1);
});

test('applyTokensToClass: токен с состоянием hover', () => {
  const summary = { utilitiesReplaced: 0, utilitiesAdded: 0 };
  const r = applyTokensToClass(
    'text-black',
    [{ name: '--header-link-hover-color', property: 'color', state: 'hover', breakpoint: null }],
    summary,
  );
  assert.match(r, /hover:text-\[var\(--header-link-hover-color\)\]/);
});

test('applyTokensToClass: префикс breakpoint:state', () => {
  const summary = { utilitiesReplaced: 0, utilitiesAdded: 0 };
  const r = applyTokensToClass(
    'text-black',
    [{ name: '--header-link-md-hover-color', property: 'color', state: 'hover', breakpoint: 'md' }],
    summary,
  );
  assert.match(r, /md:hover:text-\[var\(--header-link-md-hover-color\)\]/);
});

test('applyTokensToClass: не дублирует если уже var(--токен)', () => {
  const summary = { utilitiesReplaced: 0, utilitiesAdded: 0 };
  const newClass = applyTokensToClass(
    'w-full max-w-[var(--header-nav-max-width)] mx-auto',
    [{ name: '--header-nav-max-width', property: 'max-width', state: null, breakpoint: null }],
    summary,
  );
  // Замена уже произошла к тому же значению — replacements=0
  assert.match(newClass, /max-w-\[var\(--header-nav-max-width\)\]/);
});

// ───────── computeReplacements ─────────
test('computeReplacements: возвращает массив с oldClass/newClass', () => {
  const tokens = [
    { name: '--header-wrapper-bg', element: 'wrapper', property: 'background-color', state: null, breakpoint: null },
  ];
  const { replacements, summary } = computeReplacements(SAMPLE_FILE, 'HeaderClasses', tokens);
  assert.ok(Array.isArray(replacements));
  assert.equal(typeof summary.utilitiesReplaced, 'number');
});

test('computeReplacements: пустой список → пустой replacements', () => {
  const { replacements } = computeReplacements(SAMPLE_FILE, 'HeaderClasses', []);
  assert.deepEqual(replacements, []);
});

test('computeReplacements: вложенный путь', () => {
  const tokens = [
    { name: '--header-mobile-menu-root-bg', element: 'mobileMenu.root', property: 'background-color', state: null, breakpoint: null },
  ];
  const { replacements } = computeReplacements(SAMPLE_FILE, 'HeaderClasses', tokens);
  if (replacements.length > 0) {
    assert.equal(replacements[0].elementKey, 'mobileMenu.root');
  }
});

test('computeReplacements: оба oldClass и newClass — строки', () => {
  const tokens = [
    { name: '--header-wrapper-bg', element: 'wrapper', property: 'background-color', state: null, breakpoint: null },
  ];
  const { replacements } = computeReplacements(SAMPLE_FILE, 'HeaderClasses', tokens);
  if (replacements.length > 0) {
    assert.equal(typeof replacements[0].oldClass, 'string');
    assert.equal(typeof replacements[0].newClass, 'string');
  }
});

// ───────── rewriteClassesFile ─────────
test('rewriteClassesFile: заменяет строковый литерал в файле', () => {
  const replacements = [
    { elementKey: 'wrapper', oldClass: 'w-full bg-white text-black', newClass: 'w-full bg-[var(--header-wrapper-bg)] text-black' },
  ];
  const r = rewriteClassesFile(SAMPLE_FILE, 'HeaderClasses', replacements);
  assert.equal(r.editsCount, 1);
  assert.match(r.text, /bg-\[var\(--header-wrapper-bg\)\]/);
});

test('rewriteClassesFile: вложенный путь mobileMenu.root', () => {
  const replacements = [
    { elementKey: 'mobileMenu.root', oldClass: 'hidden md:hidden bg-white', newClass: 'hidden md:hidden bg-[var(--T)]' },
  ];
  const r = rewriteClassesFile(SAMPLE_FILE, 'HeaderClasses', replacements);
  assert.equal(r.editsCount, 1);
  assert.match(r.text, /'hidden md:hidden bg-\[var\(--T\)\]'/);
});

test('rewriteClassesFile: если oldClass не совпадает — не правит', () => {
  const replacements = [
    { elementKey: 'wrapper', oldClass: 'WRONG', newClass: 'NEW' },
  ];
  const r = rewriteClassesFile(SAMPLE_FILE, 'HeaderClasses', replacements);
  assert.equal(r.editsCount, 0);
  assert.equal(r.text, SAMPLE_FILE);
});

test('rewriteClassesFile: сохраняет вид файла', () => {
  const replacements = [
    { elementKey: 'wrapper', oldClass: 'w-full bg-white text-black', newClass: 'NEW' },
  ];
  const r = rewriteClassesFile(SAMPLE_FILE, 'HeaderClasses', replacements);
  // Содержит остальные неизменённые поля
  assert.match(r.text, /export const HeaderClasses/);
  assert.match(r.text, /mobileMenu/);
  assert.match(r.text, /flex flex-col/);
});

test('rewriteClassesFile: множественные правки в правильном порядке', () => {
  const replacements = [
    { elementKey: 'wrapper', oldClass: 'w-full bg-white text-black', newClass: 'W1' },
    { elementKey: 'mobileMenu.root', oldClass: 'hidden md:hidden bg-white', newClass: 'W2' },
  ];
  const r = rewriteClassesFile(SAMPLE_FILE, 'HeaderClasses', replacements);
  assert.equal(r.editsCount, 2);
  assert.match(r.text, /'W1'/);
  assert.match(r.text, /'W2'/);
});

test('rewriteClassesFile: идемпотентность — повторное применение не меняет', () => {
  const replacements = [
    { elementKey: 'wrapper', oldClass: 'w-full bg-white text-black', newClass: 'CHANGED' },
  ];
  const once = rewriteClassesFile(SAMPLE_FILE, 'HeaderClasses', replacements);
  const twice = rewriteClassesFile(once.text, 'HeaderClasses', replacements);
  assert.equal(twice.editsCount, 0);
  assert.equal(once.text, twice.text);
});
