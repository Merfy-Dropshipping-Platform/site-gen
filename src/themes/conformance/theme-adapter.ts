/**
 * Typed theme-adapter registry contract (Task 1).
 *
 * The registry binds a theme ID to its package/root and artifact mode. It is the
 * single, generic shape that the conformance harness resolves before it touches
 * any filesystem. Theme-owned literal data (paths, ACK names, findings) lives in
 * the per-theme descriptor modules under `theme-descriptors/`; this file holds
 * only the generic types + the build-plan helper.
 *
 * Provenance boundary: the central registry (`theme-adapters.ts`) is shared
 * input, while each descriptor module is input only to its own theme digest. No
 * `unknown`/`any`/stringly-typed callback registry is permitted — a theme name
 * can only select a registered descriptor, never an arbitrary filesystem root.
 */

/** The only themes this release train registers. Luna is excluded on purpose. */
export type SupportedConformanceTheme = 'bloom' | 'satin';

// ---------------------------------------------------------------------------
// Artifact paths (mode-discriminated)
// ---------------------------------------------------------------------------

/** Legacy (Bloom) artifact layout: a single structural baseline, no tiers. */
export interface LegacyArtifactPaths {
  mode: 'legacy';
  requirements: string;
  inventory: string;
  structuralBaseline: string;
  reportDir: string;
}

/** Tiered (Satin) artifact layout: structural baseline + a tier manifest. */
export interface TieredArtifactPaths {
  mode: 'tiered';
  requirements: string;
  inventory: string;
  structuralBaseline: string;
  tierManifest: string;
  reportDir: string;
}

export type ThemeArtifactPaths = LegacyArtifactPaths | TieredArtifactPaths;

// ---------------------------------------------------------------------------
// Mutation acknowledgements (mode-discriminated)
// ---------------------------------------------------------------------------

/** Legacy (Bloom) ack env-var names for the ack-gated mutation modes. */
export interface LegacyMutationAcks {
  mode: 'legacy';
  capture: string;
  shrink: string;
  inventory: string;
  appendRequirements: string;
}

/** Tiered (Satin) acks: the legacy set plus a semantic-revise ack. */
export interface TieredMutationAcks extends Omit<LegacyMutationAcks, 'mode'> {
  mode: 'tiered';
  reviseSemantic: string;
}

export type ThemeMutationAcks = LegacyMutationAcks | TieredMutationAcks;

// ---------------------------------------------------------------------------
// The per-theme adapter descriptor
// ---------------------------------------------------------------------------

/**
 * A theme's conformance descriptor: its identity, its workspace package/root, its
 * standalone theme root and its mode-matched artifact paths + mutation acks. The
 * `M` type parameter forces `paths`/`mutationAcks` to share the theme's mode, so
 * a legacy theme can never carry a tier manifest and a tiered theme can never
 * omit it.
 */
export interface ThemeConformanceAdapter<
  T extends SupportedConformanceTheme,
  M extends ThemeArtifactPaths['mode'],
> {
  id: T;
  packageName: `@merfy/theme-${T}`;
  packageRoot: `packages/theme-${T}`;
  standaloneRoot: `themes/${T}`;
  paths: Extract<ThemeArtifactPaths, { mode: M }>;
  mutationAcks: Extract<ThemeMutationAcks, { mode: M }>;
}

/** The compile-time mode each registered theme uses. */
export interface ThemeDescriptorModeMap {
  bloom: 'legacy';
  satin: 'tiered';
}

/** The full registry: every supported theme mapped to its mode-matched adapter. */
export type ThemeDescriptorRegistry = {
  readonly [T in SupportedConformanceTheme]: ThemeConformanceAdapter<
    T,
    ThemeDescriptorModeMap[T]
  >;
};

// ---------------------------------------------------------------------------
// Build plan
// ---------------------------------------------------------------------------

/** One deterministic build step in a theme's conformance build plan. */
export type ThemeBuildStep<T extends SupportedConformanceTheme> =
  | { kind: 'service-build' }
  | { kind: 'blocks-build' }
  | { kind: 'sections-build'; theme: T }
  | { kind: 'standalone-build'; theme: T };

/**
 * The four deterministic build steps that must precede a theme's conformance
 * run: the service build, the shared block build, then the theme's section build
 * and standalone build. Order is load-bearing (each step's outputs feed the
 * next); the harness prints exactly this order when a prerequisite is missing.
 */
export function getThemeBuildPlan<T extends SupportedConformanceTheme>(
  theme: T,
): readonly ThemeBuildStep<T>[] {
  return [
    { kind: 'service-build' },
    { kind: 'blocks-build' },
    { kind: 'sections-build', theme },
    { kind: 'standalone-build', theme },
  ];
}
