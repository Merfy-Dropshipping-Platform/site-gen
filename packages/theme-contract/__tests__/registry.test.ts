import { TOKEN_REGISTRY, type TokenKey } from '../tokens/registry';

describe('TOKEN_REGISTRY', () => {
  it('contains color scheme tokens', () => {
    expect(TOKEN_REGISTRY['--color-bg']).toEqual({ category: 'color', scope: 'scheme' });
    expect(TOKEN_REGISTRY['--color-heading']).toEqual({ category: 'color', scope: 'scheme' });
    expect(TOKEN_REGISTRY['--color-button-bg']).toEqual({ category: 'color', scope: 'scheme' });
  });

  it('contains typography tokens with theme scope', () => {
    expect(TOKEN_REGISTRY['--font-heading']).toEqual({ category: 'font', scope: 'theme' });
    expect(TOKEN_REGISTRY['--font-body']).toEqual({ category: 'font', scope: 'theme' });
  });

  it('contains radius tokens with min/max', () => {
    expect(TOKEN_REGISTRY['--radius-button']).toEqual({
      category: 'radius', unit: 'px', scope: 'theme', min: 0, max: 48,
    });
  });

  it('contains variant tokens with enumerated values', () => {
    const variant = TOKEN_REGISTRY['--footer-layout'];
    expect(variant.category).toBe('variant');
    expect(variant.values).toEqual(['2-part', '3-column', 'stacked-center']);
  });

  it('exports at least 35 tokens', () => {
    expect(Object.keys(TOKEN_REGISTRY).length).toBeGreaterThanOrEqual(35);
  });

  it('TokenKey type derives from registry keys', () => {
    const k: TokenKey = '--color-primary';
    expect(k).toBe('--color-primary');
  });
});
