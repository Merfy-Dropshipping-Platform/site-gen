/**
 * Central release-contract registry (Task 3).
 *
 * This module is the single generic shape + exact map that binds each supported
 * theme to its confirmed `ThemeReleaseContract`. It is a stable import/map layer
 * only: it imports the two theme-owned release-contract constants and exposes the
 * generic `ThemeReleaseContract` type consumed by the landed structural checks.
 * It carries NO inline policy data — every requirement/decision literal lives in
 * the per-theme `*-release-contract.ts` modules, which are input ONLY to their
 * own theme digest (the provenance boundary).
 *
 * A `ConformanceTier` is a required behavior/structural dimension a flow must
 * report; only the structural tier may enter a theme's tracked structural
 * baseline (see `collectTierGateFindings`). An `externalAudits` array records the
 * exact audited cross-service SHAs a human reviewer inspected — it is
 * evidence-only provenance and is never read by site-gen CI.
 */

import type { SupportedConformanceTheme } from './theme-adapter';
import type { ExternalAuditRef } from './source-types';
import type { ConformanceTier } from '../../../packages/theme-contract/conformance';

// ---------------------------------------------------------------------------
// Generic release-contract shape (extracted policy/data shape, no checks).
// ---------------------------------------------------------------------------

/** A required platform page: manifest seed + `PAGE_REGISTRY` route. */
export interface ReleasePageRequirement {
  id: string;
  route: string;
  /**
   * The dedicated standalone content/source file this page requires, or `null`
   * when the page is a composed content page with no standalone Astro source.
   */
  contentFile: string | null;
  /**
   * Whether the registry/composer explicitly permits a home-shell fallback for
   * this route (recorded SEPARATELY from `contentFile`: a route may have no
   * dedicated Astro page yet still be mandatory via manifest + seed + composed
   * live output).
   */
  shellFallbackAllowed: boolean;
}

/** A required flow/capability with the tiers it must report + its provenance. */
export interface ReleaseFlowRequirement {
  capabilityId: string;
  requiredTiers: readonly ConformanceTier[];
  sourceRefs: readonly string[];
}

/**
 * The confirmed release contract for ONE theme: the requirements structural
 * checks are measured against, plus the explicit open decisions that must emit
 * `NEEDS_DECISION` (never a silent waiver). It contains ONLY approved
 * requirements + open decisions for its own theme; cross-theme policy never
 * leaks in.
 */
export interface ThemeReleaseContract<T extends SupportedConformanceTheme> {
  theme: T;
  pages: readonly ReleasePageRequirement[];
  /** required feature flags (must be declared AND enabled). */
  requiredFeatures: Readonly<Record<string, boolean>>;
  /** required runtime source files (repo-relative). */
  requiredRuntimeSources: readonly string[];
  /** required renderer names (from the platform registries + section map). */
  requiredRendererNames: readonly string[];
  /** required flows + the tiers each must report. */
  requiredFlows: readonly ReleaseFlowRequirement[];
  /** capability IDs whose resolution is deferred → they emit NEEDS_DECISION. */
  decisionCapabilityIds: readonly string[];
  /** evidence-only audited cross-service refs; never read by CI digest code. */
  externalAudits: readonly ExternalAuditRef[];
}

/** The full release-contract registry: every supported theme → its contract. */
export type ThemeReleaseContractMap = {
  readonly [T in SupportedConformanceTheme]: Readonly<ThemeReleaseContract<T>>;
};

// ---------------------------------------------------------------------------
// The exact map. Import-only — no inline policy data here.
// ---------------------------------------------------------------------------

import { BLOOM_THEME_RELEASE_CONTRACT } from './bloom-release-contract';
import { SATIN_RELEASE_CONTRACT } from './satin-release-contract';

export const THEME_RELEASE_CONTRACTS = {
  bloom: BLOOM_THEME_RELEASE_CONTRACT,
  satin: SATIN_RELEASE_CONTRACT,
} satisfies ThemeReleaseContractMap;

/** The set of themes with a registered release contract. */
const REGISTERED = new Set<SupportedConformanceTheme>(
  Object.keys(THEME_RELEASE_CONTRACTS) as SupportedConformanceTheme[],
);

function isRegistered(theme: string): theme is SupportedConformanceTheme {
  return REGISTERED.has(theme as SupportedConformanceTheme);
}

/**
 * Resolve a theme's release contract. Non-registered / path-like names throw; a
 * theme name never resolves an arbitrary filesystem root.
 */
export function getThemeReleaseContract<T extends SupportedConformanceTheme>(
  theme: T,
): ThemeReleaseContract<T>;
export function getThemeReleaseContract(
  theme: string,
): ThemeReleaseContract<SupportedConformanceTheme>;
export function getThemeReleaseContract(
  theme: string,
): ThemeReleaseContract<SupportedConformanceTheme> {
  if (!isRegistered(theme)) {
    throw new Error(`unsupported theme release contract "${theme}"`);
  }
  return THEME_RELEASE_CONTRACTS[theme] as ThemeReleaseContract<SupportedConformanceTheme>;
}
