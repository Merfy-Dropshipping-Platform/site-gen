import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Баг-репорт 17: «Правая часть чекаута статична. Ожидаемый: прокручивается
 * вместе с левой при скролле».
 *
 * Замер «до» (превью конструктора, вкладка «Оформление заказа», 1600×900,
 * колесо мыши над превью): форма слева прокручивается, а правая половина —
 * пустое неподвижное полотно: сводка стоит в самом верху растянутой колонки и
 * уезжает за верхнюю кромку первым же оборотом колеса. То же на витрине
 * (`position: static` у `[data-checkout-column="summary"]`, замер на
 * u9fpo33bkmsd.merfy.ru/checkout: sY совпадает с fY на любом scrollY).
 *
 * Лечение: сводка «едет» с покупателем — `position: sticky` на десктопе.
 * Высокая сводка (много позиций) не обрезается: `max-height` + собственный
 * скролл. Одинаково у пяти тем и в зеркале превью (`wrapCheckoutGrid`),
 * иначе конструктор снова разойдётся с витриной.
 */
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;
const ROOT = join(__dirname, '..', '..', '..');

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('сводка чекаута едет вместе с формой (баг 17)', () => {
  describe.each(THEMES)('тема %s', (theme) => {
    const src = () => read(`themes/${theme}/src/pages/checkout.astro`);

    it('колонка сводки помечена для липкости', () => {
      expect(src()).toContain('data-checkout-column="summary"');
    });

    it('на десктопе сводка липкая и прижата к верху', () => {
      const css = src();
      expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
      expect(css).toMatch(/\[data-checkout-column=["']summary["']\][\s\S]{0,400}position:\s*sticky/);
    });

    it('высокая сводка не обрезается — свой скролл вместо срезанного низа', () => {
      const css = src();
      const rule = /\[data-checkout-column=["']summary["']\][\s\S]{0,400}?\}/.exec(css)?.[0] ?? '';
      expect(rule).toMatch(/max-height:/);
      expect(rule).toMatch(/overflow-y:\s*auto/);
    });

    it('липкость включается только на десктопе (мобильная колонка — в потоке)', () => {
      const css = src();
      const i = css.search(/\[data-checkout-column=["']summary["']\][\s\S]{0,400}?position:\s*sticky/);
      expect(i).toBeGreaterThan(-1);
      // Правило обязано лежать ВНУТРИ медиазапроса ≥1024px: между его открытием
      // и правилом не должно быть конца <style> (иначе правило глобальное).
      const before = css.slice(0, i);
      const mediaAt = before.lastIndexOf('@media');
      expect(mediaAt).toBeGreaterThan(-1);
      expect(before.slice(mediaAt)).toMatch(/min-width:\s*1024px/);
      expect(before.slice(mediaAt)).not.toContain('</style>');
    });
  });

  it('превью конструктора — то же правило (зеркало wrapCheckoutGrid)', () => {
    const preview = read('src/services/preview.service.ts');
    const grid = preview.slice(preview.indexOf('wrapCheckoutGrid'));
    expect(grid).toMatch(/\[data-checkout-column=["']summary["']\][\s\S]{0,400}position:\s*sticky/);
  });
});
