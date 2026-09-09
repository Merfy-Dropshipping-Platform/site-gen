/**
 * Satin-owned source adapter (Task 2).
 *
 * This module is the ONLY source-side input to Satin's theme digest. It supplies
 * the exact repo-relative roots + imports the generic `loadThemeSourceSnapshot`
 * needs, and it partitions the digest into a theme-owned list (Satin bytes +
 * Satin conformance modules + Satin generator registry + tracked normative
 * artifacts) and the SAME shared core Bloom uses (spread from
 * `SHARED_DIGEST_INPUTS`, so the shared partition can never drift).
 *
 * `externalAudits` records the exact audited cross-service refs from the plan's
 * Global constraints as EVIDENCE-ONLY literal metadata. It is not a claim that
 * site-gen CI exercised those repositories; the digest code never reads the
 * outer Merfy repo or any sibling repository.
 */

import type {
  ThemeSourceAdapter,
  ExternalAuditRef,
} from './source-types';
import { SHARED_DIGEST_INPUTS } from './bloom-source-adapter';

/**
 * Required Satin runtime sources (repo-relative). This is a REQUIRED SUBSET, not
 * a filter: recursive route discovery in the snapshot adds every additional
 * `.astro`/`.js` route under `themes/satin/src/pages`. A missing entry here is a
 * reported structural fact, never silently dropped.
 */
const SATIN_REQUIRED_RUNTIME_SOURCES: readonly string[] = [
  'themes/satin/src/layouts/Layout.astro',
  'themes/satin/src/lib/auth.ts',
  'themes/satin/src/lib/cart.ts',
  'themes/satin/src/lib/cart-thumb-html.ts',
  'themes/satin/src/lib/nt-cart-satin.ts',
  'themes/satin/src/lib/storefront-hydrate.ts',
  'themes/satin/src/lib/wishlist.ts',
  'themes/satin/src/pages/cart.astro',
  'themes/satin/src/pages/checkout.astro',
  'themes/satin/src/pages/catalog.astro',
  'themes/satin/src/pages/product.astro',
  'themes/satin/src/pages/wishlist.astro',
  'themes/satin/src/pages/login.astro',
  'themes/satin/src/pages/register.astro',
  'themes/satin/src/pages/reset-password.astro',
  'themes/satin/src/pages/verify.astro',
  'themes/satin/src/pages/verify-email.astro',
  'themes/satin/src/pages/account/index.astro',
  'themes/satin/src/pages/account/profile.astro',
  'themes/satin/src/pages/account/orders.astro',
  'themes/satin/src/pages/account/order.astro',
  'themes/satin/src/pages/blog/index.astro',
  'themes/satin/src/pages/blog/[...slug].astro',
  'themes/satin/src/pages/legal/[slug].astro',
  'themes/satin/src/scripts/gsap/cart-drawer.ts',
  'themes/satin/src/scripts/gsap/search.ts',
] as const;

/**
 * Evidence-only audited external provenance refs, taken verbatim from the plan's
 * Global constraints. `evidenceOnly: true` marks these as review evidence, never
 * a CI assertion; the digest code never reads these repositories.
 */
export const SATIN_EXTERNAL_AUDITS: readonly ExternalAuditRef[] = [
  {
    repository: 'MerfyFrontend',
    ref: 'd3bc7581971bde7f420c58e370a5ee462f5e1bce',
    scope: ['constructor', 'admin'],
    evidenceOnly: true,
  },
  {
    repository: 'orders',
    ref: '7333e8498110a6cd43109ec6456e0d0f66dc2c1e',
    scope: ['src'],
    evidenceOnly: true,
  },
  {
    repository: 'api-gateway',
    ref: '758a136f5f636f7c95d65b8276403ae39c2eb422',
    scope: ['src'],
    evidenceOnly: true,
  },
] as const;

/**
 * Satin-owned digest inputs. Satin's package + standalone bytes, its owned
 * conformance modules, its generator registry and (once Task 3 creates them) its
 * tracked normative artifacts. Directory entries are hashed recursively; missing
 * paths are ENOENT-tolerant so pre-Task-3 runs still work.
 */
const SATIN_THEME_DIGEST_INPUTS: readonly string[] = [
  'packages/theme-satin',
  'themes/satin',
  'src/generator/registries/satin.ts',
  'src/themes/conformance/theme-descriptors/satin.ts',
  'src/themes/conformance/satin-source-adapter.ts',
  'src/themes/conformance/satin-release-contract.ts',
  // tracked normative artifacts (created by Task 3; ENOENT-tolerant until then).
  'conformance/decisions/satin.v1.md',
  'conformance/requirements/satin.v1.json',
  'conformance/requirements/satin.revisions.json',
] as const;

export const SATIN_SOURCE_ADAPTER: ThemeSourceAdapter<'satin'> = {
  theme: 'satin',
  packageRoot: 'packages/theme-satin',
  standaloneRoot: 'themes/satin',
  sectionMapPath: 'themes/satin/sections.map.json',
  generatorRegistryPath: 'src/generator/registries/satin.ts',
  requiredRuntimeSources: SATIN_REQUIRED_RUNTIME_SOURCES,
  compiledArtifactRoots: [
    'dist/astro-blocks',
    'dist/theme-sections/satin',
    'dist/theme-preview/satin',
    'dist/theme-live/satin',
  ],
  themeDigestInputs: SATIN_THEME_DIGEST_INPUTS,
  sharedDigestInputs: SHARED_DIGEST_INPUTS,
  externalAudits: SATIN_EXTERNAL_AUDITS,
};
