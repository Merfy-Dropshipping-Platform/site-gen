// Тесты модулей и логики каталога
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAstroFile,
  BLOCK_ELEMENT_SELECTORS,
  collectUnconditionalLiterals,
  extractStringLiterals,
  hasClassToken,
  hasClassListToken,
  flattenClasses as flattenAstroClasses,
  collectClassesFromNode,
} from '../lib/astro-parse.mjs';
import { extractClassesObject, flattenClasses } from '../lib/classes-ts.mjs';
import { classifyUtility, isStructural, isGlobalToken } from '../lib/utility-classify.mjs';

// ───────── extractStringLiterals ─────────
test('extractStringLiterals: одинарные кавычки', () => {
  const r = extractStringLiterals(`'foo', 'bar'`);
  assert.deepEqual(r, ['foo', 'bar']);
});

test('extractStringLiterals: двойные кавычки', () => {
  const r = extractStringLiterals(`"foo", "bar"`);
  assert.deepEqual(r, ['foo', 'bar']);
});

test('extractStringLiterals: пустые литералы', () => {
  const r = extractStringLiterals(`'', 'x'`);
  assert.deepEqual(r, ['', 'x']);
});

test('extractStringLiterals: смешанные кавычки', () => {
  const r = extractStringLiterals(`'foo', "bar"`);
  assert.deepEqual(r, ['foo', 'bar']);
});

// ───────── collectUnconditionalLiterals ─────────
test('collectUnconditionalLiterals: простой массив', () => {
  const r = collectUnconditionalLiterals(`[ 'foo', 'bar' ]`);
  assert.deepEqual(r, ['foo', 'bar']);
});

test('collectUnconditionalLiterals: пропускает условные через &&', () => {
  const r = collectUnconditionalLiterals(`[ 'foo', cond && 'bar', 'baz' ]`);
  assert.deepEqual(r, ['foo', 'baz']);
});

test('collectUnconditionalLiterals: пропускает тернарный', () => {
  const r = collectUnconditionalLiterals(`[ 'foo', y ? 'baz' : 'qux', 'always' ]`);
  assert.deepEqual(r, ['foo', 'always']);
});

// ───────── parseAstroFile + Header селекторы ─────────
const MINIMAL_HEADER_ASTRO = `---
const x = 1;
---
<div class="w-full" data-header-wrapper>
  <header class="w-full flex items-center border-b">
    <nav class="w-full max-w-[1920px] mx-auto px-4 sm:px-6 md:px-8 lg:px-16 xl:px-24 2xl:px-[300px] flex items-center relative">
      <button id="mobile-menu-button" class="md:hidden w-10 h-10" aria-label="Меню"></button>
      <div>
        <a href="/" class="flex items-center hover:opacity-80">
          <img class="h-5 sm:h-6 md:h-[26px] w-auto" />
          <span class="text-lg sm:text-xl md:text-2xl font-bold tracking-wide">Site</span>
        </a>
      </div>
      <div data-nav-inline class="hidden md:flex items-center gap-4 lg:gap-8 xl:gap-12 2xl:gap-[80px]">
        <a class="text-sm md:text-base lg:text-lg xl:text-[20px] font-normal hover:opacity-70">Link</a>
      </div>
      <div class="flex items-center gap-3 xl:gap-[25px]">
        <button aria-label="Поиск" class="hidden md:flex w-8 h-8 lg:w-10 lg:h-10"></button>
        <a href="/cart" id="header-cart-link" class="relative w-8 h-8" aria-label="Корзина">
          <span id="cart-badge" class="hidden absolute -top-1 -right-1">0</span>
        </a>
        <a href="/login" class="auth-nav-btn w-8 h-8" aria-label="Аккаунт"></a>
      </div>
    </nav>
  </header>
  <div id="mobile-menu" class="hidden absolute"></div>
</div>
`;

test('parseAstroFile: находит wrapper по data-header-wrapper', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.wrapper.found, 'wrapper должен быть найден');
});

test('parseAstroFile: находит header', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.header.found);
});

test('parseAstroFile: находит nav по max-w-[1920px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.nav.found);
});

test('parseAstroFile: находит hamburger по id', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.hamburger.found);
});

test('parseAstroFile: находит logoText', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.logoText.found);
});

test('parseAstroFile: находит actionCart по id', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.actionCart.found);
});

test('parseAstroFile: ошибка если нет карты блока', async () => {
  await assert.rejects(
    () => parseAstroFile(MINIMAL_HEADER_ASTRO, { selectors: undefined, blockName: 'Mystery' }),
    /Нет карты элементов/,
  );
});

test('parseAstroFile: классы извлекаются строкой', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.nav.staticClass.includes('max-w-[1920px]'));
});

test('parseAstroFile: cartBadge найден', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.cartBadge.found);
});

test('parseAstroFile: actionProfile найден по aria-label', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.actionProfile.found);
});

test('parseAstroFile: mobileMenuRoot найден по id', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.mobileMenuRoot.found);
});

test('parseAstroFile: actionSearch найден по aria-label', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HEADER_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Header,
    blockName: 'Header',
  });
  assert.ok(classMap.actionSearch.found);
});

// ───────── classes-ts extract ─────────
const SAMPLE_CLASSES_TS = `
export const HeaderClasses = {
  wrapper: 'w-full bg-white',
  sticky: {
    'scroll-up': 'sticky top-0',
    always: 'sticky',
    none: 'relative',
  },
  mobileMenu: {
    root: 'hidden md:hidden',
    nav: 'flex flex-col',
  },
} as const;
`;

test('extractClassesObject: извлекает плоские поля', () => {
  const obj = extractClassesObject(SAMPLE_CLASSES_TS, 'HeaderClasses');
  assert.equal(obj.wrapper, 'w-full bg-white');
});

test('extractClassesObject: извлекает вложенные', () => {
  const obj = extractClassesObject(SAMPLE_CLASSES_TS, 'HeaderClasses');
  assert.equal(obj.sticky.always, 'sticky');
  assert.equal(obj.mobileMenu.root, 'hidden md:hidden');
});

test('flattenClasses: плоский путь', () => {
  const obj = extractClassesObject(SAMPLE_CLASSES_TS, 'HeaderClasses');
  const flat = flattenClasses(obj);
  assert.equal(flat['wrapper'], 'w-full bg-white');
  assert.equal(flat['sticky.always'], 'sticky');
  assert.equal(flat['mobileMenu.root'], 'hidden md:hidden');
});

test('extractClassesObject: ошибка если export не найден', () => {
  assert.throws(() => extractClassesObject(`export const Foo = {} as const;`, 'BarClasses'), /Не нашёл объект/);
});

// ───────── фильтрация ─────────
test('фильтр: структурное значение auto не токенизируется', () => {
  assert.equal(isStructural('auto'), true);
});

test('фильтр: rgb(var(--color-*)) — глобальный', () => {
  assert.equal(isGlobalToken('rgb(var(--color-text))'), true);
});

test('фильтр: 16px — конкретное значение, токенизируем', () => {
  assert.equal(isStructural('16px'), false);
  assert.equal(isGlobalToken('16px'), false);
});

// ───────── классы из class:list ─────────
const CLASS_LIST_ASTRO = `
<div class:list={['foo bar', cond && 'baz', 'qux']} />
`;

test('class:list — extractStringLiterals находит литералы', () => {
  const literals = extractStringLiterals(`['foo bar', cond && 'baz', 'qux']`);
  assert.equal(literals.length, 3);
});

test('class:list — collectUnconditional берёт безусловные', () => {
  const literals = collectUnconditionalLiterals(`['foo bar', cond && 'baz', 'qux']`);
  assert.deepEqual(literals, ['foo bar', 'qux']);
});

// ───────── flattenClasses от AST ─────────
test('flattenClasses (AST): собирает staticClass + classList', () => {
  const result = flattenAstroClasses({ staticClass: 'foo bar', classList: ['baz qux', 'extra'] });
  assert.deepEqual(result, ['foo', 'bar', 'baz', 'qux', 'extra']);
});

test('flattenClasses (AST): пустой ввод', () => {
  const result = flattenAstroClasses({ staticClass: '', classList: [] });
  assert.deepEqual(result, []);
});

// ───────── hasClassToken / hasClassListToken ─────────
test('hasClassToken: находит токен в static', () => {
  const node = { attributes: [{ name: 'class', value: 'w-full bg-black' }] };
  assert.equal(hasClassToken(node, 'w-full'), true);
});

test('hasClassToken: не находит частичное совпадение', () => {
  const node = { attributes: [{ name: 'class', value: 'w-full' }] };
  assert.equal(hasClassToken(node, 'w-fu'), false);
});

test('hasClassListToken: находит литерал в class:list', () => {
  const node = { attributes: [{ name: 'class:list', value: `[ 'w-full bg-black' ]` }] };
  assert.equal(hasClassListToken(node, 'w-full'), true);
});
