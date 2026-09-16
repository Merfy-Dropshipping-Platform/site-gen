/**
 * Баг-репорт владельца (16.09, п.1), дословно: «чекаут нигде не должен
 * применяться цвет текста и заголовка. Идут только от нас. Цвет текста
 * только к юр инфе.»
 *
 * ДО правки: «Цветовая схема» узлов «Оформление заказа»/«Сводка заказа»/
 * «Шапка оформления» — обычное Puck-поле (канон, не трогаем); когда мерчант
 * выбирал там реальную схему 1..5, `chrome-assembler.patchCheckoutColumnScheme`
 * / `patchCheckoutBlockScheme` стамповали `.color-scheme-N` прямо на колонку/
 * кнопку/шапку — а `.color-scheme-N` объявляет ВСЕ токены схемы разом,
 * включая `--color-text`/`--color-heading`. Заголовки полей формы, итоги,
 * шапка — всё красилось в текст/заголовок выбранной схемы, хотя чекаут
 * обязан быть платформенной типографикой.
 *
 * ПОСЛЕ: CHECKOUT_TYPOGRAPHY_LOCK_CSS (tokens-css.ts) форсит
 * `--color-text`/`--color-heading` платформенным чёрным на каждом узле,
 * который может нести merchant `.color-scheme-N` — КРОМЕ юр.инфы
 * (`checkout-terms`), где текстовый цвет по требованию владельца остаётся
 * из схемы. Заголовок форсится и там (в юр.инфе заголовков нет, но
 * инвариант «заголовок только платформенный» держим без исключений).
 */
import { buildTokensCss, CHECKOUT_TYPOGRAPHY_LOCK_CSS } from '../tokens-css';

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

function grabRule(css: string, selectorSubstring: string): string | null {
  const idx = css.indexOf(selectorSubstring);
  if (idx === -1) return null;
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

describe('CHECKOUT_TYPOGRAPHY_LOCK_CSS — константа, эмитится buildTokensCss на всех пяти темах', () => {
  it.each(THEMES)('тема %s: buildTokensCss эмитит правило блокировки --color-heading', (theme) => {
    const css = buildTokensCss({}, theme);
    expect(css).toContain(CHECKOUT_TYPOGRAPHY_LOCK_CSS);
  });

  it('правило одинаково байт-в-байт независимо от themeSettings/themeId (платформенная константа)', () => {
    const variants = THEMES.map((theme) => {
      const css = buildTokensCss({ headingFont: 'inter', bodyFont: 'roboto' }, theme);
      const idx = css.indexOf(CHECKOUT_TYPOGRAPHY_LOCK_CSS);
      return idx === -1 ? null : css.slice(idx, idx + CHECKOUT_TYPOGRAPHY_LOCK_CSS.length);
    });
    expect(new Set(variants).size).toBe(1);
    expect(variants[0]).not.toBeNull();
  });
});

describe('CHECKOUT_TYPOGRAPHY_LOCK_CSS — состав правила', () => {
  it('--color-heading заблокирован на форме/сводке/кнопке/шапке И на юр.инфе (без исключений)', () => {
    for (const sel of [
      '[data-checkout-pane]',
      '[data-checkout-slot="header"]',
      '[data-block="checkout-summary"]',
      '[data-block="checkout-submit"]',
      '[data-block="checkout-terms"]',
    ]) {
      expect(CHECKOUT_TYPOGRAPHY_LOCK_CSS).toContain(sel);
    }
    const headingBody = grabRule(CHECKOUT_TYPOGRAPHY_LOCK_CSS, '{--color-heading');
    expect(headingBody).toBe('--color-heading:0 0 0!important');
  });

  it('--color-text заблокирован ВЕЗДЕ, КРОМЕ юр.инфы — «Цвет текста только к юр инфе»', () => {
    // Второе правило файла — только --color-text. Извлекаем его целиком (после
    // первого правила) и проверяем состав селекторов явно.
    const secondRuleStart = CHECKOUT_TYPOGRAPHY_LOCK_CSS.indexOf(
      '}',
      CHECKOUT_TYPOGRAPHY_LOCK_CSS.indexOf('--color-heading'),
    ) + 1;
    const textRuleSelectors = CHECKOUT_TYPOGRAPHY_LOCK_CSS.slice(
      secondRuleStart,
      CHECKOUT_TYPOGRAPHY_LOCK_CSS.indexOf('{', secondRuleStart),
    );
    expect(textRuleSelectors).toContain('[data-checkout-pane]');
    expect(textRuleSelectors).toContain('[data-checkout-slot="header"]');
    expect(textRuleSelectors).toContain('[data-block="checkout-summary"]');
    expect(textRuleSelectors).toContain('[data-block="checkout-submit"]');
    // Юр.инфа — НЕ в списке селекторов --color-text.
    expect(textRuleSelectors).not.toContain('checkout-terms');
    const textBody = grabRule(CHECKOUT_TYPOGRAPHY_LOCK_CSS.slice(secondRuleStart), '{--color-text');
    expect(textBody).toBe('--color-text:0 0 0!important');
  });

  it('значение совпадает с CHECKOUT_SCHEME_CSS (0 0 0) — тот же платформенный чёрный, не новая константа', () => {
    expect(CHECKOUT_TYPOGRAPHY_LOCK_CSS).toContain(':0 0 0!important');
    expect(CHECKOUT_TYPOGRAPHY_LOCK_CSS).not.toMatch(/[1-9]\d*\s\d+\s\d+!important/);
  });

  it('!important на обоих правилах — гарантия победы над .color-scheme-N независимо от порядка CSS', () => {
    const importantCount = (CHECKOUT_TYPOGRAPHY_LOCK_CSS.match(/!important/g) || []).length;
    expect(importantCount).toBe(2);
  });
});

describe('buildTokensCss — правило идёт ПОСЛЕ мерчантских .color-scheme-N (порядок инвертирован, но !important делает это неважным)', () => {
  it.each(THEMES)('тема %s: CHECKOUT_TYPOGRAPHY_LOCK_CSS присутствует в финальном CSS ровно один раз', (theme) => {
    const css = buildTokensCss({}, theme);
    const occurrences = css.split(CHECKOUT_TYPOGRAPHY_LOCK_CSS).length - 1;
    expect(occurrences).toBe(1);
  });
});
