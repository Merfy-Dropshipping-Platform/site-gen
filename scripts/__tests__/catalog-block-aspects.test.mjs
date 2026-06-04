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
