/**
 * Баг владельца 16.09 (пачка b41, только vanilla):
 *
 * 1) «Мультиколонны Vanilla — не применяется цветовая схема к Контейнеру, как
 *    в Rose должно работать, берёт несуществующий цвет для контейнера и
 *    непонятно откуда». Причина: `packages/theme-vanilla/theme.json` держал
 *    `--color-surface` РАВНЫМ `--color-bg` в КАЖДОЙ из 4 схем (в отличие от
 *    rose, где они всегда разные) — карточка «Контейнер» у MultiColumns
 *    (`bg-[rgb(var(--color-surface))]`) сливалась с фоном секции: цвет как бы
 *    «не применялся». А если мерчант правит схему через конструктор и
 *    сохранённый объект не несёт `surfaceBg` (админ-редактор его вообще не
 *    показывает — «Четыре токена Схемы 1 и ничего сверх», tokens-css.ts),
 *    `--color-surface` пропадает из правила схемы целиком и берётся из
 *    ОБЩЕГО (для всех тем) `BASE_DEFAULTS` (`packages/theme-contract/tokens/
 *    base-defaults.ts` → `250 250 250`) — цвет, которого нет НИ В ОДНОЙ схеме
 *    vanilla (38 49 28 / 58 69 48 / 238 238 238 / 255 255 255). Это и есть
 *    «непонятно откуда».
 *
 * 2) «Корзина Vanilla — не применяется цветовая схема к кнопке и при
 *    наведении» + «Избранное Vanilla — не применяется цветовая схема к кнопке
 *    при наведении». Причина: `.vanilla-button-cart`/`.vanilla-button-wishlist`
 *    красят ТЕКСТ переменной `--vanilla-button-text` (или литералом
 *    `#ffffff` у Избранного), а ремап `--vanilla-* → --color-*` для секций
 *    `cart-section`/`wishlist-section` (themes/vanilla/src/styles/global.css)
 *    объявлял только `--vanilla-header-bg` (фон кнопки) — ТЕКСТ кнопки не
 *    ремапился нигде и всегда брал литеральный фолбэк #ffffff. На схеме 2
 *    (`--color-button-bg: 255 255 255`, белая кнопка) это давало белый текст
 *    на белой кнопке — кнопка «не читалась» ни в базовом состоянии, ни при
 *    наведении (наведение — просто `opacity`, оно не могло исправить
 *    нечитаемый базовый цвет).
 *
 * 3) «Корзина Vanilla — цена до скидки должна брать цвет текста». Старая
 *    цена в `CartSection.astro` красилась `--vanilla-muted` (приглушённый
 *    серый), а не `--vanilla-dark` (цвет текста, которым покрашены имя
 *    товара и актуальная цена рядом) — по прямому требованию владельца.
 *
 * 4) Наведение (расширенная матрица схем, поток flux — общий корень бага во
 *    всех темах): `.vanilla-button:hover{opacity:.78}` только дербит
 *    прозрачность, роли «Фон / При наведении» и «Текст / При наведении»
 *    схемы (`--color-button-bg-hover`/`--color-button-text-hover`) кнопки
 *    «Продолжить покупки»/«Оформить заказ» (cart-body/cart-summary/
 *    cart-section), «Перейти в каталог» (wishlist-section) и «Смотреть ещё»
 *    (Catalog) не читали вовсе. ЛОВУШКА ПРИ ПОЧИНКЕ (поймана сабораж-циклом
 *    этого гарда): первая попытка положила `:hover`-правило внутри
 *    `@layer base` — оно НЕ срабатывало, потому что базовый (не-hover) цвет
 *    этих кнопок красят unlayered astro-scoped `<style>` секций и Tailwind-
 *    утилита `bg-[var(--vanilla-header-bg)]` (`@layer utilities`), а
 *    unlayered/другой-named-layer правило ВСЕГДА старше `@layer base`
 *    независимо от специфичности и `:hover`. Правило обязано быть unlayered
 *    (рядом с уже так живущими `.auth-button-primary:hover`/
 *    `.account-button:hover` в этом же файле).
 *
 * Саботаж каждой проверки (откат правки → красный → возврат) описан в
 * отчёте агента, не в этом файле.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTokensCss } from '../tokens-css';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEME_JSON_PATH = resolve(SITES_ROOT, 'packages/theme-vanilla/theme.json');
const GLOBAL_CSS_PATH = resolve(SITES_ROOT, 'themes/vanilla/src/styles/global.css');
const CART_SECTION_PATH = resolve(
  SITES_ROOT,
  'themes/vanilla/src/components/sections/CartSection.astro',
);
const WISHLIST_SECTION_PATH = resolve(
  SITES_ROOT,
  'themes/vanilla/src/components/sections/WishlistSection.astro',
);

describe('MultiColumns «Контейнер»: vanilla обязан красить его отличимым от фона цветом схемы', () => {
  const manifest = JSON.parse(readFileSync(THEME_JSON_PATH, 'utf-8'));
  const schemes = manifest.colorSchemes as Array<{
    id: string;
    tokens: Record<string, string>;
  }>;

  // Схема 5 (26.09) — «олива с белым контуром кнопки» для «Основного текста» и
  // «Изображения с текстом» по вёрстке (scheme-button-defaults.spec.ts).
  it('в theme.json заданы все 5 схем (гард сверяет ровно их)', () => {
    expect(schemes.map((s) => s.id)).toEqual(['scheme-1', 'scheme-2', 'scheme-3', 'scheme-4', 'scheme-5']);
  });

  it.each(schemes.map((s) => [s.id, s.tokens] as const))(
    '%s: --color-surface (карточка «Контейнер») ≠ --color-bg (фон секции) в самом манифесте темы',
    (id, tokens) => {
      expect(tokens['--color-surface']).toBeDefined();
      expect(tokens['--color-surface']).not.toBe(tokens['--color-bg']);
    },
  );

  it('свежий сайт (без правок мерчанта): buildTokensCss тоже даёт разные --color-surface/--color-bg на каждой схеме', () => {
    const css = buildTokensCss({} as never, 'vanilla');
    for (const s of schemes) {
      const n = s.id.replace('scheme-', '');
      const rule = new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(css);
      expect(rule).not.toBeNull();
      const bg = /--color-bg:\s*([^;]+)/.exec(rule![1])?.[1]?.trim();
      const surface = /--color-surface:\s*([^;]+)/.exec(rule![1])?.[1]?.trim();
      expect(surface).toBeDefined();
      expect(surface).not.toBe(bg);
    }
  });

  it('несуществующий цвет 250 250 250 (общий BASE_DEFAULTS всех тем) не течёт ни в одну схему vanilla', () => {
    for (const s of schemes) {
      expect(s.tokens['--color-surface']).not.toBe('250 250 250');
    }
  });
});

describe('Кнопки «Корзины» и «Избранного»: текст обязан читать --color-button-text схемы', () => {
  const globalCss = readFileSync(GLOBAL_CSS_PATH, 'utf-8');
  const cartAstro = readFileSync(CART_SECTION_PATH, 'utf-8');
  const wishlistAstro = readFileSync(WISHLIST_SECTION_PATH, 'utf-8');

  function remapRuleFor(selectorSnippet: string): string {
    const idx = globalCss.indexOf(selectorSnippet);
    expect(idx).toBeGreaterThan(-1);
    const braceOpen = globalCss.indexOf('{', idx);
    const braceClose = globalCss.indexOf('}', braceOpen);
    return globalCss.slice(braceOpen + 1, braceClose);
  }

  it('ремап [data-block="cart-section"]/[data-block="wishlist-section"] объявляет --vanilla-button-text', () => {
    const rule = remapRuleFor('[data-block="cart-section"]');
    expect(rule).toMatch(/--vanilla-button-text:\s*rgb\(var\(--color-button-text\)\)/);
  });

  it('.vanilla-button-cart читает переменную (не голый литерал) — CartSection.astro', () => {
    const m = /\.vanilla-button-cart\s*\{([^}]*)\}/.exec(cartAstro);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--vanilla-button-text/);
    expect(m![1]).not.toMatch(/color:\s*#ffffff\s*;/);
  });

  it('.vanilla-button-wishlist читает переменную, а не жёсткий #ffffff — WishlistSection.astro', () => {
    const m = /\.vanilla-button-wishlist\s*\{([^}]*)\}/.exec(wishlistAstro);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/color:\s*var\(--vanilla-button-text/);
    expect(m![1]).not.toMatch(/color:\s*#ffffff\s*;/);
  });

  it('на схеме 2 (button-bg=белый, button-text=тёмно-зелёный) текст кнопки не остаётся белым', () => {
    const css = buildTokensCss({} as never, 'vanilla');
    const rule = /\.color-scheme-2\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    const buttonBg = /--color-button-bg:\s*([^;]+)/.exec(rule![1])?.[1]?.trim();
    const buttonText = /--color-button-text:\s*([^;]+)/.exec(rule![1])?.[1]?.trim();
    expect(buttonBg).toBe('255 255 255');
    // Живая проверка контраста: фон и текст кнопки не совпадают на схеме 2 —
    // именно это совпадение (255 255 255 / 255 255 255 из-за литерала
    // #ffffff) делало кнопку нечитаемой.
    expect(buttonText).not.toBe(buttonBg);
    expect(buttonText).toBe('58 69 48');
  });
});

describe('Секция «Корзина»: цена до скидки берёт цвет текста, а не приглушённый', () => {
  const cartAstro = readFileSync(CART_SECTION_PATH, 'utf-8');

  it('oldPriceHtml красит зачёркнутую цену --vanilla-dark (цвет текста), не --vanilla-muted', () => {
    const m = /oldPriceHtml\s*=[\s\S]*?line-through[\s\S]*?;/.exec(cartAstro);
    expect(m).not.toBeNull();
    const snippet = m![0];
    expect(snippet).toMatch(/text-\[var\(--vanilla-dark\)\]/);
    expect(snippet).not.toMatch(/text-\[var\(--vanilla-muted\)\]/);
  });

  it('старая цена и актуальная цена в строке товара окрашены одним и тем же токеном', () => {
    const oldPriceMatch = /oldPriceHtml\s*=[\s\S]*?(text-\[var\(--vanilla-[a-z]+\)\])[\s\S]*?;/.exec(
      cartAstro,
    );
    const currentPriceMatch = /formatCartPrice\(line\.price \* line\.quantity\)/.exec(cartAstro);
    expect(oldPriceMatch).not.toBeNull();
    expect(currentPriceMatch).not.toBeNull();
    // Актуальная цена (строка сразу перед formatCartPrice(line.price...)) —
    // проверяем, что её класс несёт тот же токен, что и старая.
    const beforeCurrentPrice = cartAstro.slice(
      Math.max(0, currentPriceMatch!.index - 200),
      currentPriceMatch!.index,
    );
    expect(beforeCurrentPrice).toMatch(/text-\[var\(--vanilla-dark\)\]/);
    expect(oldPriceMatch![1]).toBe('text-[var(--vanilla-dark)]');
  });
});

describe('Наведение на кнопки схемы (Корзина/Избранное/Каталог): цвет hover, не только дим', () => {
  const globalCss = readFileSync(GLOBAL_CSS_PATH, 'utf-8');

  /** true, если позиция `pos` в исходнике лежит ВНУТРИ какого-нибудь `@layer base { … }`. */
  function isInsideNamedLayer(css: string, pos: number): boolean {
    let depth = 0;
    let layerDepth: number | null = null;
    for (let i = 0; i < pos; i++) {
      const ch = css[i];
      if (ch === '{') {
        const lineStart = css.lastIndexOf('\n', i) + 1;
        const opener = css.slice(lineStart, i).trim();
        if (/^@layer\s+base\b/.test(opener) && layerDepth === null) {
          layerDepth = depth;
        }
        depth++;
      } else if (ch === '}') {
        depth--;
        if (layerDepth !== null && depth === layerDepth) layerDepth = null;
      }
    }
    return layerDepth !== null;
  }

  /**
   * ⚠️ ЭТОТ ГАРД БЫЛ МЁРТВ. До 17.09 обе проверки искали в файле строку
   * `[data-block="cart-body"][class*="color-scheme-"] .vanilla-button-cart:hover`
   * — форму селектора, которой в `global.css` не было НИ ОДНОГО дня после
   * того, как правило переписали на `:is(…)` ради `check:css-layers`.
   * `indexOf` возвращал −1, `expect(idx).toBeGreaterThan(-1)` падал, и суита
   * просто числилась красной, ничего не сторожа. Привязка к ТЕКСТУ селектора
   * и есть ловушка: правило имеет право менять форму, а сторожить надо
   * СВОЙСТВА — какие роли объявлены, на какие классы, и лежит ли правило вне
   * слоя. Ниже проверки переписаны именно так и проверены саботажем.
   *
   * Текущая форма (17.09): `:is(…)` снят — браузер его читал, а сканер схем
   * (`scheme-matrix.mjs`) разворачивает `:is()` подстановкой и на комбинаторе
   * внутри получал бессмыслицу, из-за чего четыре мишени «Корзины» числились
   * замершими. Обводка зоны не нужна: эти классы живут только в своих блоках.
   */
  const HOVER_SEL = '.vanilla-button-cart:hover';

  /** Правило наведения целиком: от первого селектора до закрывающей скобки. */
  function hoverRule(): { selectors: string; body: string; at: number } {
    const at = globalCss.indexOf(HOVER_SEL);
    const braceOpen = globalCss.indexOf('{', at);
    const braceClose = globalCss.indexOf('}', braceOpen);
    return {
      at,
      selectors: globalCss.slice(at, braceOpen),
      body: globalCss.slice(braceOpen + 1, braceClose),
    };
  }

  it('правило hover покрывает корзину, избранное и «Смотреть ещё» и объявляет обе роли hover', () => {
    const { at, selectors, body } = hoverRule();
    expect(at).toBeGreaterThan(-1);
    expect(selectors).toContain('.vanilla-button-wishlist:hover');
    expect(selectors).toContain('.vanilla-button-load-more:hover');
    expect(body).toMatch(/background-color:\s*rgb\(var\(--color-button-bg-hover/);
    expect(body).toMatch(/color:\s*rgb\(var\(--color-button-text-hover/);
  });

  it('ЛОВУШКА: правило hover обязано быть unlayered — иначе astro-scoped <style> и Tailwind @layer utilities его перебивают', () => {
    const { at } = hoverRule();
    expect(at).toBeGreaterThan(-1);
    expect(isInsideNamedLayer(globalCss, at)).toBe(false);
  });

  it('класс .vanilla-button-load-more действительно стоит на кнопке «Смотреть ещё» — правило не осиротело', () => {
    // Без этой проверки селектор можно переименовать в что угодно, и гард
    // выше останется зелёным, сторожа правило, которое ни на что не попадает.
    const catalog = readFileSync(
      resolve(SITES_ROOT, 'packages/theme-vanilla/blocks/Catalog/Catalog.astro'),
      'utf-8',
    );
    const buttons = catalog.match(/<button[^>]*data-action="load-more"[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toContain('vanilla-button-load-more');
  });

  it('для сравнения: уже рабочий .account-button:hover в этом файле ТОЖЕ unlayered (не ложное правило проверки)', () => {
    const idx = globalCss.indexOf('.account-button:hover');
    expect(idx).toBeGreaterThan(-1);
    expect(isInsideNamedLayer(globalCss, idx)).toBe(false);
  });
});
