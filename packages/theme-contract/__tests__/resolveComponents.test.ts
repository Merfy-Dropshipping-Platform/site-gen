import { resolveComponents } from '../lib/resolveComponents.js';
import type { ComponentRegistryEntry, ThemeFeatures } from '../types.js';

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

describe('resolveComponents', () => {
  it('returns all components when no features are required', () => {
    const components: ComponentRegistryEntry[] = [
      makeEntry({ name: 'HeroBanner' }),
      makeEntry({ name: 'Footer' }),
    ];
    const features: ThemeFeatures = {};

    const result = resolveComponents(components, features);

    expect(result).toHaveLength(2);
    expect(result.map(c => c.name)).toEqual(['HeroBanner', 'Footer']);
  });

  it('filters out components whose required features are not enabled', () => {
    const components: ComponentRegistryEntry[] = [
      makeEntry({ name: 'HeroBanner' }),
      makeEntry({ name: 'SizeGuide', requiredFeatures: ['sizeGuide'] }),
      makeEntry({ name: 'ColorSwatches', requiredFeatures: ['colorSwatches'] }),
    ];
    const features: ThemeFeatures = {
      sizeGuide: false,
      colorSwatches: true,
    };

    const result = resolveComponents(components, features);

    expect(result).toHaveLength(2);
    expect(result.map(c => c.name)).toEqual(['HeroBanner', 'ColorSwatches']);
  });

  it('requires ALL features to be true for components with multiple required features', () => {
    const components: ComponentRegistryEntry[] = [
      makeEntry({
        name: 'AdvancedFilter',
        requiredFeatures: ['filterSidebar', 'colorSwatches'],
      }),
    ];

    // Only one feature enabled
    expect(resolveComponents(components, { filterSidebar: true, colorSwatches: false }))
      .toHaveLength(0);

    // Both features enabled
    expect(resolveComponents(components, { filterSidebar: true, colorSwatches: true }))
      .toHaveLength(1);
  });

  it('treats missing features as not enabled', () => {
    const components: ComponentRegistryEntry[] = [
      makeEntry({ name: 'Wishlist', requiredFeatures: ['wishlist'] }),
    ];
    // wishlist not even present in features
    const features: ThemeFeatures = { search: true };

    const result = resolveComponents(components, features);

    expect(result).toHaveLength(0);
  });

  it('handles empty component array', () => {
    const result = resolveComponents([], { search: true });
    expect(result).toEqual([]);
  });

  it('handles components with undefined requiredFeatures', () => {
    const components: ComponentRegistryEntry[] = [
      makeEntry({ name: 'Basic', requiredFeatures: undefined }),
    ];
    const result = resolveComponents(components, {});
    expect(result).toHaveLength(1);
  });
});
