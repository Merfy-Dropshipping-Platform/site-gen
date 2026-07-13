/**
 * Recursive Theme Settings inventory.
 *
 * Emits INDIVIDUAL capability rows — never one opaque row per scheme:
 *   - bloom.theme-setting.token.--radius-button           (per default token)
 *   - bloom.theme-setting.color-scheme.scheme-1.name
 *   - bloom.theme-setting.color-scheme.scheme-1.token.--color-bg
 *   - bloom.theme-setting.color-scheme.scheme-1.merchant.primaryButton.background
 *   - bloom.theme-setting.constraint.<Name>               (theme-level manifest)
 *
 * Expected merchant values come from an injected normalizer structurally
 * compatible with `themeSchemeToMerchantShape`; this module imports nothing from
 * the site-gen runtime. Editable/effect rows start `UNKNOWN`; structural
 * constraint rows start `PASS`. Exact manifest/runtime values stay in
 * `defaultValue`.
 */

import type { CapabilityRecord, FieldConstraints } from './types';
import { makeCapabilityId, sortById } from './ids';

export interface ThemeSchemeInput {
  id: string;
  name: string;
  tokens: Record<string, string>;
}

export interface ThemeSettingsInput {
  theme: string;
  /** top-level default tokens (manifest/runtime). */
  tokens: Record<string, string>;
  schemes: ThemeSchemeInput[];
  /** theme-level manifest constraints keyed by name (e.g. { colorSchemes: {max:4} }). */
  manifestConstraints?: Record<string, unknown>;
  /** injected normalizer, structurally compatible with themeSchemeToMerchantShape. */
  normalizeMerchantShape: (scheme: ThemeSchemeInput) => Record<string, unknown>;
}

// Identity keys of the merchant shape that are represented elsewhere (name row)
// and must not be duplicated as merchant leaves.
const MERCHANT_IDENTITY_KEYS = new Set(['id', 'name']);

function editableSettingRow(
  theme: string,
  segments: string[],
  value: unknown,
  sourceKind: string,
  sourceRef: string,
): CapabilityRecord {
  return {
    id: makeCapabilityId(theme, 'theme-setting', ...segments),
    theme,
    surface: 'theme-setting',
    capability: segments.join('.'),
    ...(value !== undefined ? { defaultValue: value } : {}),
    editable: true,
    persisted: true,
    container: 'leaf',
    scenarios: [],
    modes: ['hot-preview', 'initial-preview', 'live'],
    viewports: ['desktop', 'mobile'],
    caseResults: [],
    sources: [{ kind: sourceKind, ref: sourceRef }],
    status: 'UNKNOWN',
    failureIds: [],
  };
}

/** Flatten a nested merchant-shape object into dotted leaf paths (arrays as leaves). */
function flattenMerchant(
  obj: Record<string, unknown>,
  prefix: string[],
): Array<{ path: string[]; value: unknown }> {
  const out: Array<{ path: string[]; value: unknown }> = [];
  for (const [key, value] of Object.entries(obj)) {
    if (prefix.length === 0 && MERCHANT_IDENTITY_KEYS.has(key)) continue;
    const path = [...prefix, key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenMerchant(value as Record<string, unknown>, path));
    } else {
      out.push({ path, value });
    }
  }
  return out;
}

export function inventoryThemeSettings(input: ThemeSettingsInput): CapabilityRecord[] {
  const { theme } = input;
  const rows: CapabilityRecord[] = [];

  // Per-token top-level rows.
  for (const [token, value] of Object.entries(input.tokens)) {
    rows.push(editableSettingRow(theme, ['token', token], value, 'manifest-token', token));
  }

  // Per-scheme rows.
  for (const scheme of input.schemes) {
    const schemeSeg = scheme.id;
    // scheme name row
    rows.push(
      editableSettingRow(
        theme,
        ['color-scheme', schemeSeg, 'name'],
        scheme.name,
        'manifest-scheme',
        scheme.id,
      ),
    );
    // raw manifest token rows
    for (const [token, value] of Object.entries(scheme.tokens)) {
      rows.push(
        editableSettingRow(
          theme,
          ['color-scheme', schemeSeg, 'token', token],
          value,
          'manifest-scheme-token',
          `${scheme.id}:${token}`,
        ),
      );
    }
    // flattened merchant-shape rows
    const shape = input.normalizeMerchantShape(scheme);
    for (const { path, value } of flattenMerchant(shape, [])) {
      rows.push(
        editableSettingRow(
          theme,
          ['color-scheme', schemeSeg, 'merchant', ...path],
          value,
          'merchant-shape',
          `${scheme.id}:${path.join('.')}`,
        ),
      );
    }
  }

  // Theme-level manifest constraint rows (structural PASS).
  if (input.manifestConstraints) {
    for (const [name, value] of Object.entries(input.manifestConstraints)) {
      const constraints: FieldConstraints = {
        manifest: (value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : { value }) as Record<string, unknown>,
      };
      rows.push({
        id: makeCapabilityId(theme, 'theme-setting', 'constraint', name),
        theme,
        surface: 'theme-setting',
        capability: `constraint.${name}`,
        editable: false,
        persisted: false,
        container: 'decorative',
        constraints,
        scenarios: [],
        modes: [],
        viewports: [],
        sources: [{ kind: 'manifest-constraint', ref: name }],
        status: 'PASS',
        failureIds: [],
      });
    }
  }

  return sortById(rows);
}
