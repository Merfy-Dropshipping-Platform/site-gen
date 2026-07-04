import { buildTokensCss } from '../tokens-css';

/**
 * Регрессия: часть портов верстала заголовки секций/карточек через body-класс
 * `font-manrope` (→ var(--font-body)) → «Шрифт заголовка» до них не доходил
 * (заголовок рендерился шрифтом тела). Форсим роль по тегу в buildTokensCss,
 * гейт на «мерчант задал шрифт» → дефолт тем не трогаем.
 */
describe('font-role override', () => {
  it('injects heading/body font rules when merchant set fonts', () => {
    const css = buildTokensCss({ headingFont: 'oswald', bodyFont: 'exo-2' }, 'rose');
    expect(css).toMatch(/main h1\[class\][^}]*font-family:var\(--font-heading\) !important/);
    expect(css).toMatch(/main p\[class\][^}]*font-family:var\(--font-body\) !important/);
  });
  it('does NOT inject when fonts are default (preserve theme look)', () => {
    const css = buildTokensCss({}, 'rose');
    expect(css).not.toMatch(/font-family:var\(--font-heading\) !important/);
    expect(css).not.toMatch(/font-family:var\(--font-body\) !important/);
  });
});
