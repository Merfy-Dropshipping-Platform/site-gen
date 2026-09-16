/**
 * Баг-репорт владельца (16.09, п.2), дословно: «Кнопка не должна применять
 * на себя при наведении цвет кнопки при наведении, но выбранный цвет кнопки
 * должен оживлять когда на него наводишь.»
 *
 * CheckoutSubmit — ОБЩИЙ блок (packages/theme-base), verbatim во всех пяти
 * темах (нет собственных портов кнопки оплаты — Video/CartBody's-подобной
 * развилки здесь нет, registries всех пяти тем зовут его напрямую). Правка —
 * ОДНА, на все пять тем разом.
 *
 * ДО: `CheckoutSubmit.classes.ts` (`buttonFill`) красил `:hover` токенами
 * `--color-button-bg-hover`/`--color-button-text-hover` — «цвет кнопки при
 * наведении» из схемы, ровно то, что запретили.
 * ПОСЛЕ: `buttonFill` несёт маркер `checkout-submit-btn-fill`; hover красит
 * `CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS` (tokens-css.ts) — `color-mix()` из
 * ЕЁ ЖЕ `--color-button-bg` (не отдельного hover-токена).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTokensCss, CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS } from '../tokens-css';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

const CLASSES_SRC = readFileSync(
  resolve(SITES_ROOT, 'packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.classes.ts'),
  'utf-8',
);

describe('CheckoutSubmit.classes.ts (buttonFill) — не читает отдельный hover-токен схемы', () => {
  it('buttonFill НЕ содержит hover:bg-[--color-button-bg-hover] / hover:text-[--color-button-text-hover]', () => {
    const m = /buttonFill:\s*'([^']*)'/.exec(CLASSES_SRC);
    expect(m).not.toBeNull();
    const buttonFill = m![1];
    expect(buttonFill).not.toContain('--color-button-bg-hover');
    expect(buttonFill).not.toContain('--color-button-text-hover');
    expect(buttonFill).not.toMatch(/hover:bg-/);
    expect(buttonFill).not.toMatch(/hover:text-/);
  });

  it('buttonFill несёт маркер checkout-submit-btn-fill (цель CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS)', () => {
    const m = /buttonFill:\s*'([^']*)'/.exec(CLASSES_SRC);
    expect(m![1]).toMatch(/(^|\s)checkout-submit-btn-fill(\s|$)/);
  });

  it('buttonOutline/buttonGradient не тронуты (баг только про fill-кнопку чекаута)', () => {
    const outline = /buttonOutline:\s*'([^']*)'/.exec(CLASSES_SRC)![1];
    const gradient = /buttonGradient:\s*'([^']*)'/.exec(CLASSES_SRC)![1];
    // outline уже осветлял свой --color-text на hover — этот механизм не наш баг, не трогаем.
    expect(outline).toContain('hover:bg-[rgb(var(--color-text)/.06)]');
    expect(outline).not.toContain('checkout-submit-btn-fill');
    expect(gradient).not.toContain('checkout-submit-btn-fill');
  });
});

describe('CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS — «оживление» СВОИМ цветом, не отдельным hover-токеном', () => {
  it('селектор — маркер-класс кнопки, не общий "[data-block=checkout-submit] button"', () => {
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).toContain('.checkout-submit-btn-fill:hover');
  });

  it('источник цвета — --color-button-bg (базовый), НЕ --color-button-bg-hover', () => {
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).toContain('--color-button-bg');
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).not.toContain('--color-button-bg-hover');
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).not.toContain('--color-button-text-hover');
  });

  it('color-mix — работает и на чёрном фоне по умолчанию (Figma 1:13560, brightness() не меняет чистый чёрный)', () => {
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).toMatch(/color-mix\(in srgb,\s*rgb\(var\(--color-button-bg\)\)\s*\d+%,\s*white\)/);
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).not.toContain('brightness(');
  });

  it('!important — гарантирует победу над bg-[--color-button-bg]! (тоже !important) на :hover', () => {
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).toContain('!important');
  });

  it(':not(:disabled) — не оживляет неактивную (серую) кнопку', () => {
    expect(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS).toContain(':not(:disabled)');
  });

  it.each(THEMES)('тема %s: правило эмитится buildTokensCss (общий блок → общий CSS на все пять тем)', (theme) => {
    const css = buildTokensCss({}, theme);
    expect(css).toContain(CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS);
  });
});
