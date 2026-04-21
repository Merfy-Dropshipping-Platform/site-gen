import { resolveConstructorConfig } from '../resolver/resolveConstructorConfig';

describe('resolveConstructorConfig', () => {
  it('collects puckConfig from each block into Puck components map', async () => {
    const resolvedBlocks = {
      Hero: { source: 'base' as const, path: 'fake-path-hero' },
    };
    const loader = jest.fn().mockImplementation(async (p: string) => {
      if (p === 'fake-path-hero') {
        return { HeroPuckConfig: { label: 'Hero', category: 'hero', fields: { title: { type: 'text' } }, defaults: { title: '' }, schema: {} } };
      }
      throw new Error('unexpected');
    });

    const config = await resolveConstructorConfig(resolvedBlocks, loader);
    expect(config.components.Hero).toBeDefined();
    expect(config.components.Hero.label).toBe('Hero');
    expect(config.components.Hero.fields).toEqual({ title: { type: 'text' } });
    expect(config.components.Hero.defaultProps).toEqual({ title: '' });
    expect(typeof config.components.Hero.render).toBe('function');
  });

  it('groups components by category', async () => {
    const resolvedBlocks = {
      Hero:   { source: 'base' as const, path: 'p1' },
      Footer: { source: 'base' as const, path: 'p2' },
    };
    const loader = jest.fn().mockImplementation(async (p: string) => {
      if (p === 'p1') return { HeroPuckConfig: { label: 'Hero', category: 'hero', fields: {}, defaults: {}, schema: {} } };
      return { FooterPuckConfig: { label: 'Footer', category: 'layout', fields: {}, defaults: {}, schema: {} } };
    });

    const config = await resolveConstructorConfig(resolvedBlocks, loader);
    expect(config.categories?.hero?.components).toContain('Hero');
    expect(config.categories?.layout?.components).toContain('Footer');
  });

  it('throws when a loaded module does not export <Name>PuckConfig', async () => {
    const resolvedBlocks = {
      Hero: { source: 'base' as const, path: 'p' },
    };
    const loader = async () => ({ /* no HeroPuckConfig export */ });
    await expect(resolveConstructorConfig(resolvedBlocks, loader)).rejects.toThrow(/HeroPuckConfig/);
  });
});
