import { parseTheme, tokensCss } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import themeJson from '../../theme-nova/theme.json';
import { TOKEN_SETS } from '../src/token-sets';

describe('набор токенов base', () => {
  it('71 CSS-переменная: все токены словаря, кроме выбора и схем деталей', () => {
    expect(TOKEN_SETS.base).toHaveLength(71);
    expect(TOKEN_SETS.base).toEqual(
      expect.arrayContaining(['--background', '--font-body', '--text-5xl', '--shadow-card', '--width-page']),
    );
    expect(TOKEN_SETS.base).not.toContain('--choice-card-style');
    expect(TOKEN_SETS.base).not.toContain('--scheme-card');
  });

  it('CSS темы nova объявляет каждую переменную набора — стенд пройдёт tokens-present', () => {
    const theme = parseTheme(themeJson.tokens);
    const css = tokensCss(theme.dictionary, theme.tokens, {});
    const missing = TOKEN_SETS.base.filter((name) => !css.includes(`${name}:`));
    expect(TOKEN_SETS.base.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
