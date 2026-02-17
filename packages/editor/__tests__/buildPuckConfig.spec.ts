import { describe, it, expect } from 'vitest';
import { buildPuckConfig, type RegistryEntry } from '../lib/buildPuckConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    name: 'TestComponent',
    label: 'Test Component',
    category: 'basic',
    schema: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('buildPuckConfig', () => {
  // ---- basic structure ----

  it('returns a Config with components and root', () => {
    const config = buildPuckConfig([]);
    expect(config).toHaveProperty('components');
    expect(config).toHaveProperty('root');
    expect(typeof config.root.render).toBe('function');
  });

  it('maps each registry entry to a component key', () => {
    const entries: RegistryEntry[] = [
      makeEntry({ name: 'Hero', label: 'Hero Block' }),
      makeEntry({ name: 'Footer', label: 'Footer Block' }),
    ];
    const config = buildPuckConfig(entries);
    expect(Object.keys(config.components)).toEqual(['Hero', 'Footer']);
  });

  it('uses entry.label as component label', () => {
    const config = buildPuckConfig([
      makeEntry({ name: 'Banner', label: 'Promo Banner' }),
    ]);
    expect(config.components['Banner'].label).toBe('Promo Banner');
  });

  // ---- field conversion ----

  it('converts text field', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          title: { type: 'text', label: 'Title' },
        },
      }),
    ]);
    const fields = config.components['A'].fields!;
    expect(fields['title']).toEqual({ type: 'text', label: 'Title' });
  });

  it('converts textarea field', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          body: { type: 'textarea', label: 'Body' },
        },
      }),
    ]);
    expect(config.components['A'].fields!['body']).toEqual({
      type: 'textarea',
      label: 'Body',
    });
  });

  it('converts number field with min/max', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          count: { type: 'number', label: 'Count', min: 1, max: 10 },
        },
      }),
    ]);
    expect(config.components['A'].fields!['count']).toEqual({
      type: 'number',
      label: 'Count',
      min: 1,
      max: 10,
    });
  });

  it('converts select field with options', () => {
    const options = [
      { label: 'Small', value: 'sm' },
      { label: 'Large', value: 'lg' },
    ];
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          size: { type: 'select', label: 'Size', options },
        },
      }),
    ]);
    expect(config.components['A'].fields!['size']).toEqual({
      type: 'select',
      label: 'Size',
      options,
    });
  });

  it('converts radio field with options', () => {
    const options = [
      { label: 'Left', value: 'left' },
      { label: 'Right', value: 'right' },
    ];
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          align: { type: 'radio', label: 'Alignment', options },
        },
      }),
    ]);
    expect(config.components['A'].fields!['align']).toEqual({
      type: 'radio',
      label: 'Alignment',
      options,
    });
  });

  it('converts color field', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          bg: { type: 'color', label: 'Background' },
        },
      }),
    ]);
    expect(config.components['A'].fields!['bg']).toEqual({
      type: 'color',
      label: 'Background',
    });
  });

  it('converts object field with nested fields', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          cta: {
            type: 'object',
            label: 'CTA',
            objectFields: {
              text: { type: 'text', label: 'Text' },
              url: { type: 'text', label: 'URL' },
            },
          },
        },
      }),
    ]);
    const ctaField = config.components['A'].fields!['cta'] as any;
    expect(ctaField.type).toBe('object');
    expect(ctaField.label).toBe('CTA');
    expect(ctaField.objectFields.text).toEqual({ type: 'text', label: 'Text' });
    expect(ctaField.objectFields.url).toEqual({ type: 'text', label: 'URL' });
  });

  it('converts array field with nested fields and getItemSummary', () => {
    const getItemSummary = (item: any) => item.title;
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          items: {
            type: 'array',
            label: 'Items',
            arrayFields: {
              title: { type: 'text', label: 'Title' },
            },
            getItemSummary,
          },
        },
      }),
    ]);
    const arrayField = config.components['A'].fields!['items'] as any;
    expect(arrayField.type).toBe('array');
    expect(arrayField.label).toBe('Items');
    expect(arrayField.arrayFields.title).toEqual({ type: 'text', label: 'Title' });
    expect(arrayField.getItemSummary).toBe(getItemSummary);
  });

  it('converts external field', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          product: { type: 'external', label: 'Select Product' },
        },
      }),
    ]);
    expect(config.components['A'].fields!['product']).toEqual({
      type: 'external',
      label: 'Select Product',
    });
  });

  it('falls back to text for unknown field type', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          mystery: { type: 'custom' as any, label: 'Mystery' },
        },
      }),
    ]);
    expect(config.components['A'].fields!['mystery']).toEqual({
      type: 'text',
      label: 'Mystery',
    });
  });

  // ---- default props ----

  it('passes defaultProps through', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'Hero',
        defaultProps: { title: 'Hello World' },
      }),
    ]);
    expect(config.components['Hero'].defaultProps).toEqual({ title: 'Hello World' });
  });

  it('defaults defaultProps to empty object when not provided', () => {
    const config = buildPuckConfig([makeEntry({ name: 'Hero' })]);
    expect(config.components['Hero'].defaultProps).toEqual({});
  });

  // ---- features filtering ----

  it('includes component when requiredFeature is enabled', () => {
    const config = buildPuckConfig(
      [
        makeEntry({
          name: 'PremiumBlock',
          puckConfig: { requiredFeature: 'premium' },
        }),
      ],
      { premium: true },
    );
    expect(config.components).toHaveProperty('PremiumBlock');
  });

  it('excludes component when requiredFeature is disabled', () => {
    const config = buildPuckConfig(
      [
        makeEntry({
          name: 'PremiumBlock',
          puckConfig: { requiredFeature: 'premium' },
        }),
      ],
      { premium: false },
    );
    expect(config.components).not.toHaveProperty('PremiumBlock');
  });

  it('includes component when no features map provided (features undefined)', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'PremiumBlock',
        puckConfig: { requiredFeature: 'premium' },
      }),
    ]);
    expect(config.components).not.toHaveProperty('PremiumBlock');
  });

  it('includes component without requiredFeature regardless of features map', () => {
    const config = buildPuckConfig(
      [makeEntry({ name: 'Basic' })],
      { premium: false },
    );
    expect(config.components).toHaveProperty('Basic');
  });

  // ---- multiple fields ----

  it('handles multiple fields on one component', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'Card',
        schema: {
          title: { type: 'text', label: 'Title' },
          description: { type: 'textarea', label: 'Description' },
          color: { type: 'color', label: 'Color' },
        },
      }),
    ]);
    const fields = config.components['Card'].fields!;
    expect(Object.keys(fields)).toEqual(['title', 'description', 'color']);
  });

  // ---- edge cases ----

  it('returns empty components for empty registry', () => {
    const config = buildPuckConfig([]);
    expect(Object.keys(config.components)).toHaveLength(0);
  });

  it('handles entry with empty schema', () => {
    const config = buildPuckConfig([makeEntry({ name: 'Empty', schema: {} })]);
    expect(config.components['Empty'].fields).toEqual({});
  });

  it('handles object field with no objectFields', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          nested: { type: 'object', label: 'Nested' },
        },
      }),
    ]);
    const field = config.components['A'].fields!['nested'] as any;
    expect(field.type).toBe('object');
    expect(field.objectFields).toEqual({});
  });

  it('handles array field with no arrayFields', () => {
    const config = buildPuckConfig([
      makeEntry({
        name: 'A',
        schema: {
          list: { type: 'array', label: 'List' },
        },
      }),
    ]);
    const field = config.components['A'].fields!['list'] as any;
    expect(field.type).toBe('array');
    expect(field.arrayFields).toEqual({});
  });
});
