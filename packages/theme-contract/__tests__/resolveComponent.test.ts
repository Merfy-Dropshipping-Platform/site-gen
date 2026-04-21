import { resolveComponent } from '../lib/resolveComponent.js';
import type { ComponentRegistryEntry } from '../types.js';

function makeEntry(overrides: Partial<ComponentRegistryEntry> = {}): ComponentRegistryEntry {
  return {
    name: 'TestComponent',
    label: 'Test Component',
    category: 'content',
    puckConfig: {},
    astroTemplate: 'TestComponent.astro',
    schema: {},
    ...overrides,
  };
}

describe('resolveComponent', () => {
  it('returns from themeRegistry when component exists in both registries', () => {
    const themeEntry = makeEntry({ name: 'HeroBanner', label: 'Theme Hero' });
    const baseEntry = makeEntry({ name: 'HeroBanner', label: 'Base Hero' });

    const result = resolveComponent('HeroBanner', [themeEntry], [baseEntry]);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('Theme Hero');
  });

  it('returns from baseRegistry when component only exists there', () => {
    const baseEntry = makeEntry({ name: 'Footer', label: 'Base Footer' });

    const result = resolveComponent('Footer', [], [baseEntry]);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('Base Footer');
  });

  it('returns null when component is not found in either registry', () => {
    const themeEntry = makeEntry({ name: 'HeroBanner' });
    const baseEntry = makeEntry({ name: 'Footer' });

    const result = resolveComponent('NonExistent', [themeEntry], [baseEntry]);

    expect(result).toBeNull();
  });

  it('returns from themeRegistry even if base has more components', () => {
    const themeEntry = makeEntry({ name: 'ProductGrid', label: 'Theme Grid', category: 'products' });
    const baseEntries = [
      makeEntry({ name: 'ProductGrid', label: 'Base Grid', category: 'products' }),
      makeEntry({ name: 'HeroBanner', label: 'Base Hero', category: 'hero' }),
      makeEntry({ name: 'Footer', label: 'Base Footer', category: 'navigation' }),
    ];

    const result = resolveComponent('ProductGrid', [themeEntry], baseEntries);

    expect(result).not.toBeNull();
    expect(result!.label).toBe('Theme Grid');
  });

  it('handles empty registries gracefully', () => {
    const result = resolveComponent('Anything', [], []);
    expect(result).toBeNull();
  });
});
