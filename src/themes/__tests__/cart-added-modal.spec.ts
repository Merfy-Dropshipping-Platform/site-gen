/**
 * Окно «Товар добавлен в корзину» — один флоу и одна разметка на пять тем.
 *
 * Откуда задача. Владелец, 15.09: «взять флоу добавления в корзину из темы
 * bloom и применить его в остальных темах; окно и сайдбар корзины должны
 * принимать цветовую схему корзины». Замер «до» (Chromium, собранные дисты,
 * tokens.css продовой buildTokensCss):
 *   • окно было ТОЛЬКО у bloom, остальные четыре темы открывали сайдбар;
 *   • окно bloom схему не принимало вовсе — при схеме корзины 3, схеме 1 и без
 *     схемы карточка окна давала одинаковые `255,255,255`, кнопка —
 *     `227,142,159`: цвета были зашиты хексами `#E38E9F` / `#FDF4F6`.
 *
 * Что сторожим (каждая проверка ловит СВОЙ способ тихо всё сломать):
 *  1. тема перестала монтировать общий компонент → у неё молча вернётся
 *     сайдбар, и никто не заметит до жалобы;
 *  2. в разметку окна вернулся хекс/rgb-литерал → окно перестанет идти за
 *     схемой ровно так, как было у bloom;
 *  3. окно красится токеном, которого НЕТ в правилах схемы. Это отдельная
 *     ловушка: `--color-border` выглядит «схемным», но `schemeToVars` его не
 *     пишет — проверяем по ЖИВОМУ выводу buildTokensCss, а не по списку;
 *  4. у темы пропал `@source` на примитивы → Tailwind не соберёт классы окна и
 *     оно приедет без стилей (разметка при этом на месте, глазом по коду не
 *     видно);
 *  5. рантайм перестал брать цвет с корня сайдбара / с обёртки схемы страницы —
 *     это два случая вида корзины, и они обязаны остаться разными;
 *  6. вернулся in-button фидбек «Добавлено ✓» (убран решением владельца);
 *  7. тема снова форкнула ядро корзины или завела свой initCartUI;
 *  8. у переехавших тем сменился storageKey/eventPrefix — это выбросило бы
 *     корзины живых покупателей.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildTokensCss } from '../tokens-css';

const ROOT = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const THEMES = ['rose', 'vanilla', 'satin', 'flux', 'bloom'] as const;

/** Где каждая тема монтирует окно: у rose — общий storefront-рантайм. */
const MOUNT: Record<(typeof THEMES)[number], string> = {
  rose: 'themes/rose/src/components/StorefrontRuntime.astro',
  vanilla: 'themes/vanilla/src/layouts/Layout.astro',
  satin: 'themes/satin/src/layouts/Layout.astro',
  flux: 'themes/flux/src/layouts/Layout.astro',
  bloom: 'themes/bloom/src/layouts/Layout.astro',
};

/** Убрать комментарии (блочные, строчные и фронтматтер .astro) — сканируем КОД. */
function stripComments(src: string): string {
  return src
    .replace(/^---[\s\S]*?---/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const MODAL_ASTRO = 'packages/theme-base/primitives/CartAddedModal.astro';
const MODAL_RUNTIME = 'packages/theme-base/runtime/cart-added-modal.ts';
const NT_CART = 'packages/theme-base/runtime/nt-cart.ts';

describe('окно «Товар добавлен в корзину» — общий слой', () => {
  it('1. все пять тем монтируют ОДИН общий компонент', () => {
    const missing: string[] = [];
    for (const theme of THEMES) {
      const src = read(MOUNT[theme]);
      const importsShared = /packages\/theme-base\/primitives\/CartAddedModal\.astro/.test(src);
      const mounts = /<CartAddedModal\s*\/>/.test(src);
      if (!importsShared || !mounts) missing.push(theme);
    }
    expect(missing).toEqual([]);
  });

  it('2. в разметке окна нет хексов и rgb()-литералов — иначе схема не доедет', () => {
    const src = read(MODAL_ASTRO);
    const body = src.replace(/^---[\s\S]*?---/, ''); // шапку с комментарием не считаем
    // Цветовые литералы: #rgb/#rrggbb и rgb(1,2,3) с ЧИСЛАМИ (rgb(var(--…)) — законно).
    const hex = body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const rgbLiteral = body.match(/rgba?\(\s*\d/g) ?? [];
    expect({ hex, rgbLiteral }).toEqual({ hex: [], rgbLiteral: [] });
  });

  it('3. каждый --color-* окна реально попадает в правило схемы (живой buildTokensCss)', () => {
    const scheme = {
      id: 'scheme-2',
      name: '2',
      background: '#101828',
      surfaceBg: '#1d2939',
      heading: '#f5f5f5',
      text: '#eaecf0',
      muted: '#667085',
      accent: '#ff7a00',
      primaryButton: { background: '#f5f5f5', text: '#101828', border: '#f5f5f5' },
      secondaryButton: { background: '#101828', text: '#f5f5f5', border: '#f5f5f5' },
    };
    const css = buildTokensCss(
      { cartType: 'drawer', colorSchemes: [scheme], cartDrawerScheme: 'scheme-2' },
      'rose',
    );
    const rule = /\.color-scheme-2\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    const declared = new Set(
      (rule![1].match(/--color-[a-z0-9-]+/g) ?? []).map((t) => t.trim()),
    );

    const used = new Set<string>();
    for (const file of [MODAL_ASTRO, MODAL_RUNTIME]) {
      // Комментарии выкидываем: иначе гард ловится на собственную же строку
      // «--color-border сознательно НЕ используется» и краснеет на пустом месте.
      const code = stripComments(read(file));
      for (const token of code.match(/--color-[a-z0-9-]+/g) ?? []) used.add(token);
    }
    // `--cart-type` и прочие не-цветовые сюда не попадают по самому шаблону.
    const orphans = [...used].filter((t) => !declared.has(t)).sort();
    expect(orphans).toEqual([]);
  });

  it('4. Tailwind каждой темы сканирует примитивы theme-base', () => {
    const missing = THEMES.filter(
      (t) => !/@source\s+"[^"]*packages\/theme-base\/primitives\//.test(
        read(`themes/${t}/src/styles/global.css`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it('5. цвет берётся с корня сайдбара, а при виде «Страница» — с обёртки схемы', () => {
    const src = read(MODAL_RUNTIME);
    // «Сайдбар» — источник корень дровера.
    expect(src).toMatch(/\[data-nt\$="cart-drawer"\]/);
    // «Страница» — ближайшая обёртка схемы у нажатой кнопки.
    expect(src).toMatch(/closest\(\s*'\[class\*="color-scheme-"\]'\s*\)/);
    // Различие видов корзины читается из --cart-type, а не угадывается.
    expect(src).toMatch(/--cart-type/);
    // Копируем ВЫЧИСЛЕННОЕ значение: класса .color-scheme-N в превью нет.
    expect(src).toMatch(/getComputedStyle\(\s*source\s*\)/);
  });

  it('6. in-button фидбек «Добавлено» убран из общего ядра', () => {
    expect(read(NT_CART)).not.toMatch(/ntFeedback|>Добавлено</);
  });

  it('7. ни одна тема не форкает ядро корзины и не пишет свой initCartUI', () => {
    const offenders: string[] = [];
    for (const theme of THEMES) {
      const src = read(`themes/${theme}/src/lib/cart.ts`);
      if (!/packages\/theme-base\/runtime\/nt-cart/.test(src)) offenders.push(`${theme}: своё ядро`);
      if (/export const initCartUI = \(\)/.test(src)) offenders.push(`${theme}: свой initCartUI`);
      // Свой компонент окна в порту темы — тоже форк.
      const own = `themes/${theme}/src/components/cart/`;
      if (existsSync(resolve(ROOT, own))) offenders.push(`${theme}: свой компонент окна`);
    }
    expect(offenders).toEqual([]);
  });

  it('8. у переехавших тем storageKey и eventPrefix не менялись', () => {
    for (const theme of THEMES) {
      const src = read(`themes/${theme}/src/lib/cart.ts`);
      expect(src).toContain(`storageKey: "${theme}:cart:v1"`);
      expect(src).toContain(`eventPrefix: "${theme}:cart"`);
    }
  });

  it('9. контракт data-атрибутов окна цел (по нему работает делегат)', () => {
    const src = read(MODAL_ASTRO);
    for (const attr of [
      'data-cart-added-modal',
      'data-cart-modal-card',
      'data-cart-modal-overlay',
      'data-cart-modal-close',
      'data-cart-modal-brand',
      'data-cart-modal-image',
      'data-cart-modal-product-link',
      'data-cart-modal-name',
      'data-cart-modal-volume',
      'data-cart-modal-price',
      'data-cart-modal-cart-link',
      'data-cart-modal-buy-now',
      'data-cart-modal-continue',
    ]) {
      expect(src).toContain(attr);
    }
    // Мёртвый data-continue-href из bloom не вернулся.
    expect(src).not.toContain('data-continue-href');
  });

  it('10. «Купить сейчас» ведёт на оформление ровно как у rose', () => {
    const modal = read(MODAL_RUNTIME);
    const roseReference = read('packages/theme-base/blocks/Product/Product.astro');
    // Эталон rose: её PDP — общий блок Product, его buy-now чистит <тема>:buynow
    // и уходит на /checkout (в iframe — через нав-агента).
    expect(roseReference).toMatch(/buynow/);
    expect(roseReference).toMatch(/'\/checkout'/);
    expect(modal).toMatch(/:buynow`/);
    expect(modal).toMatch(/"\/checkout"/);
    expect(modal).toMatch(/postMessage\(\{ type: "navigate", path: "\/checkout" \}/);
  });
});
