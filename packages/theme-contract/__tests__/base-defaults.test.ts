import { BASE_DEFAULTS } from '../tokens/base-defaults';
import { TOKEN_REGISTRY } from '../tokens/registry';

describe('BASE_DEFAULTS', () => {
  it('defines a default for every token in TOKEN_REGISTRY', () => {
    const missing: string[] = [];
    for (const key of Object.keys(TOKEN_REGISTRY)) {
      if (!(key in BASE_DEFAULTS)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('color defaults are RGB triplets (three space-separated numbers)', () => {
    expect(BASE_DEFAULTS['--color-bg']).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    expect(BASE_DEFAULTS['--color-heading']).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });

  it('radius defaults have px unit', () => {
    expect(BASE_DEFAULTS['--radius-button']).toMatch(/^\d+px$/);
  });

  it('variant defaults are one of the enumerated values', () => {
    const allowed = TOKEN_REGISTRY['--footer-layout'].values!;
    expect(allowed).toContain(BASE_DEFAULTS['--footer-layout']);
  });
});
