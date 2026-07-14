/**
 * Central theme-adapter registry + resolvers (Task 1).
 *
 * This module is a stable import/map layer only: it imports the two theme-owned
 * descriptors and exposes the generic resolvers the conformance harness uses.
 * It carries no theme-owned literal data (paths/ACK names/findings live in the
 * per-theme descriptor modules) — this partition is the provenance boundary
 * between shared input (this file) and per-theme digest input (each descriptor).
 *
 * A theme becomes RUNNABLE only when it has, in addition to its path/ACK
 * descriptor, a registered source adapter AND a release contract for the same
 * ID. Both Bloom and Satin now have all three (Satin's release contract landed
 * in Task 3), so `resolveRunnableTheme` returns a complete bundle for each. The
 * bundle additionally asserts the source-adapter and release-contract
 * external-audit arrays are deep-equal — a mismatch is a harness failure BEFORE
 * any artifact read, never two competing provenance sets.
 */

import {
  getThemeBuildPlan,
  type SupportedConformanceTheme,
  type ThemeDescriptorModeMap,
  type ThemeConformanceAdapter,
  type ThemeDescriptorRegistry,
} from './theme-adapter';
import { BLOOM_THEME_DESCRIPTOR } from './theme-descriptors/bloom';
import { SATIN_THEME_DESCRIPTOR } from './theme-descriptors/satin';

import { loadThemeSourceSnapshot } from './source-snapshot';
import {
  THEME_RELEASE_CONTRACTS,
  type ThemeReleaseContract,
} from './release-contracts';
import {
  THEME_SOURCE_ADAPTERS,
} from './source-adapters';
import type { ThemeSourceAdapter, ExternalAuditRef } from './source-types';
import type { ThemeSourceSnapshot } from './source-types';

export { getThemeBuildPlan };
export type {
  SupportedConformanceTheme,
  ThemeConformanceAdapter,
  ThemeDescriptorRegistry,
} from './theme-adapter';

// ---------------------------------------------------------------------------
// The central descriptor map. Wiring only — no theme-owned literal data here.
// ---------------------------------------------------------------------------

export const THEME_DESCRIPTORS = {
  bloom: BLOOM_THEME_DESCRIPTOR,
  satin: SATIN_THEME_DESCRIPTOR,
} satisfies ThemeDescriptorRegistry;

/** The set of registered theme IDs, used to reject arbitrary/path-like names. */
const REGISTERED_THEMES = new Set<SupportedConformanceTheme>(
  Object.keys(THEME_DESCRIPTORS) as SupportedConformanceTheme[],
);

function isRegisteredTheme(theme: string): theme is SupportedConformanceTheme {
  return REGISTERED_THEMES.has(theme as SupportedConformanceTheme);
}

// ---------------------------------------------------------------------------
// Descriptor resolution — never accepts an arbitrary filesystem root.
// ---------------------------------------------------------------------------

/**
 * Resolve a theme's descriptor. Luna is rejected explicitly (excluded from the
 * release train); every other non-registered value — including a path-like name
 * — throws. A theme name can only select a registered descriptor, never an
 * arbitrary filesystem root.
 */
export function getThemeDescriptor<T extends SupportedConformanceTheme>(
  theme: T,
): ThemeConformanceAdapter<T, ThemeDescriptorModeMap[T]>;
export function getThemeDescriptor(
  theme: string,
): ThemeConformanceAdapter<SupportedConformanceTheme, 'legacy' | 'tiered'>;
export function getThemeDescriptor(
  theme: string,
): ThemeConformanceAdapter<SupportedConformanceTheme, 'legacy' | 'tiered'> {
  if (theme === 'luna') {
    throw new Error('theme "luna" is excluded from the release train');
  }
  if (!isRegisteredTheme(theme)) {
    throw new Error(`unsupported theme "${theme}"`);
  }
  return THEME_DESCRIPTORS[theme] as ThemeConformanceAdapter<
    SupportedConformanceTheme,
    'legacy' | 'tiered'
  >;
}

// ---------------------------------------------------------------------------
// Runnable bundle — descriptor + source adapter + release contract.
// ---------------------------------------------------------------------------

/**
 * A theme's runnable conformance bundle: the descriptor plus its registered
 * source adapter (loads the real source snapshot) and its release contract. Only
 * themes that have all three become runnable.
 */
export interface RunnableThemeBundle<T extends SupportedConformanceTheme> {
  descriptor: ThemeConformanceAdapter<T, ThemeDescriptorModeMap[T]>;
  loadSourceSnapshot: (
    themeId?: string,
    opts?: { reviewedRequirementsFixture?: Buffer | null },
  ) => Promise<ThemeSourceSnapshot>;
  /** the theme's source adapter (digest partition + provenance). */
  sourceAdapter: ThemeSourceAdapter<T>;
  /** alias of {@link sourceAdapter} — the plan's `bundle.source.theme` check. */
  source: ThemeSourceAdapter<T>;
  /** the theme's confirmed release contract (generic shape). */
  releaseContract: ThemeReleaseContract<T>;
}

/**
 * The per-theme snapshot loader. Both themes resolve the SAME generic loader,
 * which reads the theme's registered source adapter from the theme id; a `null`
 * entry (should one ever exist) is a hard, reported incompleteness — never a
 * placeholder that lets a fake pipeline compile.
 */
const SNAPSHOT_LOADERS: Readonly<
  Record<
    SupportedConformanceTheme,
    | ((
        themeId?: string,
        opts?: { reviewedRequirementsFixture?: Buffer | null },
      ) => Promise<ThemeSourceSnapshot>)
    | null
  >
> = {
  bloom: loadThemeSourceSnapshot,
  satin: loadThemeSourceSnapshot,
};

/**
 * The ordered runnable inputs a theme MUST supply for the same ID. A missing
 * entry (path/ACK descriptor, source adapter, snapshot loader, release contract)
 * is a harness failure reported BEFORE any artifact read.
 */
function missingRunnableInputs(theme: SupportedConformanceTheme): string[] {
  const missing: string[] = [];
  if (!(theme in THEME_SOURCE_ADAPTERS)) missing.push('source-adapter');
  if (SNAPSHOT_LOADERS[theme] == null) missing.push('source-adapter');
  if (!(theme in THEME_RELEASE_CONTRACTS)) missing.push('release-contract');
  return missing;
}

/** Deep structural equality for the two audit-ref arrays (order-sensitive). */
function externalAuditsEqual(
  a: readonly ExternalAuditRef[],
  b: readonly ExternalAuditRef[],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Resolve a theme to a complete runnable bundle, or reject.
 *
 * Rejection happens BEFORE any artifact read:
 *  - Luna / unknown / path-like names fail via `getThemeDescriptor`;
 *  - a registered theme whose runnable inputs are incomplete rejects with the
 *    exact harness error
 *    `theme <id> is registered but incomplete: <missing...>`;
 *  - a theme whose source-adapter and release-contract external-audit arrays
 *    disagree rejects with a mismatch error (never two competing provenance
 *    sets).
 */
export async function resolveRunnableTheme<T extends SupportedConformanceTheme>(
  theme: T,
): Promise<RunnableThemeBundle<T>>;
export async function resolveRunnableTheme(
  theme: string,
): Promise<RunnableThemeBundle<SupportedConformanceTheme>>;
export async function resolveRunnableTheme(
  theme: string,
): Promise<RunnableThemeBundle<SupportedConformanceTheme>> {
  const descriptor = getThemeDescriptor(theme);
  const id = descriptor.id;
  const missing = missingRunnableInputs(id);
  if (missing.length > 0) {
    throw new Error(
      `theme ${id} is registered but incomplete: ${missing.join(', ')}`,
    );
  }
  const sourceAdapter = THEME_SOURCE_ADAPTERS[id];
  const releaseContract = THEME_RELEASE_CONTRACTS[id];
  // The source adapter and release contract must agree on provenance — deep-equal
  // external-audit arrays, or the harness fails rather than report two competing
  // provenance sets.
  if (!externalAuditsEqual(sourceAdapter.externalAudits, releaseContract.externalAudits)) {
    throw new Error(
      `theme ${id} provenance mismatch: source-adapter and release-contract external audits differ`,
    );
  }
  return {
    descriptor,
    loadSourceSnapshot: SNAPSHOT_LOADERS[id]!,
    sourceAdapter,
    source: sourceAdapter,
    releaseContract,
  };
}
