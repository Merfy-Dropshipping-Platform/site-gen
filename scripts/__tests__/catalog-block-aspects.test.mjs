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

// ───────── Footer селекторы ─────────
// Минимальная фикстура базы — 3-col вариант с newsletter + 3 колонки + copyright.
// Покрывает ключи: root, container, newsletter.*, main.section, main.grid,
// column.root, column.title, column.nav, column.body, link, email, socialRow,
// socialLink, copyright.bar, copyright.text.
const MINIMAL_FOOTER_BASE_ASTRO = `---
const x = 1;
---
<footer class="relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]">
  <div class="mx-auto max-w-[var(--container-max-width)] px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16">
    <section class="pb-10 sm:pb-12 md:pb-16 lg:pb-[40px]" aria-labelledby="newsletter-heading">
      <div class="w-full">
        <div class="flex flex-col gap-2">
          <h2 id="newsletter-heading" class="text-[20px] uppercase">Newsletter</h2>
          <p class="text-[16px] leading-[1.4]">Description</p>
        </div>
        <form class="w-full max-w-[652px]" data-action="newsletter">
          <input type="email" name="email" class="flex-1 bg-transparent" />
          <button type="submit" aria-label="Подписаться" class="w-8 h-8"></button>
        </form>
      </div>
    </section>
    <section class="pb-6" aria-label="Информация и навигация">
      <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-8 md:gap-12 lg:gap-16">
        <div class="flex flex-col gap-4 flex-1 min-w-0 max-w-[318px]">
          <h3 class="text-[16px] uppercase">Навигация</h3>
          <nav class="flex flex-col gap-3" aria-label="Footer navigation">
            <a href="/about" class="text-[16px] transition-colors">О нас</a>
          </nav>
        </div>
        <div class="flex flex-col gap-4 flex-1 min-w-0 max-w-[318px]">
          <h3 class="text-[16px] uppercase">Информация</h3>
          <div class="flex flex-col gap-3">
            <a href="/legal/delivery" class="text-[16px] transition-colors">Доставка</a>
          </div>
        </div>
        <div class="flex flex-col items-end max-w-[318px] md:self-stretch text-right">
          <div class="flex flex-col gap-4 flex-1 min-w-0 max-w-[318px]">
            <h3 class="text-[16px] uppercase">Контакты</h3>
            <div class="flex flex-col gap-3">
              <a href="mailto:hi@shop.merfy" class="text-[16px] transition-colors">hi@shop.merfy</a>
              <div class="flex gap-4 items-center justify-end">
                <a href="#" aria-label="Telegram" data-platform="telegram" class="w-6 h-6"></a>
                <a href="#" aria-label="VK" data-platform="vk" class="w-6 h-6"></a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
  <div class="w-full h-auto sm:h-20 md:h-24 lg:h-[100px] flex items-center justify-center py-6 sm:py-0 bg-[rgb(var(--color-heading))] text-[rgb(var(--color-bg))]">
    <p class="text-[20px] font-light leading-[1.21] text-center px-4 sm:px-6">© 2026 Магазин. Все права защищены.</p>
  </div>
</footer>
`;

// Фикстура источника rose-темы (упрощённый вариант от sources/rose-Footer.astro).
// Уникальные маркеры: max-w-[1920px], aria-label="Навигация по сайту",
// data-newsletter-form, role="list", bg-black для copyright.
const MINIMAL_FOOTER_ROSE_ASTRO = `---
const phone = "+7 (000) 000-00-00";
---
<footer class="w-full bg-white">
  <div class="mx-auto w-full max-w-[1920px] px-4 pb-20 pt-20 sm:px-5 md:px-10 lg:px-16 xl:px-20 2xl:px-[280px]">
    <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-20">
      <section class="flex w-full flex-col gap-5" aria-labelledby="newsletter-heading">
        <div class="flex max-w-[1320px] flex-col gap-2 text-left">
          <h2 id="newsletter-heading" class="rose-title !font-bold w-full">Подпишитесь</h2>
          <p class="font-manrope !text-[16px] font-normal !leading-none tracking-normal text-[#999999]">Получайте информацию</p>
        </div>
        <form class="flex h-14 w-full max-w-[430px] items-center gap-2 rounded-[4px]" data-newsletter-form>
          <input type="email" name="email" required class="min-w-0 flex-1 bg-transparent" />
          <button type="submit" aria-label="Подписаться" class="flex size-9 shrink-0 items-center justify-center"></button>
        </form>
      </section>
      <section class="flex w-full flex-col gap-10 lg:flex-row lg:items-start lg:justify-between" aria-label="Навигация по сайту">
        <div class="flex flex-col gap-10 sm:flex-row sm:gap-[200px]">
          <ul class="flex flex-col gap-3" role="list">
            <li>
              <a href="/" class="font-manrope !text-[16px] font-normal !leading-none tracking-normal text-[#999999]">Главная</a>
            </li>
          </ul>
          <ul class="flex flex-col gap-3" role="list">
            <li>
              <a href="/legal/delivery" class="font-manrope !text-[16px] font-normal !leading-none tracking-normal text-[#999999]">Доставка</a>
            </li>
          </ul>
        </div>
        <div class="flex flex-col gap-6 lg:max-w-[min(100%,430px)] lg:items-end lg:text-right">
          <div class="flex flex-col gap-3">
            <a href="tel:+70000000000" class="font-manrope !text-[16px] font-normal !leading-none tracking-normal text-[#999999]">+7 (000) 000-00-00</a>
            <a href="mailto:example@shop.merfy" class="font-manrope !text-[16px] font-normal !leading-none tracking-normal text-[#999999]">example@shop.merfy</a>
          </div>
          <div class="flex flex-wrap items-center gap-2 lg:justify-end">
            <a href="#" aria-label="VK" class="flex size-6 items-center justify-center text-[#000000]"></a>
            <a href="#" aria-label="Telegram" class="flex size-6 items-center justify-center text-[#000000]"></a>
          </div>
        </div>
      </section>
    </div>
  </div>
  <div class="flex h-16 w-full items-center justify-center bg-black px-4">
    <p class="text-center font-manrope text-[14px] font-normal leading-none text-white">© 2026 Theme</p>
  </div>
</footer>
`;

test('Footer base: находит root по <footer>', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.root.found, 'root должен быть найден');
  assert.ok(classMap.root.staticClass.includes('bg-[rgb(var(--color-bg))]'));
});

test('Footer base: находит container по max-w-[var(--container-max-width)]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.container.found);
});

test('Footer base: находит newsletter.wrapper по aria-labelledby', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['newsletter.wrapper'].found);
});

test('Footer base: находит newsletter.heading по id', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['newsletter.heading'].found);
});

test('Footer base: находит newsletter.form по data-action="newsletter"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['newsletter.form'].found);
});

test('Footer base: находит newsletter.submit по type+aria-label', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['newsletter.submit'].found);
});

test('Footer base: находит main.section по aria-label "Информация и навигация"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['main.section'].found);
});

test('Footer base: находит column.title по h3', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['column.title'].found);
});

test('Footer base: находит column.nav по aria-label="Footer navigation"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['column.nav'].found);
});

test('Footer base: находит email по href mailto:', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.email.found);
});

test('Footer base: находит socialLink по data-platform', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.socialLink.found);
});

test('Footer base: находит copyright.bar', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['copyright.bar'].found);
});

test('Footer base: находит copyright.text', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['copyright.text'].found);
});

// ───────── Footer rose-источник ─────────

test('Footer rose: находит root по <footer>', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.root.found);
});

test('Footer rose: находит container по max-w-[1920px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.container.found);
  assert.ok(classMap.container.staticClass.includes('max-w-[1920px]'));
});

test('Footer rose: находит newsletter.form по data-newsletter-form', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['newsletter.form'].found);
});

test('Footer rose: находит main.section по aria-label "Навигация по сайту"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['main.section'].found);
});

test('Footer rose: находит column.root по role="list"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['column.root'].found);
});

test('Footer rose: находит socialLink по aria-label="VK"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.socialLink.found);
});

test('Footer rose: находит copyright.bar по bg-black', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap['copyright.bar'].found);
});

test('Footer rose: column.title НЕ найден (нет h3 в источнике rose)', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.equal(classMap['column.title'].found, false);
});

test('Footer rose: классы container содержат max-w-[1920px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_FOOTER_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Footer,
    blockName: 'Footer',
  });
  assert.ok(classMap.container.staticClass.includes('max-w-[1920px]'));
});

// ───────── Проброс псевдо-состояний (active:/hover:) до каталога ─────────
//
// Эти тесты воспроизводят логику `classifyTokens()` из catalog-block-aspects.mjs:
// классы каждого элемента — массив, для каждого считаем classifyUtility,
// формируем ключ `${property}|${state}|${breakpoint}`. Если `active:scale-95`
// классифицируется правильно — в карте появится ключ `transform|active|`.

function classifyTokensHelper(tokens) {
  const map = {};
  for (const tok of tokens) {
    if (!tok) continue;
    const c = classifyUtility(tok);
    if (!c) continue;
    const key = `${c.property}|${c.state || ''}|${c.breakpoint || ''}`;
    map[key] = c.value;
  }
  return map;
}

test('classifyTokens: active:scale-95 в массиве → ключ transform|active|', () => {
  const tokens = ['flex', 'size-9', 'shrink-0', 'items-center', 'active:scale-95'];
  const map = classifyTokensHelper(tokens);
  assert.equal(map['transform|active|'], 'scale(0.95)');
});

test('classifyTokens: hover:scale-105 в массиве → ключ transform|hover|', () => {
  const tokens = ['p-4', 'rounded-md', 'hover:scale-105'];
  const map = classifyTokensHelper(tokens);
  assert.equal(map['transform|hover|'], 'scale(1.05)');
});

test('classifyTokens: md:hover:scale-110 → transform|hover|md', () => {
  const tokens = ['md:hover:scale-110'];
  const map = classifyTokensHelper(tokens);
  assert.equal(map['transform|hover|md'], 'scale(1.1)');
});

// Краеугольный тест: классы кнопки submit из rose Footer (точная строка 69
// из rose-Footer.astro) — после classify в карте обязан появиться ключ
// transform|active|.
test('classifyTokens: rose Footer submit button (строка 69 источника)', () => {
  const tokens = (
    'flex size-9 shrink-0 items-center justify-center ' +
    'font-manrope text-[16px] font-normal leading-none text-[#000000] active:scale-95'
  ).split(/\s+/);
  const map = classifyTokensHelper(tokens);
  assert.equal(map['transform|active|'], 'scale(0.95)',
    'active:scale-95 должен классифицироваться как transform/active');
});

// ───────── Hero блок ─────────
// Покрывает оба источника:
//   1) База theme-base/blocks/Hero/Hero.astro — variant=centered/overlay/split/grid-4/split-bloom.
//      Маркеры: <section data-puck-component-id+data-variant>, <h1>,
//      <p>, <a> с data-puck-subsection-field, <img> с classList из C.image[variant],
//      <header> или <div> внутри content column.
//   2) Источник rose-theme/src/components/sections/Hero.astro — overlay-стейдж:
//      <section aria-labelledby="hero-title">, <div class="relative w-full min-h-[...]">,
//      <RosePicture> → <img class="absolute inset-0 z-0 size-full object-cover ...">,
//      <div class="absolute inset-0 z-10 flex w-full flex-col items-center justify-end ...">,
//      <h1 id="hero-title">, <p class="font-manrope max-w-xl ...">, <a class="!bg-white min-w-[120px] ...">.

const MINIMAL_HERO_BASE_ASTRO = `---
const x = 1;
---
<section
  class:list={['relative w-full overflow-hidden', 'color-scheme-default']}
  data-puck-component-id="hero-1"
  data-variant="centered"
  style="padding-top:80px;"
>
  <img alt="" class="absolute inset-0 -z-10 object-cover w-full h-full" />
  <div class="absolute inset-0 -z-[5]" style="background-color: rgb(0 0 0 / 0.5);" aria-hidden="true"></div>
  <div class:list={['mx-auto max-w-[var(--container-max-width)] px-4', 'flex flex-col py-12 min-h-[inherit]', 'justify-center', 'relative z-10']} style="min-height: inherit;">
    <div class:list={['flex flex-col gap-4 sm:gap-5 md:gap-6 lg:gap-5 xl:gap-[25px] w-full px-4 sm:px-6 md:px-8', 'items-center text-center']}>
      <header class="flex flex-col gap-1 sm:gap-2 md:gap-3 lg:gap-4 xl:gap-[5px]">
        <h1 class:list={['[font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[length:var(--hero-heading-size,var(--size-hero-heading))] leading-tight text-[rgb(var(--color-heading))]']} data-puck-subsection-field="heading">Hero Title</h1>
        <p class:list={['mt-2 [font-family:var(--font-body)] text-[length:var(--hero-text-size,16px)] text-[rgb(var(--color-text))]']} data-puck-subsection-field="text">Hero subtitle</p>
      </header>
      <div class="flex flex-wrap gap-[25px] justify-center">
        <a href="/shop" class:list={['inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-4 text-[16px] [font-family:var(--font-body)] border bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]']} data-puck-subsection-field="primaryButton">Купить</a>
      </div>
    </div>
  </div>
</section>
`;

// Фикстура источника rose Hero (упрощённая копия sources/rose-Hero.astro).
// Маркеры: aria-labelledby="hero-title", stage с min-h-[min(70svh,560px)] и aspect-[10/15],
// <img> с size-full+object-cover (после раскрытия RosePicture),
// overlay-content с inset-0+z-10+justify-end, max-w-[540px] content column,
// inner header — <div items-center text-center>, h1 id="hero-title",
// p с font-manrope+max-w-xl, <a> с !bg-white+min-w-[120px].
const MINIMAL_HERO_ROSE_ASTRO = `---
const x = 1;
---
<section
  class="relative w-full overflow-hidden bg-white"
  aria-labelledby="hero-title"
>
  <div
    class="relative w-full min-h-[min(70svh,560px)] sm:min-h-[560px] md:min-h-[420px] lg:min-h-[460px] aspect-[10/15] sm:aspect-[4/5] md:aspect-[4/3] lg:aspect-[16/9] xl:aspect-[2/1] 2xl:aspect-[21/9]"
  >
    <img
      src="/images/hero.png"
      alt="Hero"
      loading="eager"
      class="absolute inset-0 z-0 size-full object-cover object-center"
    />
    <div
      class="absolute inset-0 z-10 flex w-full flex-col items-center justify-end px-4 pb-10 pt-28 sm:px-5 sm:pb-11 sm:pt-32 md:px-10 md:pb-14 md:pt-36 lg:px-16 lg:pb-16 xl:px-20 xl:pb-20 2xl:px-[280px]"
    >
      <div class="flex w-full max-w-[540px] flex-col items-center gap-6 sm:gap-10 md:max-w-[640px]">
        <div class="flex flex-col items-center gap-2 text-center sm:gap-3 md:gap-4">
          <h1
            id="hero-title"
            class="hero-animate-1 font-comfortaa !text-[20px] !font-normal !leading-none uppercase tracking-normal text-white sm:!text-[28px] md:!text-[36px] lg:!text-[40px]"
          >Rose Site</h1>
          <p
            class="hero-animate-2 max-w-xl px-1 font-manrope text-[14px] font-normal leading-none text-white sm:text-[16px] md:text-[18px] lg:text-[20px]"
          >Там, где классика встречается с характером</p>
        </div>
        <div class="hero-animate-3 flex w-full flex-col items-center justify-center">
          <a
            href="/catalog"
            class="inline-flex h-10 min-h-10 w-auto min-w-[120px] items-center justify-center rounded !border-0 !bg-white px-3 py-2.5 font-manrope text-[14px] font-normal leading-none !text-[#000000] transition-opacity hover:opacity-90 sm:h-[52px] sm:min-h-[52px] sm:min-w-[160px] sm:rounded-[6px] sm:px-6 sm:py-[10px] sm:text-[15px] md:text-[16px]"
          >В каталог</a>
        </div>
      </div>
    </div>
  </div>
</section>
`;

test('Hero base: находит root по data-puck-component-id', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.root.found, 'root должен быть найден');
});

test('Hero base: находит title по data-puck-subsection-field=heading', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.title.found);
});

test('Hero base: находит subtitle по data-puck-subsection-field=text', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.subtitle.found);
});

test('Hero base: находит ctaButton по data-puck-subsection-field=primaryButton', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.ctaButton.found);
});

test('Hero base: находит image (img inset-0 object-cover)', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.image.found);
});

test('Hero base: находит header', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.header.found);
});

test('Hero rose: находит root по aria-labelledby="hero-title"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.root.found);
  assert.ok(classMap.root.staticClass.includes('bg-white'));
});

test('Hero rose: находит title по id="hero-title"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.title.found);
  assert.ok(classMap.title.staticClass.includes('font-comfortaa'));
});

test('Hero rose: находит subtitle по font-manrope+max-w-xl', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.subtitle.found);
});

test('Hero rose: находит ctaButton по !bg-white+min-w-[120px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.ctaButton.found);
  assert.ok(classMap.ctaButton.staticClass.includes('!bg-white'));
});

test('Hero rose: находит image (size-full+object-cover)', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.image.found);
  assert.ok(classMap.image.staticClass.includes('size-full'));
});

test('Hero rose: находит stage (min-h-[min(70svh,560px)])', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.stage.found);
  assert.ok(classMap.stage.staticClass.includes('min-h-[min(70svh,560px)]'));
});

test('Hero rose: находит overlay (inset-0+z-10+justify-end)', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.overlay.found);
});

test('Hero rose: находит contentColumn по max-w-[540px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_HERO_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Hero,
    blockName: 'Hero',
  });
  assert.ok(classMap.contentColumn.found);
});

// ───────── Collections блок ─────────
// Покрывает оба источника:
//   1) База theme-base/blocks/Collections/Collections.astro — main markup,
//      с маркерами: <section data-puck-component-id>, <div class={C.container}>,
//      <h2 data-puck-subsection-field="title">, <p data-puck-subsection-field="subtitle">,
//      <div class={C.grid}>, <a data-puck-subsection-field="collections">,
//      <img class={C.image+gridAspectClass}>, <h3 class={C.cardHeading}>.
//   2) Источник rose-theme/src/components/sections/Collections.astro
//      (с раскрытыми NtSectionHeading + RoseCollectionCard):
//      <section id="collections" aria-labelledby="collections-title">,
//      <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 ...">,
//      <h2 id="collections-title" class="font-comfortaa uppercase">,
//      <p class="font-manrope text-[#999999]">,
//      <ul role="list" class="grid grid-cols-1 md:grid-cols-3">,
//      <a data-nt="rose-collection-card" class="group flex">,
//      <div class="aspect-[430/500] rounded-[8px] bg-[#F5F5F5]">,
//      <img class="h-full w-full object-cover">,
//      <h3 class="rose-collection-name">.

const MINIMAL_COLLECTIONS_BASE_ASTRO = `---
const x = 1;
---
<section
  class:list={['relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]', 'color-scheme-default']}
  data-puck-component-id="collections-1"
  data-collections-variant="standard"
  style="padding-top:80px;"
>
  <div class="mx-auto max-w-[var(--container-max-width)] px-4">
    <h2 class:list={['[font-family:var(--font-heading)] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] mb-2', 'text-center text-2xl md:text-3xl']} data-puck-subsection-field="title">Collections</h2>
    <p class:list={['[font-family:var(--font-body)] text-[rgb(var(--color-text))]/60 mb-10', 'text-center text-sm md:text-base']} data-puck-subsection-field="subtitle">Browse our collections</p>
    <div class:list={['grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]', 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3']}>
      <a
        href="/catalog?collection=demo-1"
        class:list={['block overflow-hidden group']}
        data-puck-subsection-field="collections"
      >
        <img src="/img/c1.jpg" alt="Collection" class:list={['w-full aspect-[3/4] object-cover rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] transition-transform duration-500 ease-out group-hover:scale-105']} loading="lazy" />
        <h3 class:list={['mt-3 [font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))] text-center']}>Коллекция</h3>
        <p class:list={['mt-1 text-[12px] leading-[15px] [font-family:var(--font-body)] text-[rgb(var(--color-text))]/60 text-center']}>Описание</p>
      </a>
      <a
        href="/catalog?collection=demo-2"
        class:list={['block overflow-hidden group']}
        data-puck-subsection-field="collections"
      >
        <div
          class:list={['overflow-hidden', 'w-full rounded-[var(--radius-media)] bg-[rgb(var(--color-muted)/0.15)]']}
          aria-hidden="true"
        ></div>
        <h3 class:list={['mt-3 [font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))] text-center']}>Коллекция</h3>
      </a>
    </div>
  </div>
</section>
`;

// Фикстура rose-источника — раскрытый markup как видит парсер после fetch из github
// (NtSectionHeading и RoseCollectionCard представлены своим итоговым HTML).
const MINIMAL_COLLECTIONS_ROSE_ASTRO = `---
const sectionTitle = "Коллекции";
const sectionSubtitle = "Вдохновение";
const collections = [{ name: "RIVIERA", image: "/img/r.jpg" }];
---
<section
  id="collections"
  class="w-full bg-white px-4 pb-14 pt-14 sm:px-5 sm:pb-16 sm:pt-16 md:px-10 md:pb-[100px] md:pt-[100px] lg:px-16 lg:pb-[120px] lg:pt-[120px] xl:px-20 xl:pb-[140px] xl:pt-[140px] 2xl:px-[280px]"
  aria-labelledby="collections-title"
>
  <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-8 md:gap-10">
    <div class="flex w-full justify-center md:justify-center">
      <div
        class:list={['flex max-w-[90vw] flex-col items-center', 'gap-2']}
        data-nt="section-heading"
        data-nt-variant="rose"
      >
        <h2
          id="collections-title"
          class:list={['text-center font-comfortaa font-normal uppercase text-[#000000]', '!text-[20px] !leading-none tracking-normal']}
        >{sectionTitle}</h2>
        <p
          class:list={['text-center font-manrope font-normal text-[#999999]', 'max-w-[780px] px-2 !text-[16px] !leading-none tracking-normal']}
        >{sectionSubtitle}</p>
      </div>
    </div>
    <ul
      class="grid grid-cols-1 gap-6 sm:gap-5 md:grid-cols-3 md:gap-5 lg:gap-6"
      role="list"
    >
      <li>
        <a
          href="/catalog?collection=RIVIERA"
          class="group flex w-full cursor-pointer flex-col gap-5"
          aria-label="RIVIERA"
          data-nt="rose-collection-card"
        >
          <div class="aspect-[430/500] w-full overflow-hidden rounded-[8px] bg-[#F5F5F5]">
            <img
              src="/img/r.jpg"
              alt="RIVIERA"
              width="430"
              height="500"
              loading="eager"
              class="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
            />
          </div>
          <h3
            class="rose-collection-name w-full text-left font-manrope !text-[16px] font-normal !leading-none tracking-normal text-[#000000] transition-opacity group-hover:opacity-70"
          >RIVIERA</h3>
        </a>
      </li>
    </ul>
  </div>
</section>
`;

test('Collections base: находит root по data-puck-component-id', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.root.found, 'root должен быть найден');
});

test('Collections base: находит container по max-w-[var(--container-max-width)]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.container.found);
});

test('Collections base: находит heading по data-puck-subsection-field="title"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.heading.found);
});

test('Collections base: находит subtitle по data-puck-subsection-field="subtitle"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.subtitle.found);
});

test('Collections base: находит grid по литералам с var(--spacing-grid-*)', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.grid.found);
});

test('Collections base: находит card по data-puck-subsection-field="collections"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.card.found);
});

test('Collections base: находит image по литералам C.image (aspect-[3/4])', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.image.found);
});

test('Collections base: находит cardHeading по литералам C.cardHeading', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.cardHeading.found);
});

test('Collections base: находит cardDescription по литералам C.cardDescription', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.cardDescription.found);
});

test('Collections base: находит cardImageWrapper-плейсхолдер (rounded-[var(--radius-media)] bg-[rgb(var(--color-muted)/0.15)])', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_BASE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.cardImageWrapper.found);
});

// ── rose источник ──

test('Collections rose: находит root по id="collections"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.root.found);
  assert.ok(classMap.root.staticClass.includes('bg-white'));
});

test('Collections rose: находит container по max-w-[1320px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.container.found);
  assert.ok(classMap.container.staticClass.includes('max-w-[1320px]'));
});

test('Collections rose: находит heading по id="collections-title"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.heading.found);
});

test('Collections rose: находит subtitle по font-manrope+text-[#999999]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.subtitle.found);
});

test('Collections rose: находит grid по <ul role="list"> с grid+grid-cols-1', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.grid.found);
});

test('Collections rose: находит card по data-nt="rose-collection-card"', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.card.found);
});

test('Collections rose: находит cardImageWrapper по aspect-[430/500]+rounded-[8px]', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.cardImageWrapper.found);
  assert.ok(classMap.cardImageWrapper.staticClass.includes('aspect-[430/500]'));
});

test('Collections rose: находит image по h-full+w-full+object-cover', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.image.found);
});

test('Collections rose: находит cardHeading по rose-collection-name', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.ok(classMap.cardHeading.found);
  assert.ok(classMap.cardHeading.staticClass.includes('rose-collection-name'));
});

test('Collections rose: cardDescription НЕ найден (нет описаний в источнике)', async () => {
  const { classMap } = await parseAstroFile(MINIMAL_COLLECTIONS_ROSE_ASTRO, {
    selectors: BLOCK_ELEMENT_SELECTORS.Collections,
    blockName: 'Collections',
  });
  assert.equal(classMap.cardDescription.found, false);
});
