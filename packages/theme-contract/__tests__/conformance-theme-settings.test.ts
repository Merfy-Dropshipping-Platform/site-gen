import { inventoryThemeSettings } from '../conformance/theme-settings-inventory';
import type { ThemeSettingsInput } from '../conformance/theme-settings-inventory';
import type { CapabilityRecord } from '../conformance/types';

// A normalizer structurally compatible with the real themeSchemeToMerchantShape.
function fakeMerchantShape(scheme: {
  id: string;
  name: string;
  tokens: Record<string, string>;
}): Record<string, unknown> {
  const t = scheme.tokens;
  const rgb = (v: string | undefined): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const parts = v.trim().split(/\s+/).map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
  };
  return {
    id: scheme.id,
    name: scheme.name,
    background: rgb(t['--color-bg']),
    primaryButton: {
      background: rgb(t['--color-button-bg']),
      text: rgb(t['--color-button-text']),
    },
  };
}

function baseInput(): ThemeSettingsInput {
  return {
    theme: 'bloom',
    tokens: {
      '--radius-button': '100px',
      '--container-max-width': '1320px',
    },
    schemes: [
      {
        id: 'scheme-1',
        name: 'Основная',
        tokens: {
          '--color-bg': '255 255 255',
          '--color-button-bg': '17 17 17',
          '--color-button-text': '255 255 255',
        },
      },
      {
        id: 'scheme-2',
        name: 'Тёмная',
        tokens: {
          '--color-bg': '0 0 0',
          '--color-button-bg': '255 255 255',
          '--color-button-text': '0 0 0',
        },
      },
    ],
    manifestConstraints: {
      // theme-level manifest constraint rows
      colorSchemes: { max: 4 },
    },
    normalizeMerchantShape: fakeMerchantShape,
  };
}

function byId(rows: CapabilityRecord[]): Map<string, CapabilityRecord> {
  return new Map(rows.map((r) => [r.id, r]));
}

describe('inventoryThemeSettings — per-token rows', () => {
  it('emits an individual token row per manifest/runtime default token', () => {
    const rows = inventoryThemeSettings(baseInput());
    const radius = byId(rows).get('bloom.theme-setting.token.--radius-button')!;
    expect(radius).toBeDefined();
    expect(radius.surface).toBe('theme-setting');
    expect(radius.defaultValue).toBe('100px');
    expect(byId(rows).has('bloom.theme-setting.token.--container-max-width')).toBe(true);
  });

  it('token rows start UNKNOWN (editable effect not yet proven)', () => {
    const rows = inventoryThemeSettings(baseInput());
    expect(
      byId(rows).get('bloom.theme-setting.token.--radius-button')!.status,
    ).toBe('UNKNOWN');
  });
});

describe('inventoryThemeSettings — never one opaque row per scheme', () => {
  it('emits a per-scheme name row', () => {
    const rows = inventoryThemeSettings(baseInput());
    const name = byId(rows).get('bloom.theme-setting.color-scheme.scheme-1.name')!;
    expect(name).toBeDefined();
    expect(name.defaultValue).toBe('Основная');
  });

  it('emits a per-scheme raw manifest token row for every scheme token', () => {
    const rows = inventoryThemeSettings(baseInput());
    const bg = byId(rows).get(
      'bloom.theme-setting.color-scheme.scheme-1.token.--color-bg',
    )!;
    expect(bg).toBeDefined();
    expect(bg.defaultValue).toBe('255 255 255');
    // scheme-2 also gets its own token rows (not merged into scheme-1)
    expect(
      byId(rows).has('bloom.theme-setting.color-scheme.scheme-2.token.--color-bg'),
    ).toBe(true);
  });
});

describe('inventoryThemeSettings — flattened merchant-shape rows', () => {
  it('flattens nested merchant shape into per-leaf rows', () => {
    const rows = inventoryThemeSettings(baseInput());
    const ids = byId(rows);
    const pbBg = ids.get(
      'bloom.theme-setting.color-scheme.scheme-1.merchant.primaryButton.background',
    )!;
    expect(pbBg).toBeDefined();
    // expected merchant value produced by the injected normalizer
    expect(pbBg.defaultValue).toBe('#111111');
    const bg = ids.get(
      'bloom.theme-setting.color-scheme.scheme-1.merchant.background',
    )!;
    expect(bg.defaultValue).toBe('#ffffff');
  });

  it('does not emit merchant rows for id/name identity keys as tokens', () => {
    const rows = inventoryThemeSettings(baseInput());
    // merchant.id / merchant.name are identity, represented by the name row, not
    // duplicated as merchant leaves.
    expect(
      byId(rows).has('bloom.theme-setting.color-scheme.scheme-1.merchant.id'),
    ).toBe(false);
  });
});

describe('inventoryThemeSettings — theme-level manifest constraint rows', () => {
  it('emits a constraint row under bloom.theme-setting.constraint.<Name>', () => {
    const rows = inventoryThemeSettings(baseInput());
    const c = byId(rows).get('bloom.theme-setting.constraint.colorSchemes')!;
    expect(c).toBeDefined();
    expect(c.constraints?.manifest).toMatchObject({ max: 4 });
    expect(c.status).toBe('PASS');
  });
});

describe('inventoryThemeSettings — determinism and sorting', () => {
  it('rows are sorted by id and identical across runs', () => {
    const a = inventoryThemeSettings(baseInput());
    const b = inventoryThemeSettings(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const sortedIds = a.map((r) => r.id);
    expect(sortedIds).toEqual([...sortedIds].sort());
  });
});
