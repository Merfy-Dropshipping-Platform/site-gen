/**
 * Bloom-owned source adapter (Task 2).
 *
 * This module extracts, WITHOUT changing their values, the landed Bloom source
 * inputs that were previously inlined in `source-snapshot.ts`. It is the ONLY
 * source-side input to Bloom's theme digest: its `themeDigestInputs` name only
 * Bloom-owned files, while `sharedDigestInputs` enumerate the generic
 * implementation + central registry wiring that is byte-identical to Satin.
 *
 * Provenance-boundary change (reconciled at the post-Task-4 Bloom refresh): the
 * landed loader hashed the whole `src/themes/conformance/**` directory. That
 * broad glob is replaced ONCE here with an explicit shared list; Bloom-owned
 * conformance modules (`theme-descriptors/bloom.ts`, `bloom-source-adapter.ts`,
 * `bloom-release-contract.ts`) move to `themeDigestInputs`. No digest input
 * hashes a directory merely because it contains conformance code.
 */

import type {
  ThemeSourceAdapter,
  ExternalAuditRef,
} from './source-types';

/**
 * The generic shared core, IDENTICAL for Bloom and Satin. These are the generic
 * implementation modules, the three stable registry-wiring modules, the shared
 * pipeline helpers, the resolver/validator/controller/generator wiring, the
 * shared theme-base runtime + effective base blocks, the whole
 * `packages/theme-contract/conformance/**` implementation, and the workspace /
 * lock / Docker / root-manifest / build-script topology. Both theme adapters
 * spread this exact list so the shared partition can never drift between themes.
 */
export const SHARED_DIGEST_INPUTS: readonly string[] = [
  // --- shared theme-base runtime (dir; hashed recursively) ---
  'packages/theme-base/runtime',
  // --- extracted pipeline helpers + resolver/validator/controller/generator ---
  'scripts/lib/block-source-layout.mjs',
  'src/themes/block-artifact-resolver.ts',
  'src/generator/block-assembly-layout.ts',
  'src/themes/cart-drawer-contract.ts',
  'src/themes/preview-cart-contract.ts',
  'src/themes/theme-puck-block-catalog.ts',
  'src/controllers/theme-puck-config.controller.ts',
  'src/controllers/preview.controller.ts',
  'src/generator/assemble-from-packages.ts',
  'src/generator/build.service.ts',
  'src/themes/page-blocks.ts',
  'scripts/compile-astro-blocks.mjs',
  'scripts/compile-theme-sections.mjs',
  // --- generic conformance implementation + central registry wiring ---
  //     (theme-owned conformance modules are NOT here — see themeDigestInputs).
  'src/themes/conformance/source-snapshot.ts',
  'src/themes/conformance/source-types.ts',
  'src/themes/conformance/check-compiled-imports.mjs',
  'src/themes/conformance/storefront-inventory.ts',
  'src/themes/conformance/structural-checks.ts',
  'src/themes/conformance/cli.ts',
  'src/themes/conformance/index.ts',
  'src/themes/conformance/load-puck-config.ts',
  'src/themes/conformance/theme-adapter.ts',
  'src/themes/conformance/theme-adapters.ts',
  'src/themes/conformance/source-adapters.ts',
  'src/themes/conformance/release-contracts.ts',
  // --- whole shared conformance contract implementation (dir; recursive) ---
  'packages/theme-contract/conformance',
  // --- workspace / lock / docker / root manifest ---
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'Dockerfile',
  'package.json',
] as const;

/** Bloom carries no external audit evidence (Satin owns the cross-service refs). */
const BLOOM_EXTERNAL_AUDITS: readonly ExternalAuditRef[] = [] as const;

/**
 * Bloom-owned digest inputs. Bloom's package + standalone bytes, its owned
 * conformance modules, its generator registry and (once Task 3 creates them) its
 * tracked normative artifacts. Directory entries are hashed recursively; missing
 * paths are ENOENT-tolerant so pre-Task-3 runs still work.
 */
const BLOOM_THEME_DIGEST_INPUTS: readonly string[] = [
  'packages/theme-bloom',
  'themes/bloom',
  'src/generator/registries/bloom.ts',
  'src/themes/conformance/theme-descriptors/bloom.ts',
  'src/themes/conformance/bloom-source-adapter.ts',
  'src/themes/conformance/bloom-release-contract.ts',
  // tracked normative artifacts (created by Task 3; ENOENT-tolerant until then).
  'conformance/decisions/bloom.v1.md',
  'conformance/requirements/bloom.v1.json',
  'conformance/requirements/bloom.revisions.json',
] as const;

export const BLOOM_SOURCE_ADAPTER: ThemeSourceAdapter<'bloom'> = {
  theme: 'bloom',
  packageRoot: 'packages/theme-bloom',
  standaloneRoot: 'themes/bloom',
  sectionMapPath: 'themes/bloom/sections.map.json',
  generatorRegistryPath: 'src/generator/registries/bloom.ts',
  requiredRuntimeSources: [
    // theme-base runtime files the landed Bloom snapshot records
    // (nt-cart.ts / placeholders.ts are asserted by the landed Bloom spec).
    'packages/theme-base/runtime/nt-cart.ts',
    'packages/theme-base/runtime/placeholders.ts',
  ],
  compiledArtifactRoots: [
    'dist/astro-blocks',
    'dist/theme-sections/bloom',
    'dist/theme-preview/bloom',
    'dist/theme-live/bloom',
  ],
  themeDigestInputs: BLOOM_THEME_DIGEST_INPUTS,
  sharedDigestInputs: SHARED_DIGEST_INPUTS,
  externalAudits: BLOOM_EXTERNAL_AUDITS,
};
