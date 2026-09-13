import { buildTokensCss } from '../tokens-css';

/**
 * Пункт 4 пачки тестировщика (13.09), вторая половина: «под всеми параметрами
 * [вкладки «Карточки товара»] добавить выбор цветовой схемы, как в сайдбарах».
 *
 * Настройка обязана КРАСИТЬ карточку, а не просто сохраняться: мёртвых полей в
 * панели быть не должно. Канал тот же, что у остальных настроек темы —
 * themeSettings → buildTokensCss → tokens.css (один и тот же файл собирает и
 * превью конструктора, и витрину).
 *
 * Селектор `[data-nt$="-product-card"]` — общий маркер карточки во всех пяти
 * темах (rose/flux/vanilla/bloom/satin ставят его и в SSR, и в клиентских
 * дорисовках: storefront-hydrate, wishlist).
 *
 * Замер «до»: слова `productCardScheme` в tokens-css.ts не было вовсе —
 * выбранная схема никуда не доезжала.
 */
const scheme = (
  n: number,
  bg: string,
  surface: string,
  text: string,
) => ({
  id: `scheme-${n}`,
  name: String(n),
  background: bg,
  surfaceBg: surface,
  heading: text,
  text,
  primaryButton: { background: text, text: bg },
  secondaryButton: { background: surface, text },
});

const SCHEMES = [
  scheme(1, '#ffffff', '#f5f5f5', '#000000'),
  scheme(2, '#f4f1ec', '#ffffff', '#111111'),
  scheme(3, '#111111', '#222222', '#ffffff'),
];

/** Правило для карточки товара целиком (или '' если его нет). */
function cardRule(css: string): string {
  const at = css.indexOf('[data-nt$="-product-card"]');
  if (at < 0) return '';
  const end = css.indexOf('}', at);
  return css.slice(at, end + 1);
}

describe('Настройки темы → «Карточки товара» → цветовая схема', () => {
  it('без выбора схемы правило не появляется (ноль регрессии у существующих сайтов)', () => {
    const css = buildTokensCss({ colorSchemes: SCHEMES }, 'rose');
    expect(cardRule(css)).toBe('');
  });

  it('выбранная схема красит карточку своими цветами', () => {
    const css = buildTokensCss(
      { colorSchemes: SCHEMES, productCardScheme: 'scheme-3' },
      'rose',
    );
    const rule = cardRule(css);
    expect(rule).toContain('--color-bg: 17 17 17');
    expect(rule).toContain('--color-surface: 34 34 34');
    expect(rule).toContain('--color-text: 255 255 255');
  });

  it('подложка карточки берёт surface ВЫБРАННОЙ схемы, а не :root', () => {
    // --product-card-bg объявлен в :root и подставляет var() на :root, то есть
    // на карточке остался бы цвет активной схемы сайта. Поэтому правило
    // карточки переобъявляет его у себя.
    const css = buildTokensCss(
      {
        colorSchemes: SCHEMES,
        productCardScheme: 'scheme-3',
        productCardStyle: 'card',
      },
      'rose',
    );
    expect(cardRule(css)).toContain('--product-card-bg:');
  });

  it('стиль «Стандарт» остаётся без подложки даже со схемой', () => {
    const css = buildTokensCss(
      {
        colorSchemes: SCHEMES,
        productCardScheme: 'scheme-2',
        productCardStyle: 'standard',
      },
      'rose',
    );
    expect(cardRule(css)).toContain('--product-card-bg: transparent');
  });

  it('несуществующая схема ничего не ломает', () => {
    const css = buildTokensCss(
      { colorSchemes: SCHEMES, productCardScheme: 'scheme-99' },
      'rose',
    );
    expect(cardRule(css)).toBe('');
  });
});
